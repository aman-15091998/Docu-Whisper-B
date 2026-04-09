import { Router } from "express";
import {
  loginUser,
  registerUser,
  verifyAndReturnUser,
} from "../controllers/userController";
import { getUploadUrl, confirmUpload } from "../controllers/documentController";
import { isLoggedIn } from "../middleware/isLoggedIn";

import {
  createConversation,
  getConversations,
  sendMessage,
  getConversationById,
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

// Fetch full message history for a specific thread
router.get("/:conversationId", isLoggedIn, getConversationById);

export default router;
