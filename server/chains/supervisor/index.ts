import { RunnableSequence } from "@langchain/core/runnables";
import { ChainRequestPayload } from "@/types/server";
import { contextualizeStep } from "./steps/contextualize";
import { intentStep } from "./steps/intent";
import { routingStep } from "./steps/routing";
import { outputFormatterStep } from "./steps/output-formatter";

const chain = RunnableSequence.from([
    contextualizeStep,
    intentStep,
    routingStep,
    outputFormatterStep,
]);

export function runSupervisorChain(payload: ChainRequestPayload): Promise<ChainRequestPayload> {
    const start = Date.now();
    return chain.invoke(payload).then((result) => {
        const duration = Date.now() - start;
        console.log(`Supervisor Chain completed in ${duration}ms`);
        // Ensure result is a ChainRequestPayload
        if (!result || typeof result !== 'object' || !('state' in result)) {
            console.error('Invalid chain result:', result);
            throw new Error('Chain returned invalid result');
        }
        return result as ChainRequestPayload;
    });
}
