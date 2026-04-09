import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { s3Service } from "../../services/s3.service";
import {
  createDoc,
  IDocument,
  getDocsByUser,
  deleteDoc,
} from "../../models/Document";
import { documentQueue, INGESTION_QUEUE } from "../../worker/queue";

export const getUploadUrl = async (req: Request, res: Response) => {
  const { fileName, fileType } = req.body;

  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Create a unique key: userId/timestamp-uuid-filename
  const fileKey = `${req.user.id}/${Date.now()}-${fileName}`;

  const uploadUrl = await s3Service.getUploadUrl(fileKey, fileType);

  res.json({ success: true, uploadUrl, fileKey });
};

export const confirmUpload = async (req: Request, res: Response) => {
  const { fileName, fileKey, fileType } = req.body;

  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Extract file extension
  const fileExt = fileName.split(".").pop() || "";

  // 1. Create a "Pending" record in MongoDB
  const newDocObj: Partial<IDocument> = {
    userId: req.user.id as any,
    fileName,
    r2Key: fileKey,
    fileType,
    fileExt: fileKey.split(".").pop(),
    status: "pending",
  };

  const newDoc = await createDoc(newDocObj);

  // 2. Add to BullMQ
  await documentQueue.add("process-document", {
    documentId: (newDoc._id as any).toString(),
    userId: req.user.id,
    fileKey: fileKey,
  });

  res.status(202).json({
    success: true,
    message: "Ingestion started",
    documentId: newDoc._id,
  });
};

export const getDocuments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  try {
    const documents = await getDocsByUser(req.user.id);
    res.json({ success: true, documents });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch documents" });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  try {
    const { id } = req.params;
    await deleteDoc(id as string, req.user.id as string);
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete document" });
  }
};
