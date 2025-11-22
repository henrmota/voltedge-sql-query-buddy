#!/usr/bin/env tsx
/**
 * Clears the old corrupted cache from node_modules
 * This should be run before preloading the model
 */

import fs from "fs";
import path from "path";

// Try to find and clear old cache locations
const possibleCachePaths = [
    // pnpm structure
    path.join(process.cwd(), 'node_modules', '.pnpm', '@huggingface+transformers@3.8.0', 'node_modules', '@huggingface', 'transformers', '.cache'),
    // Direct node_modules structure
    path.join(process.cwd(), 'node_modules', '@huggingface', 'transformers', '.cache'),
    // Any transformers cache in node_modules
    path.join(process.cwd(), 'node_modules', '.pnpm'),
];

console.log(`[Clear Cache] Checking for old cache locations...`);

let cleared = false;
for (const cachePath of possibleCachePaths) {
    if (fs.existsSync(cachePath)) {
        try {
            // If it's the .pnpm directory, we need to be more careful
            if (cachePath.endsWith('.pnpm')) {
                // Look for transformers cache inside .pnpm
                const pnpmDir = cachePath;
                if (fs.statSync(pnpmDir).isDirectory()) {
                    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && entry.name.includes('huggingface+transformers')) {
                            const transformersCache = path.join(pnpmDir, entry.name, 'node_modules', '@huggingface', 'transformers', '.cache');
                            if (fs.existsSync(transformersCache)) {
                                fs.rmSync(transformersCache, { recursive: true, force: true });
                                console.log(`[Clear Cache] Removed cache from: ${transformersCache}`);
                                cleared = true;
                            }
                        }
                    }
                }
            } else {
                fs.rmSync(cachePath, { recursive: true, force: true });
                console.log(`[Clear Cache] Removed cache from: ${cachePath}`);
                cleared = true;
            }
        } catch (error) {
            console.warn(`[Clear Cache] Warning: Could not remove cache at ${cachePath}:`, error);
        }
    }
}

if (!cleared) {
    console.log(`[Clear Cache] No old cache found at expected locations`);
} else {
    console.log(`[Clear Cache] Old cache cleared successfully`);
}

