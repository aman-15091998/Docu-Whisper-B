import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { s3Service } from "../../services/s3.service";
import {
  createDoc,
  IDocument,
  getDocsByUser,
  getDocById,
  deleteDoc,
} from "../../models/Document";
import { deleteChunksByDoc } from "../../models/Chunk";
import { markChatsInactiveByDocument } from "../../models/Chat";
import { documentQueue, INGESTION_QUEUE } from "../../worker/queue";

export const getUploadUrl = async (req: Request, res: Response) => {
  const { fileName, fileType } = req.body;

  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Create a unique key: userId/timestamp-filename (with spaces replaced by hyphens)
  const sanitizedFileName = fileName.trim().replace(/\s+/g, "-");
  const fileKey = `${req.user.id}/${Date.now()}-${sanitizedFileName}`;

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

export const getDownloadPresignedUrl = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const { id } = req.params;
    const doc = await getDocById(String(id), req.user.id);

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    const downloadUrl = await s3Service.getDownloadUrl(doc.r2Key);

    res.json({
      success: true,
      downloadUrl,
      fileName: doc.fileName,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to generate download URL" });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  try {
    const { id } = req.params;

    // 1. Get doc to find the S3 key
    const doc = await getDocById(String(id), req.user.id);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    // 2. Delete from S3
    await s3Service.deleteFile(doc.r2Key);

    // 3. Delete chunks from Vector DB (Atlas)
    await deleteChunksByDoc(String(id));

    // 4. Delete document record from DB
    await deleteDoc(String(id), req.user.id);

    // 5. Mark associated chats as inactive
    await markChatsInactiveByDocument(String(id));

    res.json({
      success: true,
      message: "Document and associated data deleted",
    });
  } catch (error: any) {
    console.error("Delete document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete document",
      error: error.message,
    });
  }
};
