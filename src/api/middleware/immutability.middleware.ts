import { Request, Response, NextFunction } from "express";
import { getChatById } from "../../models/Chat";

export const checkContextLock = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // const { conversationId } = req.params;
  // const { linkedDocuments } = req.body;
  // const userId = (req as any).user.id;

  // const chat = await getChatById(conversationId, userId);
  // if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

  // // If chat already has messages, it is "Locked"
  // if (chat.messages.length > 0) {
  //   // Check if the user is trying to change the documents
  //   const isChangingDocs = JSON.stringify(chat.linkedDocuments.map(id => id.toString())) !== JSON.stringify(linkedDocuments?.map((id: string) => id.toString()));

  //   if (isChangingDocs) {
  //     return res.status(400).json({
  //       message: "Context is locked. Please start a 'New Discussion' to change documents."
  //     });
  //   }
  // }

  next();
};
