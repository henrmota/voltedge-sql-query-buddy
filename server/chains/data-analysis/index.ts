import { RunnableSequence } from "@langchain/core/runnables";
import { ChainRequestPayload } from "@/types/server";
import { historySummarizerStep } from "./steps/history-summarizer";
import { ragStep } from "./steps/rag";
import { sqlPlannerStep } from "./steps/sql-planner";
import { sqlValidatorStep } from "./steps/sql-validator";
import { queryExecutorStep } from "./steps/query-executor";
import { resultSamplerStep } from "./steps/result-sampler";
import { insightsStep } from "./steps/insights";

const chain = RunnableSequence.from([
    historySummarizerStep,
    ragStep,
    sqlPlannerStep,
    sqlValidatorStep,
    queryExecutorStep,
    resultSamplerStep,
    insightsStep,
]);

export function runDataAnalysisChain(payload: ChainRequestPayload): Promise<ChainRequestPayload> {
    const start = Date.now();
    return chain.invoke(payload).then((result) => {
        const duration = Date.now() - start;
        console.log(`Data Analysis Chain completed in ${duration}ms`);
        return result as ChainRequestPayload;
    });
}
