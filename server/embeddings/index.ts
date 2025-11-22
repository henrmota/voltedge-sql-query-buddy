import { pipeline, env } from "@huggingface/transformers";
import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { RedisVectorStore } from "@langchain/redis";
import { redisClient, ensureRedisInitialized } from "../lib/redis";
import path from "path";
import fs from "fs";

// Configure cache directory for Hugging Face transformers
// Use HF_HOME if set, otherwise default to /app/.cache/huggingface
const cacheDir = process.env.HF_HOME || path.join(process.cwd(), '.cache', 'huggingface');
env.cacheDir = cacheDir;

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

// Clear old corrupted cache from node_modules at runtime
function clearOldCache() {
    const possibleCachePaths = [
        // pnpm structure - the problematic path from the error
        path.join(process.cwd(), 'node_modules', '.pnpm', '@huggingface+transformers@3.8.0', 'node_modules', '@huggingface', 'transformers', '.cache'),
        // Direct node_modules structure
        path.join(process.cwd(), 'node_modules', '@huggingface', 'transformers', '.cache'),
    ];

    for (const oldCachePath of possibleCachePaths) {
        if (fs.existsSync(oldCachePath)) {
            try {
                // Specifically remove the corrupted model file
                const modelPath = path.join(oldCachePath, 'sentence-transformers', 'all-MiniLM-L6-v2', 'onnx', 'model.onnx');
                if (fs.existsSync(modelPath)) {
                    fs.unlinkSync(modelPath);
                    console.log(`[Cache] Removed corrupted model file: ${modelPath}`);
                }
                // Remove the entire cache directory
                fs.rmSync(oldCachePath, { recursive: true, force: true });
                console.log(`[Cache] Removed old cache directory: ${oldCachePath}`);
            } catch (error) {
                console.warn(`[Cache] Warning: Could not remove old cache at ${oldCachePath}:`, error);
            }
        }
    }
}

// Clear old cache on module load
clearOldCache();

export async function getEmbeddings(text: string) {
    // Ensure old cache is cleared before loading
    clearOldCache();
    
    const embedder = await pipeline('embeddings', 'sentence-transformers/all-MiniLM-L6-v2', {
        dtype: 'fp32', // Explicitly set dtype to suppress warning
        cache_dir: cacheDir, // Explicitly set cache directory
        local_files_only: false, // Force download if cache is missing
    });

    const result = await embedder(text, { pooling: 'mean', normalize: true });

    return Array.from(result.data);
}

export class TransformersEmbeddings extends Embeddings {
    embedQuery(document: string): Promise<number[]> {
        return getEmbeddings(document);
    }

    async embedDocuments(documents: string[]) {
        return await Promise.all(documents.map(async (document) => {
            return await this.embedQuery(document);
        }));
    }
}

const embeddings = new TransformersEmbeddings({ maxConcurrency: 10 });

export class VectorStore {
    private vectorStore: RedisVectorStore | null = null;
    
    private async getVectorStore(): Promise<RedisVectorStore> {
        if (!this.vectorStore) {
            await ensureRedisInitialized();
            this.vectorStore = new RedisVectorStore(embeddings, {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore - RedisVectorStore expects a client with specific modules, but our singleton client works fine at runtime
                redisClient: redisClient,
                indexName: 'vector-store',
            });
        }
        return this.vectorStore;
    }

    async search(query: string, k: number = 10, threshold: number = 0.5) {
        const store = await this.getVectorStore();
        const docs = await store.similaritySearchWithScore(query, k);

        return docs.filter((doc) => doc[1] >= threshold).map((doc) => doc[0]);
    }

    async addDocuments(documents: Document[]) {
        if (!documents || documents.length === 0) {
            throw new Error('No vectors provided');
        }

        const docWithoutId = documents.find((doc) => !doc.id);
        if (docWithoutId) {
            throw new Error('Document id is required');
        }

        // Sanitize document content to ensure it's safe for Redis storage
        const sanitizedDocs = documents.map(doc => {
            // Ensure pageContent is a valid string
            let content = doc.pageContent || '';
            if (typeof content !== 'string') {
                content = String(content);
            }
            
            // Remove problematic Unicode characters that can't be encoded as ByteString
            content = content
                .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // Remove surrogate pairs (emojis and high Unicode)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
                .replace(/[^\x20-\u007E\u00A0-\u00FF\n\r\t]/g, '') // Keep printable ASCII + Latin-1 + whitespace
                .trim();

            return new Document({
                pageContent: content,
                id: doc.id,
                metadata: doc.metadata || {}
            });
        }).filter(doc => doc.pageContent && doc.pageContent.length > 0); // Remove empty documents

        if (sanitizedDocs.length === 0) {
            throw new Error('No valid documents after sanitization');
        }
        
        const store = await this.getVectorStore();
        return await store.addDocuments(sanitizedDocs, { keys: sanitizedDocs.map((doc) => `${store.keyPrefix}${doc.id}`) });
    }
}
