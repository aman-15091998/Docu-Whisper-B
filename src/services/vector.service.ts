import { MongoClient } from 'mongodb';
import axios from 'axios';
import { aiConfig } from '../config/ai';
import { getMatchingChunks } from '../models/Chunk';
import { aiService } from './ai.service';

export const vectorService = {
  /**
   * Performs the "Retrieve & Rerank" workflow.
   */
  async getRelevantContext(queryVector: number[], userId: string, queryText: string) {
    // 1. Atlas Vector Search (Over-fetch top 15)
    const candidates = await getMatchingChunks(userId, queryVector)
    if(!candidates) return [];

    // 2. Jina Reranking
    const rerankedResponse = await aiService.rerank(queryText, candidates);

    return rerankedResponse;
  }
};