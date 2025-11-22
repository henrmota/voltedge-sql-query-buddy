import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, DIRECT_ANSWER_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload } from "@/types/server";
import { models } from "@/server/lib/model";
import { runDataAnalysisChain } from "../../data-analysis";

export const routingStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        console.log('=== Supervisor: Routing based on intent ===');
        console.log('Intent:', state.intent);
        
        if (!state.intent) {
            console.error('No intent found in state, defaulting to sql-analysis');
            payload.state.intent = "sql-analysis";
        }
        
        if (state.intent === "sql-analysis") {
            sendEvent('thinking', "Analyzing data..." );
            console.log('Routing to data-analysis chain');
            
            // Call the data-analysis chain
            const dataAnalysisResult = await runDataAnalysisChain(payload);
            
            // The data-analysis chain will populate the state with results
            // For now, we'll return the payload as-is
            // Later steps can extract the final answer from the state
            return dataAnalysisResult;
            
        } else if (state.intent === "direct-answer") {
            sendEvent('thinking', "Finding answer in conversation..." );
            console.log('Routing to direct-answer LLM');
            
            try {
                const userModel = preferences?.model;
                const userKey = preferences?.key;
                
                const result = await models.standard(userModel, userKey).invoke([
                    new SystemMessage(BASE_SYSTEM_MESSAGE),
                    new SystemMessage(DIRECT_ANSWER_SYSTEM_MESSAGE),
                    new HumanMessage(JSON.stringify({
                        question: state.question,
                        contextualizedQuestion: state.contextualizedQuestion,
                        history: state.history || []
                    }))
                ]);

                const answer = result.content.toString().trim();
                console.log('✅ Direct answer generated');
                console.log('Answer:', answer.substring(0, 200));
                
                // Store the answer in state
                payload.state.finalAnswer = answer;
                
                return payload;
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('Direct answer error:', errorMessage);
                // Fallback: return a message
                payload.state.finalAnswer = 
                    "I encountered an error finding the answer. Would you like me to query the database instead?";
                return payload;
            }
            
        } else if (state.intent === "none") {
            console.log('Intent is "none", returning polite decline');
            const declineMessage = "I'm sorry, I can only help with questions about VoltEdge Electronics business data. Please ask me about customers, products, orders, or other business-related information.";
            payload.state.finalAnswer = declineMessage;
            return payload;
            
        } else {
            console.error('Unknown intent:', state.intent);
            // Default to sql-analysis
            payload.state.intent = "sql-analysis";
            sendEvent('thinking', "Analyzing data..." );
            return await runDataAnalysisChain(payload);
        }
    },
});

