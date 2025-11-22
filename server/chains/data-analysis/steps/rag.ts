import { RunnableLambda } from "@langchain/core/runnables";
import { ChainRequestPayload } from "@/types/server";
import { VectorStore } from "@/server/embeddings";
import { config } from "@/server/config";

export const ragStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent } = payload;
        
        sendEvent('thinking', "Finding relevant database schemas..." );
        console.log('=== Data Analysis: RAG Step ===');
        
        try {
            // Use contextualized question if available, otherwise use original question
            const searchQuery = state.contextualizedQuestion || state.question;
            
            console.log('Searching for relevant schemas with query:', searchQuery);
            
            // Use VectorStore to find top 3 relevant schemas
            const vectorStore = new VectorStore();
            const relevantDocs = await vectorStore.search(
                searchQuery,
                3, // Top 3 schemas
                config.rag.similarityThreshold
            );
            
            console.log(`✅ Found ${relevantDocs.length} relevant schema documents`);
            
            // Log the tables found
            const tables = relevantDocs.map(doc => doc.metadata?.table).filter(Boolean);
            if (tables.length > 0) {
                console.log('Relevant tables:', tables.join(', '));
            }
            
            // Store RAG documents in state
            payload.state.rag = relevantDocs;
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('RAG step error:', errorMessage);
            // Fallback: empty RAG documents
            payload.state.rag = [];
            return payload;
        }
    },
});

