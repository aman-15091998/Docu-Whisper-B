import mongoose, { Schema, Document as MongooseDocument } from "mongoose";

export interface IDocument extends MongooseDocument {
  userId: mongoose.Types.ObjectId;
  fileName: string;
  r2Key: string;
  fileType: string;
  fileExt: string;
  status: "pending" | "processing" | "completed" | "failed";
  tags: string[]; // For "Smart Search Filters"
  summary?: string; // For "Query Suggestions"
}

const DocumentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fileName: { type: String, required: true },
    r2Key: { type: String, required: true },
    fileType: { type: String, required: true },
    fileExt: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    tags: [String],
    summary: { type: String },
  },
  { timestamps: true },
);

const DocumentModel =
  mongoose.models.Document ||
  mongoose.model<IDocument>("Document", DocumentSchema);

/**
 * Model Functions
 */
export const createDoc = async (data: Partial<IDocument>) =>
  await new DocumentModel(data).save();
export const getDocsByUser = async (userId: string) =>
  await DocumentModel.find({ userId }).sort({ createdAt: -1 });
export const updateDocStatus = async (
  id: string,
  status: IDocument["status"],
) => await DocumentModel.findByIdAndUpdate(id, { status }, { new: true });
export const getDocById = async (id: string, userId: string) =>
  await DocumentModel.findOne({ _id: id, userId });
export const deleteDoc = async (id: string, userId: string) =>
  await DocumentModel.findOneAndDelete({ _id: id, userId });
