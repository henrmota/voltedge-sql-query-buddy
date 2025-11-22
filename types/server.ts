import { v4 as uuidv4 } from 'uuid';
import { Preferences } from '.';
import { DocumentInterface } from '@langchain/core/documents';

interface Conversation {
    id: number;
    messages: Message[];
}

export enum MessageStatus {
    DRAFT = 'draft',
    PENDING_RESPONSE = 'pending_response',
    STREAMING = 'streaming',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: number;
    muted?: boolean;
    status: MessageStatus;
}

interface CustomRequest extends Request {
    clientId?: string;
}

export type { Message, CustomRequest, Conversation };


// ZADD user:1:conversations id date 
// LPUSH user:1:conversations:1 message  

export function makeUserMessage(message: string, status: MessageStatus = MessageStatus.DRAFT): Message {
    return {
        id: uuidv4(),
        role: 'user',
        content: message,
        createdAt: new Date().getTime(),
        muted: false,
        status,
    }
}

export interface ChainStepState {
  question: string;
  contextualizedQuestion?: string;
  intent?: "none" | "sql-analysis" | "direct-answer";
  history?: Message[];
  historySummary?: string;
  rag?: DocumentInterface[];
  stepsToFollow?: string[];
  sqlQueries?: string[];
  sqlQueryCounts?: (number | undefined)[]; // Count for each query (undefined for aggregation queries)
  sqlExplainResults?: Array<Record<string, unknown>[] | { error: string }>; // EXPLAIN results for each query
  queryResults?: Record<string, unknown>[];  
  sampledResults?: Record<string, unknown>[]; // Sampled results (top + bottom when > 100, otherwise all results)
  insights?: string[];
  finalAnswer?: string; // Final answer text (for direct-answer or none intents)
}

export interface ChainRequestPayload {
    state: ChainStepState; 
    sendEvent: (event: string, message: string | Message) => void; 
    preferences?: Preferences;
}
