import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, INSIGHTS_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload } from "@/types/server";
import { models } from "@/server/lib/model";
import { sanitizeJsonResponse } from "@/server/lib/sanitize";

export const insightsStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        // Use sampledResults if available, otherwise use queryResults
        const resultsToAnalyze = state.sampledResults || state.queryResults;
        const isSampled = !!state.sampledResults;
        
        // Skip insights if no results
        if (!resultsToAnalyze || resultsToAnalyze.length === 0) {
            console.log('No results to analyze for insights');
            payload.state.insights = [];
            return payload;
        }
        
        sendEvent('thinking', "Analyzing results for insights..." );
        console.log('=== Data Analysis: Insights Step ===');
        
        try {
            const totalRows = state.queryResults?.length || 0;
            const resultsCount = resultsToAnalyze.length;
            
            console.log(`Analyzing ${resultsCount} result rows (${isSampled ? 'sampled' : 'full'} dataset, ${totalRows} total rows)`);
            
            const userModel = preferences?.model;
            const userKey = preferences?.key;
            
            const result = await models.standard(userModel, userKey).invoke([
                new SystemMessage(BASE_SYSTEM_MESSAGE),
                new SystemMessage(INSIGHTS_SYSTEM_MESSAGE),
                new HumanMessage(JSON.stringify({
                    question: state.question,
                    contextualizedQuestion: state.contextualizedQuestion,
                    sqlQueries: state.sqlQueries || [],
                    results: resultsToAnalyze,
                    totalRows: totalRows,
                    isSampled: isSampled
                }))
            ]);

            const response = result.content.toString();
            console.log('=== Insights Raw Response ===');
            console.log(response.substring(0, 500));
            console.log('=== End Insights Response ===');
            
            // Parse the response
            let insightsResult: { insights: string[] };
            try {
                const cleanedResponse = sanitizeJsonResponse(response);
                insightsResult = JSON.parse(cleanedResponse) as { insights: string[] };
                
                if (!insightsResult.insights || !Array.isArray(insightsResult.insights)) {
                    throw new Error('Invalid insights format');
                }
                
                console.log('✅ Successfully parsed insights response');
                console.log(`Generated ${insightsResult.insights.length} insights`);
                
                // Store insights in state
                payload.state.insights = insightsResult.insights;
                
            } catch (parseError: unknown) {
                const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
                console.error('❌ Failed to parse insights response:', errorMessage);
                console.error('Raw response causing error:', response);
                // Fallback: empty insights
                payload.state.insights = [];
            }
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Insights step error:', errorMessage);
            // Fallback: empty insights
            payload.state.insights = [];
            return payload;
        }
    },
});

