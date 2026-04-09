import axios from "axios";
import { s3Service } from "./s3.service";
import { aiService } from "./ai.service";
import { parseDocument } from "../utils/parser";
import { chunkTextWithMetadata, countTokens } from "../utils/tokenizer";
import { insertChunks, deleteChunksByDoc } from "../models/Chunk";
import { getDocById, updateDocStatus } from "../models/Document";
import mongoose from "mongoose";

/**
 * Ingestion Service
 * Contains the granular logic for each stage of the ingestion pipeline.
 */
export const ingestionService = {
  /**
   * Stage 1: Initialize Ingestion
   */
  async startIngestion(documentId: string) {
    console.log(`[Ingestion:Stage 1] Initializing document ${documentId}`);
    await updateDocStatus(documentId, "processing");
  },

  /**
   * Stage 2 & 3: Download and Parse
   * Saves raw text to MongoDB to be used by subsequent stages.
   */
  async downloadAndParse(documentId: string, fileKey: string, userId: string) {
    console.log(`[Ingestion:Stage 2/3] Downloading and parsing ${documentId}`);

    const doc = await getDocById(documentId, userId);
    if (!doc) throw new Error("Document not found");

    const downloadUrl = await s3Service.getDownloadUrl(fileKey);
    const response = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(response.data);

    const pages = await parseDocument(buffer, doc.fileExt);
    return pages; // [{ pageNumber: 1, text: "..." }]
  },

  /**
   * Stage 4: Metadata Generation (Tags & Summary)
   */
  async generateMetadata(documentId: string, rawPages: any[], userId: string) {
    console.log(`[Ingestion:Stage 4] Generating metadata for ${documentId}`);

    const doc = await getDocById(documentId, userId);
    if (!doc) {
      throw new Error("Doc not found");
    }

    // Combine first ~800 tokens for context
    let textForMetadata = "";
    for (const page of rawPages) {
      textForMetadata += page.text + " ";
      if (countTokens(textForMetadata) > 800) break;
    }

    const { tags, summary } = await aiService.generateMetadata(textForMetadata);

    doc.tags = tags;
    doc.summary = summary;
    await doc.save();
    console.log(`[Ingestion:Stage 4] Metadata updated.`);
  },

  /**
   * Stage 5: Embedding Generation
   * Chunks text and generates vectors via Jina AI.
   */
  async generateEmbeddings(
    documentId: string,
    userId: string,
    rawPages: any[],
  ) {
    console.log(`[Ingestion:Stage 5] Generating embeddings for ${documentId}`);

    const doc = await getDocById(documentId, userId);
    if (!doc) {
      throw new Error("Doc not found");
    }

    // Idempotency: Clear old chunks if this is a retry
    await deleteChunksByDoc(documentId);

    const chunksWithMetadata = chunkTextWithMetadata(
      rawPages,
      doc.fileName,
      500,
      200,
    );

    const batchSize = 10;
    for (let i = 0; i < chunksWithMetadata.length; i += batchSize) {
      const batch = chunksWithMetadata.slice(i, i + batchSize);
      const texts = batch.map((c) => c.text);
      const embeddings = await aiService.createEmbeddings(texts);

      const chunksToInsert = batch.map((c, index) => ({
        userId: new mongoose.Types.ObjectId(userId),
        documentId: new mongoose.Types.ObjectId(documentId),
        text: c.text,
        embedding: embeddings[index],
        metadata: c.metadata,
      }));

      await insertChunks(chunksToInsert as any);
    }
    await updateDocStatus(documentId, "completed");
    console.log(`[Ingestion:Stage 5] Successfully completed ingestion.`);
  },
};
