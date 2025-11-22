import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, QUERY_PLANNER_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload } from "@/types/server";
import { models } from "@/server/lib/model";
import { sanitizeJsonResponse } from "@/server/lib/sanitize";
import { getSchema, getMysqlConnectionPool } from "@/server/lib/mysql";
import mysql from 'mysql2/promise';

/**
 * Detects if a SQL query is an aggregation query
 * Aggregation queries have GROUP BY, or aggregate functions in SELECT (COUNT, SUM, AVG, MAX, MIN)
 */
function isAggregationQuery(query: string): boolean {
    const upperQuery = query.toUpperCase();
    // Check for GROUP BY
    if (upperQuery.includes('GROUP BY')) {
        return true;
    }
    // Check for aggregate functions in SELECT (but not COUNT(*) in a subquery for counting)
    const selectMatch = upperQuery.match(/SELECT\s+.*?\s+FROM/i);
    if (selectMatch) {
        const selectClause = selectMatch[0];
        // Check for aggregate functions
        const aggregatePatterns = [
            /\bSUM\s*\(/i,
            /\bAVG\s*\(/i,
            /\bMAX\s*\(/i,
            /\bMIN\s*\(/i,
            /\bCOUNT\s*\(/i, // COUNT in SELECT (not COUNT(*) for counting rows)
        ];
        // Only consider it aggregation if COUNT is not the only thing and it's not COUNT(*)
        const hasAggregate = aggregatePatterns.some(pattern => pattern.test(selectClause));
        // If it's just COUNT(*) without GROUP BY, it's not aggregation (it's counting rows)
        if (hasAggregate && !upperQuery.includes('COUNT(*)') && !upperQuery.includes('COUNT(1)')) {
            return true;
        }
        // If COUNT(*) is used with other columns or GROUP BY, it's aggregation
        if (upperQuery.includes('COUNT(*)') && (upperQuery.includes('GROUP BY') || selectClause.split(',').length > 2)) {
            return true;
        }
    }
    return false;
}

/**
 * Generates a COUNT query from a SELECT query
 * Extracts FROM, JOINs, and WHERE clauses, then wraps in COUNT(*)
 */
function generateCountQuery(query: string): string {
    const upperQuery = query.toUpperCase();
    
    // Find the FROM clause
    const fromMatch = upperQuery.match(/FROM\s+([\s\S]*?)(?:\s+WHERE|\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (!fromMatch) {
        // Fallback: try to extract everything after FROM
        const fromIndex = upperQuery.indexOf('FROM');
        if (fromIndex === -1) return `SELECT COUNT(*) FROM (${query}) AS count_query`;
        const afterFrom = query.substring(query.toUpperCase().indexOf('FROM'));
        // Remove ORDER BY and LIMIT
        const cleaned = afterFrom.replace(/\s+ORDER\s+BY[\s\S]*/i, '').replace(/\s+LIMIT[\s\S]*/i, '');
        return `SELECT COUNT(*) ${cleaned}`;
    }
    
    // Extract FROM and everything until WHERE/GROUP BY/ORDER BY/LIMIT
    const fromIndex = upperQuery.indexOf('FROM');
    let queryPart = query.substring(fromIndex);
    
    // Remove ORDER BY and LIMIT clauses (not needed for COUNT)
    queryPart = queryPart.replace(/\s+ORDER\s+BY[\s\S]*/i, '');
    queryPart = queryPart.replace(/\s+LIMIT[\s\S]*/i, '');
    
    // Remove GROUP BY if present (we want total count, not grouped count)
    queryPart = queryPart.replace(/\s+GROUP\s+BY[\s\S]*/i, '');
    
    // If there's a WHERE clause, keep it
    // Build the COUNT query
    return `SELECT COUNT(*) ${queryPart}`;
}

export const sqlPlannerStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        sendEvent('thinking', "Generating SQL queries..." );
        console.log('=== Data Analysis: SQL Planner ===');
        
        try {
            // Get schema
            const schema = await getSchema();
            
            const userModel = preferences?.model;
            const userKey = preferences?.key;
            
            const result = await models.standard(userModel, userKey).invoke([
                new SystemMessage(BASE_SYSTEM_MESSAGE),
                new SystemMessage(QUERY_PLANNER_SYSTEM_MESSAGE),
                new HumanMessage(JSON.stringify({
                    question: state.question,
                    contextualizedQuestion: state.contextualizedQuestion,
                    historySummary: state.historySummary || "",
                    schema: schema,
                    rag: state.rag || []
                }))
            ]);

            const response = result.content.toString();
            console.log('=== SQL Planner Raw Response ===');
            console.log(response.substring(0, 500));
            console.log('=== End SQL Planner Response ===');
            
            // Parse the response
            let plannerResult: { sqlQueries: string[] };
            try {
                const cleanedResponse = sanitizeJsonResponse(response);
                plannerResult = JSON.parse(cleanedResponse) as { sqlQueries: string[] };
                
                if (!plannerResult.sqlQueries || !Array.isArray(plannerResult.sqlQueries)) {
                    throw new Error('Invalid sqlQueries format');
                }
                
                console.log('✅ Successfully parsed SQL planner response');
                console.log(`Generated ${plannerResult.sqlQueries.length} queries`);
            } catch (parseError: unknown) {
                const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
                console.error('❌ Failed to parse SQL planner response:', errorMessage);
                console.error('Raw response causing error:', response);
                throw parseError;
            }
            
            // Generate COUNT queries for non-aggregation queries
            const queryCounts: (number | undefined)[] = [];
            const pool = getMysqlConnectionPool();
            
            for (let i = 0; i < plannerResult.sqlQueries.length; i++) {
                const query = plannerResult.sqlQueries[i];
                
                if (isAggregationQuery(query)) {
                    // Skip count for aggregation queries
                    queryCounts.push(undefined);
                    console.log(`Query ${i + 1}: Aggregation query, skipping count`);
                } else {
                    // Generate and execute COUNT query
                    try {
                        const countQuery = generateCountQuery(query);
                        console.log(`Query ${i + 1}: Generating count query: ${countQuery.substring(0, 100)}...`);
                        
                        const [countResult] = await pool.execute<mysql.RowDataPacket[]>(countQuery);
                        const count = (countResult[0]?.['COUNT(*)'] as number) ?? 0;
                        queryCounts.push(count);
                        
                        console.log(`Query ${i + 1}: Count = ${count}`);
                    } catch (countError: unknown) {
                        const errorMessage = countError instanceof Error ? countError.message : 'Unknown error';
                        console.error(`Failed to get count for query ${i + 1}:`, errorMessage);
                        // Set count to undefined if we can't get it
                        queryCounts.push(undefined);
                    }
                }
            }
            
            // Update the state with SQL queries and counts
            payload.state.sqlQueries = plannerResult.sqlQueries;
            payload.state.sqlQueryCounts = queryCounts;
            
            console.log('✅ SQL queries and counts generated');
            console.log(`Queries: ${plannerResult.sqlQueries.length}, Counts: ${queryCounts.filter(c => c !== undefined).length}`);
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('SQL planner error:', errorMessage);
            // Fallback: empty queries
            payload.state.sqlQueries = [];
            payload.state.sqlQueryCounts = [];
            return payload;
        }
    },
});

