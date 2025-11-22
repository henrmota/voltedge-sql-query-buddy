import { RunnableLambda } from "@langchain/core/runnables";
import { ChainRequestPayload } from "@/types/server";
import { executeQueries } from "@/server/lib/mysql";
import { config } from "@/server/config";

/**
 * Adds LIMIT clause to a query if it doesn't already have one.
 * This is important for memory efficiency with large result sets.
 */
function ensureLimit(query: string, maxRows: number): string {
    const upperQuery = query.toUpperCase().trim();
    
    // Check if query already has LIMIT
    if (upperQuery.includes('LIMIT')) {
        // Extract existing LIMIT value
        const limitMatch = upperQuery.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
            const existingLimit = parseInt(limitMatch[1], 10);
            // If existing limit is larger than maxRows, reduce it
            if (existingLimit > maxRows) {
                return query.replace(/LIMIT\s+\d+/i, `LIMIT ${maxRows}`);
            }
            // Otherwise keep existing limit
            return query;
        }
    }
    
    // No LIMIT found, add one
    // Remove trailing semicolon if present
    const cleanedQuery = query.trim().replace(/;?\s*$/, '');
    return `${cleanedQuery} LIMIT ${maxRows}`;
}

/**
 * Checks if a query is an aggregation query (has GROUP BY or aggregate functions).
 * Aggregation queries should not have their LIMIT modified as it affects grouping.
 */
function isAggregationQuery(query: string): boolean {
    const upperQuery = query.toUpperCase();
    return upperQuery.includes('GROUP BY') || 
           /\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(upperQuery);
}

export const queryExecutorStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent } = payload;
        
        // Skip execution if no queries
        if (!state.sqlQueries || state.sqlQueries.length === 0) {
            console.log('No SQL queries to execute');
            payload.state.queryResults = [];
            return payload;
        }
        
        sendEvent('thinking', "Executing SQL queries..." );
        console.log('=== Data Analysis: Query Executor ===');
        
        try {
            const maxRows = config.dataAnalysis.maxRowsForInsights;
            
            // Prepare queries with LIMIT for memory efficiency
            // Only add LIMIT to non-aggregation queries if they don't already have one
            const queriesToExecute = state.sqlQueries.map(query => {
                if (isAggregationQuery(query)) {
                    // For aggregation queries, keep as-is (LIMIT affects grouping)
                    return query;
                } else {
                    // For non-aggregation queries, ensure LIMIT exists
                    return ensureLimit(query, maxRows);
                }
            });
            
            console.log(`Executing ${queriesToExecute.length} queries (max ${maxRows} rows per query)`);
            
            // Execute all queries in parallel
            const results = await executeQueries(queriesToExecute, undefined, { continueOnError: true });
            
            // Convert results to the expected format
            // Filter out error results and convert RowDataPacket[] to Record<string, unknown>[]
            const queryResults: Record<string, unknown>[] = [];
            
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                
                if ('error' in result) {
                    console.error(`Query ${i + 1} execution failed:`, result.error);
                    // Add error as a result row for visibility
                    queryResults.push({
                        _query_index: i + 1,
                        _error: result.error,
                        _query: queriesToExecute[i]
                    } as Record<string, unknown>);
                } else {
                    // Convert RowDataPacket[] to Record<string, unknown>[]
                    const rows = result as Array<Record<string, unknown>>;
                    console.log(`Query ${i + 1} returned ${rows.length} rows`);
                    
                    // Add rows with query index for tracking
                    for (const row of rows) {
                        queryResults.push({
                            ...row,
                            _query_index: i + 1
                        });
                    }
                }
            }
            
            // Store results in state
            payload.state.queryResults = queryResults;
            
            console.log(`✅ Query execution completed. Total rows: ${queryResults.length}`);
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Query executor error:', errorMessage);
            // Keep empty results on error
            payload.state.queryResults = [];
            return payload;
        }
    },
});
