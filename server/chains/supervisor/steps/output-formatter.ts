import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, SUPERVISOR_OUTPUT_FORMATTER_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload, Message, MessageStatus } from "@/types/server";
import { models } from "@/server/lib/model";

export const outputFormatterStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        // Only format output for sql-analysis intent (data-analysis chain results)
        if (state.intent !== "sql-analysis") {
            // For direct-answer or none, finalAnswer is already set in routing step
            return payload;
        }
        
        sendEvent('thinking', "Formatting response..." );
        console.log('=== Supervisor: Output Formatter ===');
        
        try {
            // Use sampledResults if available, otherwise use queryResults
            const resultsToFormat = state.sampledResults || state.queryResults || [];
            const totalRows = state.queryResults?.length || 0;
            const sampledRows = state.sampledResults?.length || 0;
            
            // Determine if results were sampled
            // Results are sampled if:
            // 1. sampledResults exists (not null/undefined)
            // 2. sampledResults has fewer rows than queryResults (meaning actual sampling occurred)
            // Note: When totalRows <= 100, sampledResults contains all results (not sampled)
            const isSampled = state.sampledResults !== null 
                && state.sampledResults !== undefined 
                && totalRows > 0 
                && sampledRows > 0
                && sampledRows < totalRows;
            
            // Skip formatting if no results and no insights
            if (resultsToFormat.length === 0 && (!state.insights || state.insights.length === 0)) {
                console.log('No results or insights to format');
                payload.state.finalAnswer = "I couldn't find any data to display. Please try rephrasing your question.";
                return payload;
            }
            
            const userModel = preferences?.model;
            const userKey = preferences?.key;
            
            // Use streaming for the final response
            const stream = await models.creative(userModel, userKey).stream([
                new SystemMessage(BASE_SYSTEM_MESSAGE),
                new SystemMessage(SUPERVISOR_OUTPUT_FORMATTER_SYSTEM_MESSAGE),
                new HumanMessage(JSON.stringify({
                    question: state.question,
                    contextualizedQuestion: state.contextualizedQuestion,
                    sqlQueries: state.sqlQueries || [],
                    sampledResults: state.sampledResults || null,
                    queryResults: state.queryResults || [],
                    insights: state.insights || [],
                    sqlExplainResults: state.sqlExplainResults || [],
                    totalRows: totalRows,
                    isSampled: isSampled
                    // Note: sqlQueryCounts removed - not displayed to user, but kept in state for potential future use
                }))
            ]);

            let accumulatedContent = '';
            let chunkCount = 0;
            
            // Stream chunks and emit them as STREAMING messages
            // Create a Message object with STREAMING status for each chunk
            for await (const chunk of stream) {
                const chunkText = chunk.content.toString();
                if (!chunkText) continue; // Skip empty chunks
                
                accumulatedContent += chunkText;
                chunkCount++;
                
                // Create a Message object with STREAMING status
                // The sendEventWithMessageId will ensure it has the correct ID
                const streamingMessage: Message = {
                    id: '', // Will be set by sendEventWithMessageId
                    role: 'assistant',
                    content: accumulatedContent,
                    createdAt: Date.now(),
                    status: MessageStatus.STREAMING
                };
                
                // Emit streaming update - use 'stream' event type (not 'streaming')
                // The frontend expects 'stream' event type for message updates
                console.log(`[Output Formatter] Streaming chunk ${chunkCount}, content length: ${accumulatedContent.length}`);
                sendEvent('stream', streamingMessage);
            }
            
            console.log(`[Output Formatter] Streaming completed. Total chunks: ${chunkCount}, Final content length: ${accumulatedContent.length}`);

            const formattedResponse = accumulatedContent.trim();
            console.log('✅ Output formatted successfully');
            console.log('Formatted response length:', formattedResponse.length);
            
            // Store formatted response as final answer
            payload.state.finalAnswer = formattedResponse;
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Output formatter error:', errorMessage);
            
            // Fallback: create a simple formatted response with queries
            const results = state.sampledResults || state.queryResults || [];
            const insights = state.insights || [];
            const queries = state.sqlQueries || [];
            
            let fallbackResponse = `## ${state.contextualizedQuestion || state.question}\n\n`;
            
            // Always show queries performed
            if (queries.length > 0) {
                fallbackResponse += `### Queries Performed\n\n`;
                queries.forEach((query, index) => {
                    fallbackResponse += `**Query ${index + 1}:**\n\`\`\`sql\n${query}\n\`\`\`\n\n`;
                });
            }
            
            if (results.length > 0) {
                fallbackResponse += `Found ${results.length} result${results.length > 1 ? 's' : ''}.\n\n`;
            }
            
            if (insights.length > 0) {
                fallbackResponse += `### Insights\n${insights.map(i => `- ${i}`).join('\n')}\n`;
            }
            
            payload.state.finalAnswer = fallbackResponse;
            return payload;
        }
    },
});

