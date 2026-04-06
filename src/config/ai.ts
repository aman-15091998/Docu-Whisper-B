export const aiConfig = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-1.5-flash", // Fast and cost-effective for RAG
  },
  jina: {
    apiKey: process.env.JINA_API_KEY,
    embeddingModel: "jina-embeddings-v3",
    rerankerModel: "jina-reranker-v2-base-multilingual",
  },
  // RAG Hyperparameters
  rag: {
    chunkSize: 1000,   // Characters per chunk
    chunkOverlap: 200, // Context overlap between chunks
    topK: 10,          // Chunks to retrieve from Vector Search
    rerankCount: 3,    // Chunks to actually send to Gemini after reranking
  }
};