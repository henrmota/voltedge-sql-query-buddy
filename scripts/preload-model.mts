#!/usr/bin/env tsx
/**
 * Pre-loads the Hugging Face embedding model at build time
 * This ensures the model is available when the container starts
 */

import { pipeline, env } from "@huggingface/transformers";
import path from "path";
import fs from "fs";

// Configure cache directory for Hugging Face transformers
// Use HF_HOME if set, otherwise default to /app/.cache/huggingface
const cacheDir = process.env.HF_HOME || path.join(process.cwd(), 'tmp', 'huggingface');
env.cacheDir = cacheDir;

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`[Preload] Created cache directory: ${cacheDir}`);
}

const MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';

console.log(`[Preload] Starting to download model: ${MODEL_NAME}`);
console.log(`[Preload] Cache directory: ${env.cacheDir}`);
console.log(`[Preload] HF_HOME: ${process.env.HF_HOME || 'not set (using default)'}`);

try {
    // This will download and cache the model
    const embedder = await pipeline('embeddings', MODEL_NAME, {
        dtype: 'fp32', // Explicitly set dtype to suppress warning
        cache_dir: cacheDir, // Explicitly set cache directory
    });
    console.log(`[Preload] Successfully loaded model: ${MODEL_NAME}`);
    
    // Test the model with a simple query to ensure it works
    const testResult = await embedder('test', { pooling: 'mean', normalize: true });
    console.log(`[Preload] Model test successful. Embedding dimension: ${testResult.data.length}`);
    console.log(`[Preload] Model is ready to use!`);
} catch (error) {
    console.error(`[Preload] Error loading model:`, error);
    process.exit(1);
}

