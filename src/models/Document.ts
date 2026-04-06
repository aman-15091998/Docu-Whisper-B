import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IDocument extends MongooseDocument {
  userId: mongoose.Types.ObjectId;
  fileName: string;
  r2Key: string;
  fileType: string;
  fileExt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tags: string[];      // For "Smart Search Filters"
  summary?: string;    // For "Query Suggestions"
}

const DocumentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileName: { type: String, required: true },
  r2Key: { type: String, required: true },
  fileType: { type: String, required: true },
  fileExt: {type: String, required: true},
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  tags: [String],
  summary: { type: String },
}, { timestamps: true });

export default mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);