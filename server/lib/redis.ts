import { Conversation, Message, MessageStatus, Preferences } from '@/types';
import { createClient } from 'redis';
import { defaultPreferences } from '../defaults';
import { cookies } from "next/headers";

declare global {
    var _redisClient: ReturnType<typeof createClient> | undefined;
}

const getConversationsKey = (userId: string) => `user:${userId}:conversations`;
const getConversationCountKey = (userId: string) => `${getConversationsKey(userId)}:count`;
const getConversationKey = (userId: string, conversationId: number) => `${getConversationsKey(userId)}:${conversationId}`;

// Init: connect ONCE, and wait for real 'ready' event
let initPromise: Promise<void> | null = null;

async function initRedis() {
    if (!global._redisClient && typeof window === 'undefined') {
        global._redisClient = createClient({
            url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT ?? '6379'}`,
            pingInterval: 10000,
        });

        global._redisClient.on('connect', () => { console.log('[Redis] Connecting...'); });
        global._redisClient.on('ready', () => { console.log('[Redis] Ready!'); });
        global._redisClient.on('end', () => { console.warn('[Redis] Connection closed!'); });
        global._redisClient.on('error', (err: Error) => { console.error('[Redis] Error:', err); });

        try {
            await global._redisClient.connect();
            await new Promise<void>((resolve, reject) => {
                if (global._redisClient!.isReady) return resolve();
                const onReady = () => {
                    global._redisClient!.off('error', onError);
                    resolve();
                };
                const onError = (err: Error) => {
                    global._redisClient!.off('ready', onReady);
                    reject(err);
                };
                global._redisClient!.once('ready', onReady);
                global._redisClient!.once('error', onError);
            });
            console.log('[Redis] Connected and ready!');
        } catch (err) {
            console.error('Failed to connect to Redis:', err);
            throw err;
        }
    }
}

function getRedisClient() {
    if (!global._redisClient) {
        throw new Error('Redis client was not initialized! Call ensureRedisInitialized() first.');
    }
    return global._redisClient;
}

// Lazy initialization function - call this before using Redis
export async function ensureRedisInitialized() {
    if (!initPromise) {
        initPromise = initRedis();
    }
    await initPromise;
}

export async function getConversationsIds(userId: string): Promise<number[]> {
    await ensureRedisInitialized();
    console.log('getConversationsIds called:', userId);
    const client = getRedisClient();
    const conversationIds = await client.zRange(getConversationsKey(userId), 0, -1, { REV: true });
    console.log('getConversationsIds result:', conversationIds);
    return conversationIds.map((id) => parseInt(id));
}

export async function getConversation(userId: string, conversationId: number, onlyFirstMessage = false): Promise<Conversation> {
    await ensureRedisInitialized();
    console.log('getConversation called:', userId, conversationId, onlyFirstMessage);
    const client = getRedisClient();
    const messages = await client.lRange(getConversationKey(userId, conversationId), 0, onlyFirstMessage ? 0 : -1);
    const result = {
        id: conversationId,
        messages: messages.map((message) => JSON.parse(message) as Message),
    } as Conversation;
    console.log('getConversation result:', result);
    return result;
}

export async function getConversations(userId: string): Promise<Conversation[]> {
    await ensureRedisInitialized();
    console.log('getConversations called:', userId);
    const conversationIds = await getConversationsIds(userId);
    const conversations = await Promise.all(conversationIds.map((id) => getConversation(userId, id)));
    console.log('getConversations result:', conversations);
    return conversations;
}

export async function createConversation(userId: string) {
    await ensureRedisInitialized();
    console.log('createConversation called:', userId);
    const client = getRedisClient();
    const conversationId = await client.incr(getConversationCountKey(userId));
    const conversation = {
        id: conversationId,
        messages: [],
    } as Conversation;
    await client.zAdd(getConversationsKey(userId), { score: new Date().getTime(), value: conversation.id.toString() });
    console.log('createConversation result:', conversation);
    return conversation;
}

export async function addMessage(userId: string, message: Message, conversationId: number) {
    await ensureRedisInitialized();
    console.log('addMessage called:', userId, conversationId, message);
    const client = getRedisClient();
    await Promise.all([
        client.rPush(getConversationKey(userId, conversationId), JSON.stringify(message)),
        ...(message.status === MessageStatus.COMPLETED
            ? [client.zAdd(getConversationsKey(userId), { score: message.createdAt, value: conversationId.toString() })]
            : []),
    ]);
    console.log('addMessage completed:', conversationId);
    return conversationId;
}

export async function lastMessageOfConversation(userId: string, conversationId: number): Promise<Message | null> {
    await ensureRedisInitialized();
    console.log('lastMessageOfConversation called:', userId, conversationId);
    const client = getRedisClient();
    const messages = await client.lRange(getConversationKey(userId, conversationId), -1, -1);
    const result = messages.length > 0 ? JSON.parse(messages[0]) as Message : null;
    console.log('lastMessageOfConversation result:', result);
    return result;
}

export async function removeLastMessageOfConversation(userId: string, conversationId: number) {
    await ensureRedisInitialized();
    console.log('removeLastMessageOfConversation called:', userId, conversationId);
    const client = getRedisClient();
    const result = await client.rPop(getConversationKey(userId, conversationId));
    console.log('removeLastMessageOfConversation result:', result);
    return result;
}

export async function initializeUser(userId: string) {
    await ensureRedisInitialized();
    console.log('initializeUser called:', userId);
    const client = getRedisClient();
    await saveUserPreferences(userId, defaultPreferences);
    await client.set(getConversationCountKey(userId), 0);
    console.log('initializeUser done:', userId);
    return defaultPreferences;
}

export async function saveUserPreferences(userId: string, preferences: Partial<Preferences>) {
    await ensureRedisInitialized();
    console.log('saveUserPreferences called:', userId, preferences);
    const client = getRedisClient();
    const redisPrefs = Object.fromEntries(
        Object.entries(preferences).map(([key, value]) => [key, String(value)])
    );
    await client.hSet(`user:${userId}`, redisPrefs);
    console.log('saveUserPreferences done:', userId);
}

export async function getUserPreferences(): Promise<Preferences> {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value || '';
    await ensureRedisInitialized();
    console.log('getUserPreferences called:', userId);
    const client = getRedisClient();
    try {
        const data = await client.hGetAll(`user:${userId}`);
        console.log({ data })
        const result = {
            ...defaultPreferences,
            ...data,
        } as Preferences;
        console.log('getUserPreferences result:', result);
        return result;
    } catch (error) {
        console.error('[Redis] Error getting user preferences:', error);
        return defaultPreferences;
    }
}

export async function quitRedis() {
    await ensureRedisInitialized();
    console.log('quitRedis called');
    const client = getRedisClient();
    await client.quit();
    console.log('quitRedis done');
}

// Lazy getter for redisClient - ensures initialization
export function getRedisClientInstance() {
    if (!global._redisClient) {
        throw new Error('Redis client was not initialized! Call ensureRedisInitialized() first.');
    }
    return global._redisClient;
}

// For backward compatibility, export redisClient as a getter
const redisClient = new Proxy({} as ReturnType<typeof createClient>, {
    get(_target, prop) {
        const client = getRedisClientInstance();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = (client as any)[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    }
});

export { redisClient };
