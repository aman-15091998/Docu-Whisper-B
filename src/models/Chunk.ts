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

// IMPORTANT: After deploying, create a Vector Search Index in MongoDB Atlas UI on the 'embedding' field.
export default mongoose.models.Chunk || mongoose.model<IChunk>('Chunk', ChunkSchema);