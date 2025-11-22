import { ChatOpenAI } from "@langchain/openai";
import { config } from '../config';

interface ModelConfig {
    temperature?: number;
    key?: string;
    modelName?: string;
}

/**
 * Base function to create a model instance
 * @deprecated Use pre-configured model instances instead (models.standard, models.precise, etc.)
 */
export function getModel(provider: 'openai' | 'ollama', modelName: string, config: ModelConfig) {
    const finalConfig: ModelConfig = {
        temperature: 0.7,
        ...config,
    };

    if (provider === 'openai' && !finalConfig.key) {
        throw new Error('OpenAI key is required');
    }

    if (provider === 'openai') {
        return new ChatOpenAI({
            modelName,
            temperature: finalConfig.temperature,
            apiKey: finalConfig.key,
        });
    }    

    throw new Error(`Unsupported provider: ${provider}`);
}


/**
 * Factory for creating OpenAI models with different temperature profiles
 * Configuration values from src/config/index.ts
 */
class ModelFactory {
    /**
     * Get model with user preferences (dynamic model + key)
     */
    private getModelWithPrefs(temperature: number, userModel?: string, userKey?: string) {
        const modelName = userModel || config.llm.defaultModel;
        const apiKey = userKey;
        
        return new ChatOpenAI({
            modelName,
            temperature,
            apiKey,
            timeout: config.llm.defaultTimeout,
            maxRetries: config.llm.maxRetries,
        });
    }

    /**
     * Standard model for general-purpose use
     * Use for: Most LLM operations, intent analysis, formatting
     */
    standard(userModel?: string, userKey?: string) {
        return this.getModelWithPrefs(config.llm.temperatures.standard, userModel, userKey);
    }

    /**
     * Precise model for deterministic operations
     * Use for: SQL validation, technical analysis, structured output
     */
    precise(userModel?: string, userKey?: string) {
        return this.getModelWithPrefs(config.llm.temperatures.precise, userModel, userKey);
    }

    /**
     * Creative model for narrative generation
     * Use for: Output formatting, storytelling, user-facing content
     */
    creative(userModel?: string, userKey?: string) {
        return this.getModelWithPrefs(config.llm.temperatures.creative, userModel, userKey);
    }

    /**
     * Exploratory model for brainstorming
     * Use for: Generating ideas, creative queries, flexible responses
     */
    exploratory(userModel?: string, userKey?: string) {
        return this.getModelWithPrefs(config.llm.temperatures.exploratory, userModel, userKey);
    }

    /**
     * Custom model with specific configuration
     */
    custom(customConfig: { temperature?: number; modelName?: string; timeout?: number; apiKey?: string }) {
        return new ChatOpenAI({
            modelName: customConfig.modelName || config.llm.defaultModel,
            temperature: customConfig.temperature ?? config.llm.temperatures.standard,
            apiKey: customConfig.apiKey || customConfig.apiKey, // This line was not in the new_code, so I'm keeping it as is.
            timeout: customConfig.timeout ?? config.llm.defaultTimeout,
            maxRetries: config.llm.maxRetries,
        });
    }
}

/**
 * Centralized model instances
 * 
 * Usage:
 * - models.standard: General purpose (temp: 0.3)
 * - models.precise: SQL validation, technical (temp: 0)
 * - models.creative: Output formatting (temp: 0.5)
 * - models.exploratory: Brainstorming (temp: 0.7)
 * - models.custom({ temperature: 0.4 }): Custom config
 */
export const models = new ModelFactory();

