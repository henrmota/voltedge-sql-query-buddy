import { NextRequest } from 'next/server';
import eventEmitter from './emitter';

export async function GET(request: NextRequest) {
  // Get userId from query param (clientId) or cookies
  const url = new URL(request.url);
  const clientIdFromQuery = url.searchParams.get('clientId') || '';
  const userIdFromCookie = request.cookies.get('userId')?.value || '';
  const currentUserId = clientIdFromQuery || userIdFromCookie;

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      const sendEvent = <T extends Record<string, unknown>>(type: string, json: T) => {
        const data = {
          ...json,
          type,
        }

        const message = `data: ${JSON.stringify(data)}\n\n`;

        controller.enqueue(encoder.encode(message));
      };

      // Handle message events from backend
      const messageHandler = (userId: string, message: string | Record<string, unknown>) => {
        // Debug logging
        console.log('[SSE] Message received:', { userId, currentUserId, match: userId === currentUserId });
        
        if (!currentUserId || userId !== currentUserId) {
          console.log('[SSE] Message filtered - userId mismatch or empty currentUserId');
          return;
        }

        let data: Record<string, unknown> = {};
        
        // Handle both string and object messages
        if (typeof message === 'string') {
          try {
            data = JSON.parse(message);
          } catch (error: unknown) {
            console.error('Error parsing message string', error);
            return;
          }
        } else if (typeof message === 'object' && message !== null) {
          data = message;
        } else {
          console.error('Invalid message format', message);
          return;
        }

        // If message already has event/type structure from sendEvent, use it
        // Otherwise wrap it appropriately
        if (data.event && data.data !== undefined) {
          // Format: { event: 'stream'|'thinking', data: Message|string, conversationId: number }
          sendEvent(data.event as string, {
            data: data.data,
            conversationId: data.conversationId,
          });
        } else {
          // Format: Message object or other data
          // Determine type based on message structure
          const eventType = data.role === 'assistant' || data.role === 'user' ? 'stream' : 'message';
          sendEvent(eventType, data);
        }
      };

      eventEmitter.on('message', messageHandler);

      // Send initial connection event
      sendEvent('connected', { timestamp: Date.now() });

      // Keep connection alive with heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          sendEvent('heartbeat', { timestamp: Date.now() });
        } catch {
          clearInterval(heartbeatInterval);
          controller.close();
        }
      }, 30000); // Every 30 seconds

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        eventEmitter.off('message', messageHandler);
        controller.close();
      });
    },
  });

  // Return SSE response with proper headers
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  });
}

