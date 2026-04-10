import mongoose, { Schema, Document } from "mongoose";

const MessageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true },
    feedback: {
      type: String,
      enum: ["thumb_up", "thumb_down", null],
      default: null,
    },
    feedbackText: { type: String },
    sources: [
      {
        fileName: String,
        pageNumber: Number,
        chunkIndex: Number,
        text: String,
      },
    ],
  },
  { timestamps: true },
);

export interface IChat extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  linkedDocuments: mongoose.Types.ObjectId[];
  messages: any[];
  isInactive: boolean;
  mode: "default" | "comparison";
  suggestedQuestions: string[];
}

const ChatSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "New Discussion" },
    linkedDocuments: [{ type: Schema.Types.ObjectId, ref: "Document" }],
    messages: [MessageSchema],
    isInactive: { type: Boolean, default: false },
    mode: { type: String, enum: ["default", "comparison"], default: "default" },
    suggestedQuestions: [String],
  },
  { timestamps: true },
);

const ChatModel =
  mongoose.models.Chat || mongoose.model<IChat>("Chat", ChatSchema);

/**
 * Model Functions
 */
export const createChat = async (userId: string, data: Partial<IChat>) =>
  await new ChatModel({ ...data, userId }).save();
export const getChatById = async (id: string, userId: string) =>
  await ChatModel.findOne({ _id: id, userId });
export const getChatsByUser = async (userId: string) =>
  await ChatModel.find({ userId })
    .populate("linkedDocuments", "fileName fileExt status tags summary")
    .sort({ updatedAt: -1 });
export const addChatMessage = async (
  chatId: string,
  message: any,
  userId: string,
) => {
  return await ChatModel.findOneAndUpdate(
    { _id: chatId, userId },
    { $push: { messages: message } },
    { new: true },
  );
};
export const updateChatFeedback = async (
  chatId: string,
  messageId: string,
  feedback: string,
  userId: string,
  feedbackText?: string,
) => {
  return await ChatModel.findOneAndUpdate(
    { _id: chatId, "messages._id": messageId, userId },
    {
      $set: {
        "messages.$.feedback": feedback,
        "messages.$.feedbackText": feedbackText,
      },
    },
    { new: true },
  );
};

export const updateChatTitle = async (chatId: string, title: string) => {
  return await ChatModel.findByIdAndUpdate(chatId, { title }, { new: true });
};

export const updateSuggestedQuestions = async (
  chatId: string,
  questions: string[],
) => {
  return await ChatModel.findByIdAndUpdate(
    chatId,
    { suggestedQuestions: questions },
    { new: true },
  );
};

export const updateChatMode = async (
  chatId: string,
  mode: "default" | "comparison",
  userId: string,
) => {
  return await ChatModel.findOneAndUpdate(
    { _id: chatId, userId },
    { $set: { mode } },
    { new: true },
  );
};

export const markChatsInactiveByDocument = async (documentId: string) => {
  return await ChatModel.updateMany(
    { linkedDocuments: documentId },
    { $set: { isInactive: true } },
  );
};
