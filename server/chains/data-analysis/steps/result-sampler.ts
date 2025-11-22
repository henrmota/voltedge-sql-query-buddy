import { RunnableLambda } from "@langchain/core/runnables";
import { ChainRequestPayload } from "@/types/server";

const SAMPLING_THRESHOLD = 100;
const TOP_SAMPLE_SIZE = 50;
const BOTTOM_SAMPLE_SIZE = 50;

export const resultSamplerStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent } = payload;
        
        // Skip sampling if no results - leave field undefined/null
        if (!state.queryResults || state.queryResults.length === 0) {
            console.log('No query results to sample');
            // Don't set sampledResults - leave it undefined/null
            return payload;
        }
        
        sendEvent('thinking', "Sampling results..." );
        console.log('=== Data Analysis: Result Sampler ===');
        
        try {
            const totalRows = state.queryResults.length;
            console.log(`Total rows: ${totalRows}`);
            
            let sampledResults: Record<string, unknown>[];
            let numberOfSampledResults = 0;
            if (totalRows > SAMPLING_THRESHOLD) {
                // Sample: top rows + bottom rows
                const topRows = state.queryResults.slice(0, TOP_SAMPLE_SIZE);
                const bottomRows = state.queryResults.slice(-BOTTOM_SAMPLE_SIZE);
                
                sampledResults = [...topRows, ...bottomRows];
                numberOfSampledResults++;
                console.log(`✅ Sampled ${sampledResults.length} rows (${TOP_SAMPLE_SIZE} top + ${BOTTOM_SAMPLE_SIZE} bottom) from ${totalRows} total rows`);
            } else {
                // No sampling needed, store all results
                sampledResults = [...state.queryResults];
                console.log(`✅ No sampling needed. Storing all ${totalRows} rows`);
            }
            
            if (numberOfSampledResults === 0) {
                payload.state.sampledResults = undefined;
            } else {
                payload.state.sampledResults = sampledResults;
            }
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Result sampler error:', errorMessage);
            // Fallback: store all results if available and has items, otherwise leave undefined
            if (state.queryResults && state.queryResults.length > 0) {
                const fallbackResults = [...state.queryResults];
                if (fallbackResults.length > 0) {
                    payload.state.sampledResults = fallbackResults;
                }
            }
            // Otherwise leave sampledResults undefined/null
            return payload;
        }
    },
});

