import mongoose, { Schema, Document } from 'mongoose';

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
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true }, // 1024 dims for Jina v3
  metadata: {
    fileName: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    chunkIndex: { type: Number, required: true }
  }
});

const ChunkModel = mongoose.models.Chunk || mongoose.model<IChunk>('Chunk', ChunkSchema);

/**
 * Model Functions
 */
export const insertChunks = (chunks: Partial<IChunk>[]) => ChunkModel.insertMany(chunks);
export const deleteChunksByDoc = (documentId: string) => ChunkModel.deleteMany({ documentId });

export const vectorSearch = (userId: string, vector: number[], limit = 5) => {
  return ChunkModel.aggregate([
    {
      $vectorSearch: {
        index: "vector_index", // Ensure this matches Atlas index name
        path: "embedding",
        queryVector: vector,
        numCandidates: limit * 10,
        limit: limit,
        filter: { userId: new mongoose.Types.ObjectId(userId) }
      }
    }
  ]);
};