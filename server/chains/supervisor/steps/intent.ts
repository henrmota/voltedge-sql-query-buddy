import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, SUPERVISOR_INTENT_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload } from "@/types/server";
import { models } from "@/server/lib/model";
import { sanitizeJsonResponse } from "@/server/lib/sanitize";

export const intentStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        sendEvent('thinking', "Analyzing intent..." );
        console.log('=== Supervisor: Analyzing intent ===');
        
        try {
            const userModel = preferences?.model;
            const userKey = preferences?.key;
            
            const result = await models.standard(userModel, userKey).invoke([
                new SystemMessage(BASE_SYSTEM_MESSAGE),
                new SystemMessage(SUPERVISOR_INTENT_SYSTEM_MESSAGE),
                new HumanMessage(JSON.stringify({
                    question: state.question,
                    contextualizedQuestion: state.contextualizedQuestion,
                    history: state.history || []
                }))
            ]);

            const response = result.content.toString();
            console.log('=== Intent Raw Response ===');
            console.log(response.substring(0, 500));
            console.log('=== End Intent Response ===');
            
            // Parse the response
            let intentResult: { intent: "sql-analysis" | "direct-answer" | "none"; confidence: number };
            try {
                const cleanedResponse = sanitizeJsonResponse(response);
                intentResult = JSON.parse(cleanedResponse) as { intent: "sql-analysis" | "direct-answer" | "none"; confidence: number };
                
                // Apply validation rules - be more lenient with direct-answer
                // Only change to sql-analysis if confidence is very low (< 0.3) and intent is direct-answer
                if (intentResult.confidence < 0.3 && intentResult.intent === "direct-answer") {
                    console.log('⚠️ Very low confidence (< 0.3) for direct-answer, changing to sql-analysis');
                    intentResult.intent = "sql-analysis";
                }
                
                // Don't override direct-answer based on history - trust the LLM's intent classification
                // The LLM can handle context from history appropriately
                
                console.log('✅ Successfully parsed intent response');
                console.log('Intent:', intentResult.intent);
                console.log('Confidence:', intentResult.confidence);
            } catch (parseError: unknown) {
                const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
                console.error('❌ Failed to parse intent response:', errorMessage);
                console.error('Raw response causing error:', response);
                // Fallback: default to sql-analysis (safer than "none")
                intentResult = {
                    intent: "sql-analysis",
                    confidence: 0.5
                };
            }
            
            // Update the state with intent
            payload.state.intent = intentResult.intent;
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Supervisor intent error:', errorMessage);
            // Fallback: default to sql-analysis
            payload.state.intent = "sql-analysis";
            return payload;
        }
    },
});

