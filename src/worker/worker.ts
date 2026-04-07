import { Worker, Job } from 'bullmq';
import { redisConfig } from '../config/redis';
import { INGESTION_QUEUE } from './queue';
import { ingestionService } from '../services/ingestion.service';
import { updateDocStatus } from '../models/Document';

/**
 * This is the Background Worker.
 * It runs in a separate process from the main Express API.
 * It picks up jobs from the 'document-ingestion' queue and processes them.
 */
export const ingestionWorker = new Worker(
  INGESTION_QUEUE,
  async (job: Job) => {
    const { documentId, userId, fileKey } = job.data;

    try {
      // 1. Initialize
      await ingestionService.startIngestion(documentId);
      await job.updateProgress(5);

      // 2. Download & Parse -> RETURN the text instead of saving to DB
      const rawPages = await ingestionService.downloadAndParse(documentId, fileKey);
      await job.updateProgress(30);

      // 3. Generate Metadata -> Pass rawPages directly
      await ingestionService.generateMetadata(documentId, rawPages);
      await job.updateProgress(50);

      // 4. Generate Embeddings -> Pass rawPages directly
      await ingestionService.generateEmbeddings(documentId, userId, rawPages);
      await job.updateProgress(100);

      console.log(`✅ Document ${documentId} indexed successfully.`);
    } catch (error) {
      console.error(`❌ Worker Error:`, error);
      await updateDocStatus(documentId, 'failed');
      throw error; // Triggers BullMQ retry
    }
  },
  { connection: redisConfig.connection }
);
console.log("🚀 Ingestion Worker is live and listening...");