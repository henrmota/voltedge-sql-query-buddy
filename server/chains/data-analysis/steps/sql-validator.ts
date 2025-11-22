import { RunnableLambda } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "langchain";
import { BASE_SYSTEM_MESSAGE, SQL_VALIDATOR_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { ChainRequestPayload } from "@/types/server";
import { models } from "@/server/lib/model";
import { sanitizeJsonResponse } from "@/server/lib/sanitize";
import { explainQueries } from "@/server/lib/mysql";

export const sqlValidatorStep = new RunnableLambda({
    func: async (payload: ChainRequestPayload) => {
        const { state, sendEvent, preferences } = payload;
        
        // Skip validation if no queries
        if (!state.sqlQueries || state.sqlQueries.length === 0) {
            console.log('No SQL queries to validate');
            payload.state.sqlExplainResults = [];
            return payload;
        }
        
        sendEvent('thinking', "Validating SQL queries..." );
        console.log('=== Data Analysis: SQL Validator ===');
        
        try {
            // Execute EXPLAIN on all queries in parallel
            const explainResults = await explainQueries(state.sqlQueries, undefined, { continueOnError: true });
            
            // Store EXPLAIN results in state
            payload.state.sqlExplainResults = explainResults;
            
            console.log(`✅ EXPLAIN executed on ${state.sqlQueries.length} queries`);
            
            // Check if any queries failed EXPLAIN
            const hasErrors = explainResults.some((result, index) => {
                if ('error' in result) {
                    console.error(`Query ${index + 1} failed EXPLAIN:`, result.error);
                    return true;
                }
                return false;
            });
            
            if (hasErrors) {
                // Use LLM to validate and fix queries
                sendEvent('thinking', "Fixing SQL query issues..." );
                console.log('Some queries failed EXPLAIN, using LLM to validate and fix');
                
                const userModel = preferences?.model;
                const userKey = preferences?.key;
                
                const result = await models.standard(userModel, userKey).invoke([
                    new SystemMessage(BASE_SYSTEM_MESSAGE),
                    new SystemMessage(SQL_VALIDATOR_SYSTEM_MESSAGE),
                    new HumanMessage(JSON.stringify({
                        sqlQueries: state.sqlQueries,
                        sqlExplainResults: explainResults
                    }))
                ]);

                const response = result.content.toString();
                console.log('=== SQL Validator Raw Response ===');
                console.log(response.substring(0, 500));
                console.log('=== End SQL Validator Response ===');
                
                // Parse the response
                let validatorResult: { 
                    validatedSQL: { 
                        valid: boolean; 
                        fixedSQL: string[]; 
                        issues: string[] 
                    } 
                };
                try {
                    const cleanedResponse = sanitizeJsonResponse(response);
                    validatorResult = JSON.parse(cleanedResponse) as { 
                        validatedSQL: { 
                            valid: boolean; 
                            fixedSQL: string[]; 
                            issues: string[] 
                        } 
                    };
                    
                    console.log('✅ Successfully parsed SQL validator response');
                    console.log('Valid:', validatorResult.validatedSQL.valid);
                    console.log('Fixed queries:', validatorResult.validatedSQL.fixedSQL.length);
                    console.log('Issues:', validatorResult.validatedSQL.issues.length);
                    
                    // Update queries with fixed versions if validation passed
                    if (validatorResult.validatedSQL.valid && validatorResult.validatedSQL.fixedSQL.length > 0) {
                        payload.state.sqlQueries = validatorResult.validatedSQL.fixedSQL;
                        // Re-run EXPLAIN on fixed queries
                        const fixedExplainResults = await explainQueries(validatorResult.validatedSQL.fixedSQL, undefined, { continueOnError: true });
                        payload.state.sqlExplainResults = fixedExplainResults;
                        console.log('✅ Queries fixed and re-validated');
                    }
                } catch (parseError: unknown) {
                    const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
                    console.error('❌ Failed to parse SQL validator response:', errorMessage);
                    console.error('Raw response causing error:', response);
                    // Keep original queries and EXPLAIN results
                }
            } else {
                console.log('✅ All queries passed EXPLAIN validation');
            }
            
            return payload;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('SQL validator error:', errorMessage);
            // Keep original queries, no EXPLAIN results
            payload.state.sqlExplainResults = [];
            return payload;
        }
    },
});

