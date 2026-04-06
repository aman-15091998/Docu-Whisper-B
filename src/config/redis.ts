import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.UPSTASH_REDIS_URL;

if (!REDIS_URL) {
  throw new Error('UPSTASH_REDIS_URL is missing in .env');
}

// 1. Connection Configuration
export const redisConfig = {
  connection: new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // Critical for BullMQ compatibility
  }),
};

// 2. Queue Options (Default policies for retries and cleanup)
export const defaultQueueOptions = {
  defaultJobOptions: {
    attempts: 3,                 // Retry 3 times if processing fails
    backoff: {
      type: 'exponential',       // Wait longer between each retry
      delay: 5000,               // Start with 5s delay
    },
    removeOnComplete: {          // Don't clog Redis with finished jobs
      age: 3600,                 // Keep for 1 hour for the dashboard
      count: 100,                // Or keep last 100 jobs
    },
    removeOnFail: {
      age: 24 * 3600,            // Keep failed jobs for 24h to debug
    },
  },
};