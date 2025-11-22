export enum MessageStatus {
  DRAFT = 'draft',
  PENDING_RESPONSE = 'pending_response',
  STREAMING = 'streaming',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  muted?: boolean;
  createdAt: number;
  status: MessageStatus;
}

export interface Conversation {
  id: number;
  messages: Message[];
}

export interface Preferences {
  theme: 'light' | 'dark'; 
  name: string;
  model: string;
  key: string;
  createdAt?: number;
}
