import { Request, Response } from "express";
import {
  createChat,
  getChatById,
  getChatsByUser,
  addChatMessage,
  updateChatTitle,
  updateSuggestedQuestions,
  IChat,
  updateChatFeedback,
  updateChatMode,
} from "../../models/Chat";
import { chatService } from "../../services/chat.service";
import { ModelMessage, streamText, pipeTextStreamToResponse } from "ai";
// import { google } from "@ai-sdk/google";
import { aiConfig } from "../../config/ai";
import { aiService } from "../../services/ai.service";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Controller for Handing Conversations
 */

const google = createGoogleGenerativeAI({
  apiKey: aiConfig.gemini.apiKey,
});

export const createConversation = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { title, linkedDocuments, mode, userQuery } = req.body;

  try {
    let initialTitle = title || "New Discussion";

    // If user provides a query at creation, generate a smart title from it
    if (userQuery) {
      const smartTitle = await generateSmartTitle("", userQuery, true);
      if (smartTitle) initialTitle = smartTitle;
    }

    const chat = await createChat(userId, {
      title: initialTitle,
      linkedDocuments: linkedDocuments || [],
      mode: mode || "default",
      messages: [],
    });

    res.status(201).json({ success: true, chat });
  } catch (error) {
    console.log("error creating conversastion", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create conversation" });
  }
};

export const getConversations = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  try {
    const chats = await getChatsByUser(userId);
    res.json({ success: true, chats });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch conversations" });
  }
};

export const getConversationById = async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user.id;

  try {
    const chat = await getChatById(String(conversationId), userId);
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    res.json({ success: true, chat });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch chat" });
  }
};

/**
 * The Core RAG Streaming Route
 */

export const sendMessage = async (req: Request, res: Response) => {
  const { conversationId } = req.params;

  const { mode } = req.body;
  // Accept both { message: string } and { messages: Message[] } (useChat default)
  const message: string =
    req.body.message ||
    req.body.messages?.[req.body.messages.length - 1]?.content;

  if (!message) {
    return res
      .status(400)
      .json({ success: false, message: "Message is required" });
  }

  const user = (req as any).user;
  if (!user || !user.id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const userId: string = user.id;
  const chatId: string = String(conversationId);

  try {
    const chat = await getChatById(chatId, userId);
    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    }

    if (chat.isInactive) {
      return res.status(403).json({
        success: false,
        message:
          "This conversation is inactive because its linked documents were removed.",
      });
    }

    // If mode is passed in request, persist it to the chat document
    let activeMode = chat.mode;
    if (
      mode &&
      (mode == "default" || mode == "comparison") &&
      mode != chat.mode
    ) {
      await updateChatMode(chatId, mode, userId);
      activeMode = mode;
    }

    const documentIds = (chat.linkedDocuments || []).map((doc: any) =>
      doc._id.toString(),
    );

    const { messages, systemPrompt, sources } =
      await chatService.prepareChatContext(
        message,
        userId,
        chat.messages as ModelMessage[],
        activeMode,
        documentIds,
      );

    // Send sources in response header before stream starts
    // Headers must be set before flushHeaders/writing body
    res.setHeader("X-Sources", JSON.stringify(sources));
    res.setHeader("Access-Control-Expose-Headers", "X-Sources"); // Required for CORS — frontend must be able to read it

    const result = streamText({
      model: google(aiConfig.gemini.model || "gemini-1.5-flash"),
      system: systemPrompt,
      messages,
      onFinish: async ({ text }) => {
        const userMsg = { role: "user" as const, content: message };
        const assistantMsg = {
          role: "assistant" as const,
          content: text,
          sources: sources.map((s: any) => ({
            fileName: s.fileName,
            pageNumber: s.pageNumber,
            chunkIndex: s.chunkIndex,
          })),
        };

        await addChatMessage(chatId, userMsg, userId);
        const updatedChat = await addChatMessage(chatId, assistantMsg, userId);

        // Background Tasks: Refine title and generate follow-up questions
        if (updatedChat && updatedChat.title === "New Discussion") {
          generateSmartTitle(chatId, text);
        }
        // generateSuggestedQuestions(chatId, text);
      },
    });

    // pipeTextStreamToResponse outputs in useChat-compatible format
    return pipeTextStreamToResponse({
      response: res,
      textStream: result.textStream,
      status: 200,
      headers: {
        "X-Sources": JSON.stringify(sources), //  move sources header here too
      },
    });
  } catch (error: any) {
    console.error("Streaming error:", error);

    // Specifically handle Gemini/AI SDK 503 (service unavailable) or 429 (rate limit)
    const statusCode = error.statusCode || 500;
    const isOverloaded =
      statusCode === 503 ||
      (error.message && error.message.includes("high demand"));

    if (!res.headersSent) {
      res.status(statusCode).json({
        success: false,
        message: isOverloaded
          ? "The model is currently experiencing high traffic. Please try again in a few moments."
          : "Message processing failed",
        errorType: isOverloaded ? "TRAFFIC_OVERLOAD" : "INTERNAL_ERROR",
      });
    }
  }
};

export const submitMessageFeedback = async (req: Request, res: Response) => {
  try {
    const { conversationId, messageId } = req.params;
    const { feedback, feedbackText } = req.body;
    const userId = (req as any).user.id;

    await updateChatFeedback(
      String(conversationId),
      String(messageId),
      feedback,
      userId,
      feedbackText,
    );
    return res.json({
      success: true,
      message:
        "Feedback submitted successfully. It will be used to improve future responses.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit feedback" });
  }
};

// export const sendMessage = async (req: Request, res: Response) => {
//   const { conversationId } = req.params;
//   const { message } = req.body;

//   const user = (req as any).user;
//   if (!user || !user.id) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }

//   const userId: string = user.id;
//   const chatId: string = String(conversationId);

//   try {
//     const chat = await getChatById(chatId, userId);
//     if (!chat) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Chat not found" });
//     }

//     const { messages, systemPrompt, sources } =
//       await chatService.prepareChatContext(
//         message,
//         userId,
//         chat.messages as ModelMessage[],
//         chat.mode,
//       );

//     // Set SSE headers manually
//     res.setHeader("Content-Type", "text/event-stream");
//     res.setHeader("Cache-Control", "no-cache");
//     res.setHeader("Connection", "keep-alive");
//     res.setHeader("X-Vercel-AI-Data-Stream", "v1");
//     res.flushHeaders();

//     // Write sources as a data event before streaming starts
//     res.write(
//       `data: ${JSON.stringify({ type: "sources", data: sources })}\n\n`,
//     );

//     const result = streamText({
//       model: google(aiConfig.gemini.model || "gemini-1.5-flash"),
//       system: systemPrompt,
//       messages,
//       onFinish: async ({ text }) => {
//         const userMsg = { role: "user" as const, content: message };
//         const assistantMsg = {
//           role: "assistant" as const,
//           content: text,
//           sources: sources.map((s: any) => ({
//             fileName: s.fileName,
//             pageNumber: s.pageNumber,
//             text: s.text,
//           })),
//         };

//         await addChatMessage(chatId, userMsg);
//         const updatedChat = await addChatMessage(chatId, assistantMsg);

//         if (
//           updatedChat &&
//           updatedChat.messages.length === 2 &&
//           updatedChat.title === "New Discussion"
//         ) {
//           generateSmartTitle(chatId, text);
//         }
//         // generateSuggestedQuestions(chatId, text);
//       },
//     });

//     // Pipe the text stream to response
//     const reader = result.textStream.getReader();
//     const decoder = new TextDecoder();

//     const pump = async () => {
//       try {
//         while (true) {
//           const { done, value } = await reader.read();
//           if (done) {
//             res.end();
//             break;
//           }
//           // Write each chunk as SSE data event
//           const chunk =
//             typeof value === "string" ? value : decoder.decode(value);
//           res.write(
//             `data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`,
//           );
//         }
//       } catch (err) {
//         console.error("Stream pump error:", err);
//         res.end();
//       }
//     };

//     await pump();
//   } catch (error) {
//     console.error("Streaming error:", error);
//     if (!res.headersSent) {
//       res
//         .status(500)
//         .json({ success: false, message: "Message processing failed" });
//     }
//   }
// };

// export const sendMessage = async (req: Request, res: Response) => {
//   const { conversationId } = req.params;
//   const { message } = req.body;

//   // Fix: Type checking for user.id to avoid "string | undefined" errors
//   const user = (req as any).user;
//   if (!user || !user.id) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }
//   const userId: string = user.id;

//   try {
//     const chat = await getChatById(String(conversationId), userId);
//     if (!chat) {
//       return res.status(404).json({ success: false, message: "Chat not found" });
//     }

//     // 1. Prepare Context (Retrieval & Reranking)
//     const { messages, systemPrompt, sources } = await chatService.prepareChatContext(
//       message,
//       userId,
//       chat.messages as ModelMessage[], // Cast to correct SDK type
//       chat.mode
//     );

//     // 2. Open Data Stream for Node.js/Express
//     // In v6, pipeDataStreamToResponse is a standalone function for Express
//     return pipeDataStreamToResponse(res, {
//       execute: async (dataStream) => {
//         // ✅ Fix: Use writeData to send custom source parts
//         dataStream.writeData({ type: "sources", data: sources });

//         const result = streamText({
//           model: google(aiConfig.gemini.model || "gemini-1.5-flash"),
//           system: systemPrompt,
//           messages: messages,
//           onFinish: async ({ text }) => {
//             // 3. Atomic Persistence
//             const userMsg = { role: "user" as const, content: message };
//             const assistantMsg = {
//               role: "assistant" as const,
//               content: text,
//               sources: sources.map((s: any) => ({
//                 fileName: s.fileName,
//                 pageNumber: s.pageNumber,
//                 text: s.text,
//               })),
//             };

//             await addChatMessage(conversationId, userMsg);
//             const updatedChat = await addChatMessage(conversationId, assistantMsg);

//             // 4. Background Tasks
//             if (
//               updatedChat &&
//               updatedChat.messages.length === 2 &&
//               updatedChat.title === "New Discussion"
//             ) {
//               generateSmartTitle(conversationId, text);
//             }
//             generateSuggestedQuestions(conversationId, text);
//           },
//         });

//         // ✅ Fix: In v6, merge result into the dataStream
//         result.mergeIntoDataStream(dataStream);
//       },
//     });
//   } catch (error) {
//     console.error("Streaming error:", error);
//     if (!res.headersSent) {
//       res.status(500).json({ success: false, message: "Message processing failed" });
//     }
//   }
// };

// export const sendMessage = async (req: Request, res: Response) => {
//   const { conversationId } = req.params;
//   const { message } = req.body;
//   const userId = (req as any).user.id;

//   try {
//     const chat = await getChatById(String(conversationId), userId);
//     if (!chat)
//       return res
//         .status(404)
//         .json({ success: false, message: "Chat not found" });

//     // 1. Prepare Context (Retrieval & Reranking happens here)
//     const { messages, systemPrompt, sources } =
//       await chatService.prepareChatContext(
//         message,
//         userId,
//         chat.messages,
//         chat.mode,
//       );

//     // 2. Open Data Stream
//     return createDataStreamResponse({
//       execute: (dataStream) => {
//         // Early delivery of sources
//         dataStream.writeData({ type: "sources", sources });

//         const result = streamText({
//           model: google(aiConfig.gemini.model || "gemini-2.5-flash"),
//           system: systemPrompt,
//           messages: messages as any,
//           onFinish: async ({ text }) => {
//             // 3. Atomic Persistence
//             const userMsg = { role: "user", content: message };
//             const assistantMsg = {
//               role: "assistant",
//               content: text,
//               sources: sources.map((s: any) => ({
//                 fileName: s.fileName,
//                 pageNumber: s.pageNumber,
//                 text: s.text, // If we want to store the snippet
//               })),
//             };

//             await addChatMessage(conversationId, userMsg);
//             const updatedChat = await addChatMessage(
//               conversationId,
//               assistantMsg,
//             );

//             // 4. Background Tasks: Title & Suggestions
//             // Only refine title if it's still the default or if we want a better one from response
//             if (
//               updatedChat &&
//               updatedChat.messages.length === 2 &&
//               updatedChat.title === "New Discussion"
//             ) {
//               generateSmartTitle(conversationId, text);
//             }
//             generateSuggestedQuestions(conversationId, text);
//           },
//         });

//         result.mergeIntoDataStream(dataStream);
//       },
//     });
//   } catch (error) {
//     console.error("Streaming error:", error);
//     res
//       .status(500)
//       .json({ success: false, message: "Message processing failed" });
//   }
// };

/**
 * GET /:conversationId/suggested-questions
 * Generates AI-powered suggested questions based on context.
 */
export const getSuggestedQuestions = async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user.id;

  try {
    const chat = await getChatById(String(conversationId), userId);
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });

    // For existing chats use the last assistant message as context.
    // For brand-new chats use the linked document names so the AI can
    // suggest meaningful opening questions.
    const assistantMessages = chat.messages.filter(
      (m: any) => m.role === "assistant",
    );
    // console.log("linkedDocuments", chat.linkedDocuments);
    // console.log("assistantMessages", assistantMessages);
    let context: string;
    if (assistantMessages.length > 0) {
      context = assistantMessages[assistantMessages.length - 1].content;
    } else {
      context = chat.linkedDocuments?.[0]?.summary;
    }

    const questions = await generateSuggestedQuestions(
      String(conversationId),
      context,
    );
    res.json({ success: true, questions });
  } catch (error) {
    console.error("Suggested questions error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate suggestions" });
  }
};

/**
 * Background Helpers
 */
async function generateSmartTitle(
  chatId: string,
  inputText: string,
  returnOnly = false,
) {
  // Simple AI call to generate a 3-word title
  const prompt = `Based on this ${returnOnly ? "user query" : "AI response"}, generate a concise 3-word title for this discussion. 
  TEXT: ${inputText.substring(0, 500)}
  RETURN ONLY THE TITLE.`;

  try {
    const { text } = await aiService.generateSimpleCompletion(prompt);
    const cleanedTitle = text.replace(/["']/g, "").trim();

    if (returnOnly) return cleanedTitle;

    await updateChatTitle(chatId, cleanedTitle);
  } catch (e) {
    console.error("Title generation failed", e);
  }
}

async function generateSuggestedQuestions(
  chatId: string,
  context: string,
): Promise<string[]> {
  const prompt = `Based on this context, suggest 3 highly relevant questions the user might ask a document-assistant.
  CONTEXT: ${context.substring(0, 600)}
  RETURN A JSON ARRAY OF STRINGS ONLY: ["Question 1", "Question 2", "Question 3"]`;

  try {
    const { text } = await aiService.generateSimpleCompletion(prompt, true);
    const questions: string[] = JSON.parse(text);
    await updateSuggestedQuestions(chatId, questions);
    return questions;
  } catch (e) {
    console.error("Suggested questions failed", e);
    return [];
  }
}
