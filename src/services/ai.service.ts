import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { aiConfig } from "../config/ai";

const genAI = new GoogleGenerativeAI(aiConfig.gemini.apiKey!);

export const aiService = {
  /**
   * Step 3: Metadata Generation
   * Uses Gemini to "understand" the document at a high level.
   */
  async generateMetadata(textSample: string) {
    const model = genAI.getGenerativeModel({
      model: aiConfig.gemini.model || "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = `
      You are a professional document analyzer. Analyze the following text and return a JSON object.
      {
        "tags": ["Category1", "Category2", ...],
        "summary": "A brief 2-sentence overview"
      }
      Text: ${textSample}
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  },

  /**
   * Step 4 & 5: Vectorization
   * Sends batches of text to Jina AI to get the 1024-dim embeddings.
   */
  async createEmbeddings(texts: string[]) {
    try {
      const response = await axios.post(
        "https://api.jina.ai/v1/embeddings",
        {
          model: aiConfig.jina.embeddingModel,
          task: "retrieval.passage", // Optimizes for RAG
          dimensions: 1024,
          late_chunking: false, // We handle our own token-based chunking
          input: texts,
        },
        {
          headers: {
            Authorization: `Bearer ${aiConfig.jina.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      // Returns an array of embedding arrays
      return response.data.data.map((item: any) => item.embedding);
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  },

  /**
   * Jina Reranker
   */
  async rerank(
    query: string,
    candidates: { id: string; text: string; metadata: any }[],
    mode: "default" | "comparison" = "default",
  ) {
    try {
      if (candidates.length === 0) {
        return [];
      }
      const topN = mode === "comparison" ? 5 : 3;
      const rerankResponse = await axios.post(
        "https://api.jina.ai/v1/rerank",
        {
          model: aiConfig.jina.rerankerModel,
          query: query,
          documents: candidates.map((d) => d.text),
          top_n: topN,
        },
        {
          headers: {
            Authorization: `Bearer ${aiConfig.jina.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      //Map the reranked results back to our chunk data
      const rankedResults = rerankResponse.data.results
        .map((result: any) => {
          const chunk = candidates[result.index];
          if (!chunk) {
            return null;
          }
          return {
            text: chunk.text,
            metadata: chunk.metadata,
            relevanceScore: result.relevance_score,
          };
        })
        .filter(Boolean);

      return rankedResults;
    } catch (error) {
      console.error("Error reranking:", error);
      throw error;
    }
  },

  /**
   * Simple Completion for Titles and Suggested Questions
   */
  async generateSimpleCompletion(prompt: string, isJson: boolean = false) {
    const model = genAI.getGenerativeModel({
      model: aiConfig.gemini.model || "gemini-2.5-flash",
      generationConfig: isJson ? { responseMimeType: "application/json" } : {},
    });

    const result = await model.generateContent(prompt);
    return { text: result.response.text() };
  },
};
