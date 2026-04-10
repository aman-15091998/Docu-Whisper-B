import { Router } from "express";
import {
  loginUser,
  registerUser,
  verifyAndReturnUser,
} from "../controllers/userController";
import {
  getUploadUrl,
  confirmUpload,
  getDocuments,
  deleteDocument,
} from "../controllers/documentController";
import { isLoggedIn } from "../middleware/isLoggedIn";

import {
  createConversation,
  getConversations,
  sendMessage,
  getConversationById,
  getSuggestedQuestions,
  submitMessageFeedback,
} from "../controllers/chatController";
import { checkContextLock } from "../middleware/immutability.middleware";

const router = Router();

// Auth Routes
router.get("/auth/me", verifyAndReturnUser);
router.post("/register", registerUser);
router.post("/login", loginUser);

// Document Routes
// // 1. Get a Presigned URL for Cloudflare R2
router.post("/upload-url", isLoggedIn, getUploadUrl);

// // 2. Client tells server: "File is in R2, please start processing"
router.post("/confirm", isLoggedIn, confirmUpload);

// // 3. Get all documents for the logged-in user
router.get("/documents", isLoggedIn, getDocuments);

// // 4. Delete a document
router.delete("/documents/:id", isLoggedIn, deleteDocument);

// Chat Routes
// Create a new empty conversation thread
router.post("/new", isLoggedIn, createConversation);

// List all chat history for the logged-in user (sidebar data)
router.get("/conversations", isLoggedIn, getConversations);

// The core RAG route: Vector Search -> Gemini -> Save Message
router.post(
  "/:conversationId/message",
  isLoggedIn,
  checkContextLock,
  sendMessage,
);

// Submit user feedback
router.post(
  "/:conversationId/:messageId/feedback",
  isLoggedIn,
  submitMessageFeedback,
);

// Generate AI suggested questions for a conversation
router.get(
  "/:conversationId/suggested-questions",
  isLoggedIn,
  getSuggestedQuestions,
);

// Fetch full message history for a specific thread
router.get("/:conversationId", isLoggedIn, getConversationById);

export default router;
