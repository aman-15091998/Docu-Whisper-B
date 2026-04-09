import { type ModelMessage } from "ai"; // Use 'type' to help TS if needed
import { vectorService } from "./vector.service";
import { aiService } from "./ai.service";

export const chatService = {
  /**
   * Prepares history and context for the Vercel AI SDK
   */
  async prepareChatContext(
    userQuery: string,
    userId: string,
    history: any[],
    mode: "default" | "comparison" = "default",
  ) {
    // 1. Get Vector & Reranked Context
    const queryVectorArr = await aiService.createEmbeddings([userQuery]);
    const queryVector = queryVectorArr[0];

    console.log("queryVectorArr", queryVectorArr);

    const contextResults = await vectorService.getRelevantContext(
      queryVector,
      userId,
      userQuery,
      mode,
    );

    // 2. Format Context for the Prompt with indices for citation
    const contextString = contextResults
      .map(
        (res: any, index: number) =>
          `[[${index + 1}]] SOURCE: ${res.metadata?.fileName || "Unknown"} (Page: ${res.metadata?.pageNumber || "N/A"})\nCONTENT: ${res.text || ""}`,
      )
      .join("\n\n---\n\n");

    // 3. Map History to ModelMessage with Feedback Injection
    const coreMessages: ModelMessage[] = history.slice(-6).map((msg) => {
      let content = msg.content;

      // Inject feedback loop: Phase 2 standard [SYSTEM NOTE: User feedback: ...]
      if (msg.role === "assistant" && msg.feedback === "thumb_down") {
        content += `\n\n[SYSTEM NOTE: User feedback: ${msg.feedbackText || "This previous response was marked as incorrect. Correction needed."}]`;
      }

      return {
        role: msg.role === "user" ? "user" : "assistant",
        content: content,
      } as ModelMessage;
    });

    // 4. Construct System Instruction
    const systemPrompt = `You are Docu Whisper, an expert document assistant.
    Use the following provided context chunks to answer the user's question. 

    INSTRUCTIONS:
    - Be concise and professional.
    - Use verbatim quotes from the context when providing evidence.
    - YOU MUST cite every claim using the index of the source in the format [[index]]. Example: "The revenue increased by 20% [[1]]."
    - If the context does not contain the answer, state that you don't know based on the provided documents.

    CONTEXT:
    ${contextString}`;

    return {
      messages: [
        ...coreMessages,
        { role: "user", content: userQuery },
      ] as ModelMessage[],
      systemPrompt,
      sources: contextResults.map((r: any) => r.metadata),
    };
  },
};

// - If the user provided a SYSTEM NOTE in the previous message, prioritize correcting that specific mistake in this turn.
