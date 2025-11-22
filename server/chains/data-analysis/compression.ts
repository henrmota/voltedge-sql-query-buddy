/**
 * Data Compression Module
 * Provides intelligent data compression strategies to reduce large result sets
 * while preserving important patterns and insights.
 */

export type CompressionStrategy = 
    | 'temporal_bucketing'
    | 'stratified_sampling'
    | 'kmeans_clustering'
    | 'statistical_bucketing'
    | 'outlier_detection'
    | 'simple_limit';

export interface CompressionConfig {
    strategy: CompressionStrategy;
    targetRows: number;
    params?: {
        timeColumn?: string;
        categoryColumn?: string;
        numericColumns?: string[];
        numericColumn?: string;
        buckets?: number;
        samplesPerBucket?: number;
        k?: number;
        samplesPerCluster?: number;
        maxOutliers?: number;
        normalSamples?: number;
    };
}

export interface CompressionResult {
    compressedData: Record<string, unknown>[];
    originalCount: number;
    compressedCount: number;
    strategy: CompressionStrategy;
    metadata?: Record<string, unknown>;
}

/**
 * Detects the best compression strategy based on data characteristics
 */
export function detectCompressionStrategy(
    data: Record<string, unknown>[],
    columns: string[],
    targetRows: number
): CompressionConfig {
    if (data.length === 0) {
        return {
            strategy: 'simple_limit',
            targetRows: 0,
        };
    }

    // Check for date/time columns
    const dateColumns = columns.filter(col => {
        const sample = data[0]?.[col];
        if (!sample) return false;
        // Check if it's a date string or timestamp
        const dateStr = String(sample);
        return /^\d{4}-\d{2}-\d{2}/.test(dateStr) || 
               /^\d{10,13}$/.test(dateStr) ||
               dateStr.includes('T') ||
               sample instanceof Date;
    });

    // Check for numeric columns
    const numericColumns = columns.filter(col => {
        const sample = data[0]?.[col];
        return typeof sample === 'number' && !isNaN(sample);
    });

    // Check for categorical columns (strings, IDs, etc.)
    const categoricalColumns = columns.filter(col => {
        const sample = data[0]?.[col];
        return typeof sample === 'string' || 
               (typeof sample === 'number' && col.toLowerCase().includes('id'));
    });

    // Strategy selection logic
    if (dateColumns.length > 0) {
        // Temporal data - use temporal bucketing
        return {
            strategy: 'temporal_bucketing',
            targetRows,
            params: {
                timeColumn: dateColumns[0],
                buckets: Math.min(10, Math.ceil(targetRows / 10)),
                samplesPerBucket: Math.ceil(targetRows / 10),
            },
        };
    }

    if (numericColumns.length >= 2) {
        // Multiple numeric columns - use k-means clustering
        return {
            strategy: 'kmeans_clustering',
            targetRows,
            params: {
                numericColumns: numericColumns.slice(0, 3), // Limit to first 3 numeric columns
                k: Math.min(5, Math.ceil(targetRows / 20)),
                samplesPerCluster: Math.ceil(targetRows / 5),
            },
        };
    }

    if (numericColumns.length === 1) {
        // Single numeric column - use statistical bucketing
        return {
            strategy: 'statistical_bucketing',
            targetRows,
            params: {
                numericColumn: numericColumns[0],
                buckets: Math.min(10, Math.ceil(targetRows / 10)),
                samplesPerBucket: Math.ceil(targetRows / 10),
            },
        };
    }

    if (categoricalColumns.length > 0) {
        // Categorical data - use stratified sampling
        return {
            strategy: 'stratified_sampling',
            targetRows,
            params: {
                categoryColumn: categoricalColumns[0],
            },
        };
    }

    // Default fallback
    return {
        strategy: 'simple_limit',
        targetRows,
    };
}

/**
 * Compresses data using the specified strategy
 */
export function compressData(
    data: Record<string, unknown>[],
    config: CompressionConfig
): CompressionResult {
    if (data.length === 0) {
        return {
            compressedData: [],
            originalCount: 0,
            compressedCount: 0,
            strategy: config.strategy,
        };
    }

    // If data is already smaller than target, return as-is
    if (data.length <= config.targetRows) {
        return {
            compressedData: data,
            originalCount: data.length,
            compressedCount: data.length,
            strategy: config.strategy,
            metadata: { skipped: 'already below target' },
        };
    }

    let compressed: Record<string, unknown>[];
    let metadata: Record<string, unknown> = {};

    switch (config.strategy) {
        case 'temporal_bucketing':
            compressed = temporalBucketing(data, config);
            metadata = {
                timeColumn: config.params?.timeColumn,
                buckets: config.params?.buckets,
            };
            break;

        case 'stratified_sampling':
            compressed = stratifiedSampling(data, config);
            metadata = {
                categoryColumn: config.params?.categoryColumn,
            };
            break;

        case 'kmeans_clustering':
            compressed = kmeansClustering(data, config);
            metadata = {
                numericColumns: config.params?.numericColumns,
                k: config.params?.k,
            };
            break;

        case 'statistical_bucketing':
            compressed = statisticalBucketing(data, config);
            metadata = {
                numericColumn: config.params?.numericColumn,
                buckets: config.params?.buckets,
            };
            break;

        case 'outlier_detection':
            compressed = outlierDetection(data, config);
            metadata = {
                numericColumns: config.params?.numericColumns,
                maxOutliers: config.params?.maxOutliers,
            };
            break;

        case 'simple_limit':
        default:
            compressed = simpleLimit(data, config);
            metadata = { method: 'first_n_rows' };
            break;
    }

    return {
        compressedData: compressed,
        originalCount: data.length,
        compressedCount: compressed.length,
        strategy: config.strategy,
        metadata,
    };
}

/**
 * Temporal Bucketing: Samples from different time periods
 */
function temporalBucketing(data: Record<string, unknown>[], config: CompressionConfig): Record<string, unknown>[] {
    const timeColumn = config.params?.timeColumn;
    if (!timeColumn) {
        return simpleLimit(data, config);
    }

    const buckets = config.params?.buckets || 10;
    const samplesPerBucket = config.params?.samplesPerBucket || 10;

    // Parse dates and sort
    const withDates = data.map((row, idx) => ({
        row,
        date: parseDate(row[timeColumn]),
        idx,
    })).filter(item => item.date !== null);

    if (withDates.length === 0) {
        return simpleLimit(data, config);
    }

    withDates.sort((a, b) => a.date!.getTime() - b.date!.getTime());

    // Divide into time buckets
    const bucketSize = Math.ceil(withDates.length / buckets);
    const result: Record<string, unknown>[] = [];

    for (let i = 0; i < buckets; i++) {
        const start = i * bucketSize;
        const end = Math.min(start + bucketSize, withDates.length);
        const bucket = withDates.slice(start, end);

        // Sample from this bucket
        const sampled = sampleFromArray(bucket, samplesPerBucket);
        result.push(...sampled.map(item => item.row));
    }

    return result.slice(0, config.targetRows);
}

/**
 * Stratified Sampling: Samples proportionally from each category
 */
function stratifiedSampling(data: Record<string, unknown>[], config: CompressionConfig): Record<string, unknown>[] {
    const categoryColumn = config.params?.categoryColumn;
    if (!categoryColumn) {
        return simpleLimit(data, config);
    }

    // Group by category
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of data) {
        const category = String(row[categoryColumn] || 'unknown');
        if (!groups.has(category)) {
            groups.set(category, []);
        }
        groups.get(category)!.push(row);
    }

    // Calculate proportional samples
    const totalRows = config.targetRows;
    const numCategories = groups.size;
    const samplesPerCategory = Math.max(1, Math.floor(totalRows / numCategories));

    const result: Record<string, unknown>[] = [];
    for (const [, rows] of groups) {
        const sampled = sampleFromArray(rows, samplesPerCategory);
        result.push(...sampled);
    }

    // If we need more rows, randomly sample from all data
    if (result.length < totalRows) {
        const remaining = totalRows - result.length;
        const allRows = Array.from(groups.values()).flat();
        const additional = sampleFromArray(allRows, remaining);
        result.push(...additional);
    }

    return result.slice(0, totalRows);
}

/**
 * K-Means Clustering: Samples from data clusters
 * Simplified version using basic distance calculation
 */
function kmeansClustering(data: Record<string, unknown>[], config: CompressionConfig): Record<string, unknown>[] {
    const numericColumns = config.params?.numericColumns;
    if (!numericColumns || numericColumns.length === 0) {
        return simpleLimit(data, config);
    }

    const k = config.params?.k || 5;
    const samplesPerCluster = config.params?.samplesPerCluster || 20;

    // Extract numeric values
    const vectors = data.map(row => 
        numericColumns.map(col => Number(row[col]) || 0)
    );

    // Simple k-means initialization: random centroids
    const centroids: number[][] = [];
    for (let i = 0; i < k; i++) {
        const randomIdx = Math.floor(Math.random() * vectors.length);
        centroids.push([...vectors[randomIdx]]);
    }

    // Simple k-means iteration (limited to 10 iterations for performance)
    let clusters: number[][] = [];
    for (let iter = 0; iter < 10; iter++) {
        clusters = Array(k).fill(0).map(() => []);
        
        for (let i = 0; i < vectors.length; i++) {
            let minDist = Infinity;
            let closestCentroid = 0;
            
            for (let j = 0; j < centroids.length; j++) {
                const dist = euclideanDistance(vectors[i], centroids[j]);
                if (dist < minDist) {
                    minDist = dist;
                    closestCentroid = j;
                }
            }
            
            clusters[closestCentroid].push(i);
        }

        // Update centroids
        for (let j = 0; j < k; j++) {
            if (clusters[j].length > 0) {
                const clusterVectors = clusters[j].map(idx => vectors[idx]);
                centroids[j] = clusterVectors[0].map((_, dim) => {
                    const sum = clusterVectors.reduce((acc, v) => acc + v[dim], 0);
                    return sum / clusterVectors.length;
                });
            }
        }
    }

    // Sample from each cluster
    const result: Record<string, unknown>[] = [];
    for (const cluster of clusters) {
        if (cluster.length > 0) {
            const sampled = sampleFromArray(cluster, samplesPerCluster);
            result.push(...sampled.map(idx => data[idx]));
        }
    }

    return result.slice(0, config.targetRows);
}

/**
 * Statistical Bucketing: Samples from percentile buckets
 */
function statisticalBucketing(data: Record<string, unknown>[], config: CompressionConfig): Record<string, unknown>[] {
    const numericColumn = config.params?.numericColumn;
    if (!numericColumn) {
        return simpleLimit(data, config);
    }

    const buckets = config.params?.buckets || 10;
    const samplesPerBucket = config.params?.samplesPerBucket || 10;

    // Extract and sort values
    const withValues = data.map((row, idx) => ({
        row,
        value: Number(row[numericColumn]) || 0,
        idx,
    })).sort((a, b) => a.value - b.value);

    // Divide into percentile buckets
    const bucketSize = Math.ceil(withValues.length / buckets);
    const result: Record<string, unknown>[] = [];

    for (let i = 0; i < buckets; i++) {
        const start = i * bucketSize;
        const end = Math.min(start + bucketSize, withValues.length);
        const bucket = withValues.slice(start, end);

        const sampled = sampleFromArray(bucket, samplesPerBucket);
        result.push(...sampled.map(item => item.row));
    }

    return result.slice(0, config.targetRows);
}

/**
 * Outlier Detection: Preserves outliers + normal samples
 */
function outlierDetection(data: Record<string, unknown>[], config: CompressionConfig): Record<string, unknown>[] {
    const numericColumns = config.params?.numericColumns;
    if (!numericColumns || numericColumns.length === 0) {
        return simpleLimit(data, config);
    }

    const maxOutliers = config.params?.maxOutliers || 30;
    const normalSamples = config.params?.normalSamples || 70;

    // Calculate z-scores for each numeric column
    const withScores = data.map((row, idx) => {
        const values = numericColumns.map(col => Number(row[col]) || 0);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        const zScores = values.map(v => stdDev > 0 ? Math.abs((v - mean) / stdDev) : 0);
        const maxZScore = Math.max(...zScores);
        
        return { row, idx, zScore: maxZScore };
    });

    // Sort by z-score (highest = most outlier)
    withScores.sort((a, b) => b.zScore - a.zScore);

    // Take top outliers (z-score > 2)
    const outliers = withScores
        .filter(item => item.zScore > 2)
        .slice(0, maxOutliers)
        .map(item => item.row);

    // Sample normal data (z-score <= 2)
    const normal = withScores
        .filter(item => item.zScore <= 2)
        .slice(0, normalSamples)
        .map(item => item.row);

    return [...outliers, ...normal].slice(0, config.targetRows);
}

/**
 * Simple Limit: Just take first N rows
 */
function simpleLimit(data: Record<string, unknown>[], config: CompressionConfig): Record<string, unknown>[] {
    return data.slice(0, config.targetRows);
}

/**
 * Helper: Parse date from various formats
 */
function parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    
    const str = String(value);
    const timestamp = Number(str);
    
    // Unix timestamp (seconds or milliseconds)
    if (!isNaN(timestamp)) {
        return new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);
    }
    
    // ISO date string
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        return date;
    }
    
    return null;
}

/**
 * Helper: Calculate Euclidean distance between two vectors
 */
function euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
}

/**
 * Helper: Randomly sample N items from array
 */
function sampleFromArray<T>(array: T[], n: number): T[] {
    if (n >= array.length) return [...array];
    
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
}

