/**
 * Centralized configuration for the application
 * All magic numbers and configurable values should be defined here
 */

export const config = {
    /**
     * LLM Configuration
     */
    llm: {
        defaultModel: 'gpt-4o-mini',
        defaultTimeout: 60000, // 60 seconds
        maxRetries: 2,
        temperatures: {
            standard: 0.3,  // General purpose
            precise: 0.0,   // Deterministic operations
            creative: 0.5,  // Narrative generation
            exploratory: 0.7, // Brainstorming
        },
    },

    /**
     * Data Analysis Configuration
     */
    dataAnalysis: {
        maxRowsForInsights: 100, // Max rows to send to insights LLM
        samplingStrategy: 'beginning_and_end', // Legacy: How to sample large result sets
        compressionThreshold: 200, // Apply intelligent compression if results exceed this
        compressionTargetRows: 100, // Target row count after compression
        enableIntelligentCompression: true, // Use TensorFlow compression vs simple sampling
    },

    /**
     * Database Configuration
     */
    database: {
        connectionLimit: 10, // Max concurrent connections in pool
        waitForConnections: true,
        queueLimit: 0,
    },

    /**
     * Vector Store / RAG Configuration
     */
    rag: {
        maxDocuments: 10, // Max documents to retrieve per search
        similarityThreshold: 0.65, // Minimum similarity score
    },

    /**
     * Response Streaming Configuration
     */
    streaming: {
        chunkSize: 50, // Characters per chunk when simulating streaming
        delayMs: 20, // Delay between chunks (milliseconds)
    },
} as const;

// Type-safe access to config
export type Config = typeof config;

