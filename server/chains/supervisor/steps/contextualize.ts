import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, SUPERVISOR_CONTEXTUALIZER_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload, Message } from "@/types/server";
import { models } from "@/server/lib/model";
import { sanitizeJsonResponse } from "@/server/lib/sanitize";

export const contextualizeStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        sendEvent('thinking', "Contextualizing your question..." );
        console.log('=== Supervisor: Contextualizing question ===');
        
        try {
            const userModel = preferences?.model;
            const userKey = preferences?.key;
            
            const result = await models.standard(userModel, userKey).invoke([
                new SystemMessage(BASE_SYSTEM_MESSAGE),
                new SystemMessage(SUPERVISOR_CONTEXTUALIZER_SYSTEM_MESSAGE),
                new HumanMessage(JSON.stringify({
                    question: state.question,
                    history: state.history || []
                }))
            ]);

            const response = result.content.toString();
            console.log('=== Supervisor Raw Response ===');
            console.log(response.substring(0, 500));
            console.log('=== End Supervisor Response ===');
            
            // Parse the response
            let contextualized: { contextualizedQuestion: string; historyRelevance: number[] };
            try {
                // Clean response - remove markdown code blocks if present
                const cleanedResponse = sanitizeJsonResponse(response);
                contextualized = JSON.parse(cleanedResponse) as { contextualizedQuestion: string; historyRelevance: number[] };
                payload.state.history = payload.state.history?.filter((message: Message, index: number) => contextualized.historyRelevance[index] > 0.5);
                
                console.log('✅ Successfully parsed contextualizer response');
                console.log('Contextualized question:', contextualized.contextualizedQuestion);
                console.log('History relevance scores:', contextualized.historyRelevance);
            } catch (parseError: unknown) {
                const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
                console.error('❌ Failed to parse contextualizer response:', errorMessage);
                console.error('Raw response causing error:', response);
                // Fallback: use original question
                contextualized = {
                    contextualizedQuestion: state.question,
                    historyRelevance: (state.history || []).map(() => 0.5)
                };
            }
            
            // Update the state with contextualized question
            payload.state.contextualizedQuestion = contextualized.contextualizedQuestion;
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Supervisor contextualizer error:', errorMessage);
            // Fallback: use original question as contextualized
            payload.state.contextualizedQuestion = state.question;
            return payload;
        }
    },
});

