import { getMatchingChunks } from "../models/Chunk";
import { aiService } from "./ai.service";

export const vectorService = {
  /**
   * Performs the "Retrieve & Rerank" workflow.
   */
  async getRelevantContext(
    queryVector: number[],
    userId: string,
    queryText: string,
    mode: "default" | "comparison" = "default",
  ) {
    // 1. Atlas Vector Search (Over-fetch top 15)
    const candidates = await getMatchingChunks(userId, queryVector, mode);
    // console.log("candidates", candidates);
    if (!candidates) return [];

    // 2. Jina Reranking
    const rerankedResponse = await aiService.rerank(
      queryText,
      candidates,
      mode,
    );
    // console.log("rerankedResponse", rerankedResponse);

    return rerankedResponse;
  },
};
