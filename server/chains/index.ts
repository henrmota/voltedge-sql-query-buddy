import eventEmitter from "@/app/api/real-time/emitter";
import { Preferences } from "@/types";
import { ChainRequestPayload, Conversation, Message, MessageStatus } from "@/types/server";
import { runSupervisorChain } from "./supervisor";
import { v4 as uuidv4 } from 'uuid';
import { addMessage } from "../lib/redis";

export async function ask(
    message: Message, 
    conversation: Conversation, 
    clientId: string, 
    preferences: Preferences,
): Promise<Message> {
    // Save user message to Redis (if not already saved by callAsk)
    // Note: callAsk also saves a user message, but this ensures consistency
    await addMessage(clientId, message, conversation.id);

    // Send user message in format expected by frontend: { type: 'stream', data: Message, conversationId }
    eventEmitter.emit('message', clientId, JSON.stringify({
        event: 'stream',
        data: message,
        conversationId: conversation.id
    }));

    // Create placeholder assistant message for streaming updates
    const assistantMessageId = uuidv4();
    const placeholderAssistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '...',
        createdAt: Date.now(),
        status: MessageStatus.STREAMING
    };

    // Send placeholder assistant message immediately
    console.log('[Chain] Emitting placeholder assistant message:', { clientId, conversationId: conversation.id, messageId: assistantMessageId });
    eventEmitter.emit('message', clientId, JSON.stringify({
        event: 'stream',
        data: placeholderAssistantMessage,
        conversationId: conversation.id
    }));

    const sendEvent = (event: string, message: string | Message) => {
        // Ensure consistent format: stringify the object
        console.log('[Chain] sendEvent called:', { event, clientId, conversationId: conversation.id });
        eventEmitter.emit('message', clientId, JSON.stringify({ 
            event, 
            data: message, 
            conversationId: conversation.id 
        }));
    }

    // Pass assistant message ID to the chain for streaming updates
    const sendEventWithMessageId = (event: string, message: string | Message) => {
        // If it's a Message object, ensure it has the correct ID
        if (typeof message === 'object' && message !== null && 'role' in message && 'id' in message) {
            const msg = message as Message;
            // Update the message ID if it's the assistant message
            if (msg.role === 'assistant' && (!msg.id || msg.id === '')) {
                msg.id = assistantMessageId;
            }
        }
        sendEvent(event, message);
    }

    // Create ChainRequestPayload
    const chainPayload: ChainRequestPayload = {
        state: {
            question: message.content,
            history: conversation.messages,
        },
        sendEvent: sendEventWithMessageId,
        preferences,
    };

    console.log('Running supervisor chain');
    let resultPayload: ChainRequestPayload;
    try {
        resultPayload = await runSupervisorChain(chainPayload);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Supervisor chain error:', errorMessage);
        // Fallback: create a basic response
        resultPayload = {
            state: {
                question: message.content,
                finalAnswer: "I encountered an error processing your request. Please try again."
            },
            sendEvent: sendEventWithMessageId,
            preferences
        };
    }

    // Ensure resultPayload has state
    if (!resultPayload || !resultPayload.state) {
        console.error('Invalid resultPayload:', resultPayload);
        resultPayload = {
            state: {
                question: message.content,
                finalAnswer: "I encountered an error processing your request. Please try again."
            },
            sendEvent: sendEventWithMessageId,
            preferences
        };
    }

    // Extract the final answer from the result
    // Priority: finalAnswer (from direct-answer/none/sql-analysis) > contextualizedQuestion > question
    const finalAnswer = resultPayload.state.finalAnswer 
        || resultPayload.state.contextualizedQuestion 
        || resultPayload.state.question 
        || "I couldn't generate a response. Please try again."

    // Update the placeholder assistant message with final answer
    const completedAssistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: finalAnswer,
        createdAt: placeholderAssistantMessage.createdAt,
        status: MessageStatus.COMPLETED
    }

    // Save completed assistant message to Redis
    await addMessage(clientId, completedAssistantMessage, conversation.id);

    // Send updated assistant message in format expected by frontend: { type: 'stream', data: Message, conversationId }
    console.log('[Chain] Emitting completed assistant message:', { clientId, conversationId: conversation.id, messageId: assistantMessageId });
    eventEmitter.emit('message', clientId, JSON.stringify({
        event: 'stream',
        data: completedAssistantMessage,
        conversationId: conversation.id
    }));

    return message;
}
