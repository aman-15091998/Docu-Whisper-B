import mongoose, { Schema, Document } from "mongoose";

export interface IChunk extends Document {
  documentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text: string;
  embedding: number[];
  metadata: {
    fileName: string;
    pageNumber: number;
    chunkIndex: number;
  };
}

const ChunkSchema = new Schema({
  documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true }, // 1024 dims for Jina v3
  metadata: {
    fileName: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    chunkIndex: { type: Number, required: true },
  },
});

const ChunkModel =
  mongoose.models.Chunk || mongoose.model<IChunk>("Chunk", ChunkSchema);

/**
 * Model Functions
 */
export const insertChunks = async (chunks: Partial<IChunk>[]) =>
  await ChunkModel.insertMany(chunks);
export const deleteChunksByDoc = async (documentId: string) =>
  await ChunkModel.deleteMany({ documentId });

export const vectorSearch = async (
  userId: string,
  vector: number[],
  limit = 5,
) => {
  return await ChunkModel.aggregate([
    {
      $vectorSearch: {
        index: "vector_index", // Ensure this matches Atlas index name
        path: "embedding",
        queryVector: vector,
        numCandidates: limit * 10,
        limit: limit,
        filter: { userId: new mongoose.Types.ObjectId(userId) },
      },
    },
  ]);
};

export const getMatchingChunks = async (
  userId: string,
  queryVector: number[],
  mode: "default" | "comparison" = "default",
) => {
  const candidateLimit = mode === "comparison" ? 12 : 8;
  const candidates = await ChunkModel.aggregate([
    {
      $vectorSearch: {
        index: "vector_index", // Atlas index name
        path: "embedding",
        queryVector: queryVector,
        numCandidates: 100,
        limit: candidateLimit,
        filter: { userId: userId }, // Security: only user's docs
      },
    },
    {
      $project: {
        text: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  if (candidates.length === 0) return [];
  return candidates;
};
