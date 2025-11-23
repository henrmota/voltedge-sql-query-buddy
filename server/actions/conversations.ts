'use server';
import { Conversation, Message, MessageStatus } from "@/types";
import { ensureUseId } from "./utils";
import { addMessage, createConversation, getConversation, getConversations, getUserPreferences } from "../lib/redis";
import { ask } from "../chains";
import { v4 as uuidv4 } from 'uuid';

export async function callGetConversations(): Promise<Conversation[]> {
  const userId = await ensureUseId();

  return getConversations(userId);
}

export async function callGetConversation(conversationId: number): Promise<Conversation> {
  const userId = await ensureUseId();

  return getConversation(userId, conversationId);
}

export async function callAsk(question: string, conversationId: number): Promise<Conversation> {
  const userId = await ensureUseId();
  const [
    conversation,
    preferences
  ] = await Promise.all(
    [
      conversationId > 0 ? getConversation(userId, conversationId) : createConversation(userId),
      getUserPreferences()
    ]
  );

  const message: Message = {
    id: uuidv4(),
    role: 'user',
    content: question,
    createdAt: Date.now(),
    status: MessageStatus.COMPLETED
  }

  setTimeout(() => {
    ask(message, conversation, userId, preferences);
  }, 1000);

  return getConversation(userId, conversation.id);
}
