import { type ModelMessage } from "ai"; // Use 'type' to help TS if needed
import { vectorService } from "./vector.service";
import { aiService } from "./ai.service";

export const chatService = {
  /**
   * Prepares history and context for the Vercel AI SDK
   */
  async prepareChatContext(userQuery: string, userId: string, history: any[]) {
    // 1. Get Vector & Reranked Context
    // We pass the string directly as our aiService handles the array internally
    const queryVectorArr = await aiService.createEmbeddings([userQuery]);
    const queryVector = queryVectorArr[0];

    const contextResults = await vectorService.getRelevantContext(
      queryVector,
      userId,
      userQuery,
    );

    // 2. Format Context for the Prompt
    const contextString = contextResults
      .map((res: any) => `CONTENT: ${res.text || ""}`)
      .join("\n\n---\n\n");

    // 3. Map History to CoreMessage with Feedback Injection
    // We limit to the last 6 messages as per the plan
    const coreMessages: ModelMessage[] = history.slice(-6).map((msg) => {
      let content = msg.content;

      // Inject feedback loop: This tells the AI WHY it failed previously
      if (msg.role === "assistant" && msg.feedback === "thumb_down") {
        content += `\n\n[USER FEEDBACK: This previous response was marked as incorrect. Correction needed: ${msg.feedbackText || "Please provide a more accurate answer."}]`;
      }

      return {
        role: msg.role === "user" ? "user" : "assistant",
        content: content,
      } as ModelMessage;
    });

    // 4. Construct System Instruction
    const systemPrompt = `You are Docu Whisper, an expert document assistant.
    Use the following context to answer the user's question. 
    If the answer is not in the context, say you don't know. 

    CONTEXT:
    ${contextString}

    INSTRUCTIONS:
    - Be concise and professional.
    - Use the [Source: filename | Page: X] info from the context to cite your answers.
    - If the user provided negative feedback in the history, prioritize correcting that mistake.`;

    return {
      // The Vercel AI SDK expects the system prompt as the first message or a separate option
      messages: [
        ...coreMessages,
        { role: "user", content: userQuery },
      ] as ModelMessage[],
      systemPrompt,
      sources: contextResults.map((r: any) => r.metadata),
    };
  },
};
