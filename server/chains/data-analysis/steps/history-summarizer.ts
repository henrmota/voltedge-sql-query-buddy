import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, HISTORY_SUMMARIZER_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload } from "@/types/server";
import { models } from "@/server/lib/model";

export const historySummarizerStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        // Skip summarization if no history
        if (!state.history || state.history.length === 0) {
            payload.state.historySummary = "";
            return payload;
        }
        
        sendEvent('thinking', "Summarizing conversation history..." );
        console.log('=== Data Analysis: Summarizing history ===');
        
        try {
            const userModel = preferences?.model;
            const userKey = preferences?.key;
            
            const result = await models.standard(userModel, userKey).invoke([
                new SystemMessage(BASE_SYSTEM_MESSAGE),
                new SystemMessage(HISTORY_SUMMARIZER_SYSTEM_MESSAGE),
                new HumanMessage(JSON.stringify({
                    question: state.question,
                    contextualizedQuestion: state.contextualizedQuestion,
                    history: state.history
                }))
            ]);

            const summary = result.content.toString().trim();
            console.log('✅ History summary generated');
            console.log('Summary:', summary.substring(0, 200));
            
            // Update the state with history summary
            payload.state.historySummary = summary;
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('History summarizer error:', errorMessage);
            // Fallback: empty summary
            payload.state.historySummary = "";
            return payload;
        }
    },
});

