import { Queue } from 'bullmq';
import { redisConfig, defaultQueueOptions } from '../config/redis';

/**
 * Define the name of our ingestion queue.
 * Using a constant here prevents typos in the Worker later.
 */
export const INGESTION_QUEUE = 'document-ingestion';

/**
 * Initialize the Queue.
 * We pass the centralized redisConfig.connection (the IORedis instance)
 * and the defaultJobOptions (retries, backoff, cleanup).
 */
export const documentQueue = new Queue(INGESTION_QUEUE, {
  connection: redisConfig.connection,
  ...defaultQueueOptions, // Spreads attempts, backoff, and removeOnComplete
});