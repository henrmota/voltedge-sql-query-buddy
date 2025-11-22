import { callAsk, callGetConversation } from "@/server/actions/conversations";
import { handleSaveUserPreferences } from "@/server/actions/user";
import { Conversation, MessageStatus, Preferences } from "@/types";
import { Message } from "@/types/server";
import { create } from "zustand";
import { v4 as uuidv4 } from 'uuid';

// Color constants matching the theme defined in globals.css
const THEME_COLORS = {
    light: {
        text: '#1f2937',
        border: '#e5e7eb',
    },
    dark: {
        text: '#f9fafb',
        border: '#2d333b',
    },
};

interface AppStore {
    userId: string;
    graphColors: {
        legendColor: string;
        gridColor: string;
        tickColor: string;
    };
    preferences?: Preferences;
    setPreferences: (preferences: Preferences) => void;
    conversationIds: number[];
    conversations: Map<number, Conversation>;
    activeConversation: Conversation;
    newConversation: () => void;
    thinking: string;
    actOnConversation: (conversation: Conversation, conversationAction?: 'create' | 'append') => void;
    addMessage: (message: Message, conversationId: number) => void;
    sendMessage: (message: string) => void;
    selectConversation: (id: number) => Promise<void>;
    getConversation: (id: number) => Conversation | undefined;
    theme: 'light' | 'dark';
    toogleTheme: () => void;
    initialize: (conversations: Conversation[], preferences?: Preferences) => void;
    fetch: (url: string, options: RequestInit) => Promise<Response>;
}

export const useAppStore = create<AppStore>((set, get) => ({
    theme: 'light', // Always start with 'light' to avoid hydration mismatch
    thinking: '',
    userId: '',
    graphColors: {
        legendColor: THEME_COLORS.light.text,
        gridColor: THEME_COLORS.light.border,
        tickColor: THEME_COLORS.light.border,
    },
    activeConversation: {
        id: -1,
        messages: [],
    },
    conversations: new Map<number, Conversation>(),
    conversationIds: [],
    setPreferences: (preferences: Preferences) => {
        set({ preferences: preferences });
    },
    fetch: (url, { headers, ...options }) => fetch(
        process.env.NEXT_PUBLIC_BACKEND_API_URL + '/' + url,
        {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Identifier': get().userId,
            },
            ...options,
        }),
    newConversation: () => {
        const newConversation = {
            id: -1,
            messages: [],
        };

        set({ activeConversation: newConversation });
    },
    actOnConversation: (conversation: Conversation) => {
        const conversations = get().conversations;
        const activeConversation = get().activeConversation;
        const conversationIds = get().conversationIds;

        const hasConversation = conversationIds.includes(conversation.id);
        conversations.set(conversation.id, conversation);
        if (!hasConversation) {
            set({ conversationIds: [...conversationIds, conversation.id], activeConversation: { ...conversation } });
        } else if (activeConversation.id === conversation.id) {
            set({
                activeConversation: { ...conversation },
            })
        }
    },
    addMessage: (message: Message, conversationId: number) => {
        const conversation = get().getConversation(conversationId);
        const conversations = get().conversations;
        if (conversation) {
            const messages = [...conversation.messages.filter(m => m.id !== message.id), message];
            conversation.messages = messages;
            conversations.set(conversationId, { ...conversation });
            
            // If message is completed, reorder conversationIds by last message date
            let updatedConversationIds = get().conversationIds;
            if (message.status === MessageStatus.COMPLETED) {
                // Get all conversations and sort by last message createdAt (most recent first)
                const allConversations = Array.from(conversations.values());
                const sortedIds = allConversations
                    .map(conv => ({
                        id: conv.id,
                        lastMessageDate: conv.messages.length > 0 
                            ? Math.max(...conv.messages.map(m => m.createdAt))
                            : 0
                    }))
                    .sort((a, b) => b.lastMessageDate - a.lastMessageDate)
                    .map(item => item.id);
                
                updatedConversationIds = sortedIds;
            }
            
            set({ 
                activeConversation: { ...conversation }, 
                thinking: message.status === MessageStatus.COMPLETED ? '' : get().thinking,
                conversationIds: updatedConversationIds
            });
            
            // Clear thinking when streaming message arrives (assistant is responding)
            if (message.status === MessageStatus.STREAMING && message.role === 'assistant') {
                set({ thinking: '' });
            }
        } else {
            const activeConversation = get().activeConversation;
            activeConversation.messages.push(message);
            set({ activeConversation: activeConversation, thinking: message.status === MessageStatus.COMPLETED ? '' : get().thinking });
        }
    },
    sendMessage: async (question: string) => {
        if (question.trim() === '') return;

        const activeConversation = get().activeConversation;
        const message = {
            id: uuidv4(),
            role: 'user',
            content: question,
            createdAt: new Date().getDate(),
            status: MessageStatus.DRAFT
        } as Message;

        get().addMessage(message, activeConversation?.id);

        set({ activeConversation: activeConversation });

        const response = await callAsk(question, get().activeConversation.id);
        get().actOnConversation(response);

    },
    selectConversation: async (id: number) => {
        if (id === -1) {
            set({ activeConversation: { id: -1, messages: [] } });
            return;
        }

        const conversation = await callGetConversation(id);

        get().actOnConversation(conversation);
        set({ activeConversation: conversation });

    },
    getConversation: (id: number) => {
        return get().conversations.get(id);
    },
    toogleTheme: () => {
        const current = get().theme;
        const next = current === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        setTheme(next);
        handleSaveUserPreferences({ theme: next });
    },
    initialize: async (conversations: Conversation[], preferences?: Preferences) => {
        const id = document.cookie.split('; ').find(row => row.startsWith('userId='))?.split('=')[1] || '';

        const conversationMap = new Map<number, Conversation>();
        conversations.forEach((conversation) => {
            conversationMap.set(conversation.id, conversation);

        });

        // Use passed preferences or fallback to HTML attribute
        const prefs: Preferences = preferences || JSON.parse(document.querySelector('html')?.getAttribute('data-user-id') || '{}');
        
        // Get theme from HTML element class (set by server) or preferences
        let theme: 'light' | 'dark' = 'light';
        if (typeof document !== 'undefined') {
            const htmlElement = document.documentElement;
            if (htmlElement.classList.contains('dark')) {
                theme = 'dark';
            } else if (htmlElement.classList.contains('light')) {
                theme = 'light';
            } else {
                theme = prefs.theme ?? 'light';
            }
        } else {
            theme = prefs.theme ?? 'light';
        }

        // Ensure HTML element matches the theme
        if (typeof document !== 'undefined') {
            const root = document.documentElement;
            if (theme === 'dark') {
                root.classList.add('dark');
                root.classList.remove('light');
            } else {
                root.classList.add('light');
                root.classList.remove('dark');
            }
        }

        set({ userId: id, conversations: conversationMap, conversationIds: conversations.map((conversation) => conversation.id), theme, preferences: prefs });

        const sse = new EventSource('/api/real-time?clientId=' + id);
        sse.onopen = () => console.log('Connected to SSE');

        sse.onmessage = (payload) => {
            const eventData = JSON.parse(payload.data);
            const { type, data, ...event } = eventData as { type: string, data: Message | string, conversationId: number };


            console.log(eventData);
            requestAnimationFrame(() => {
                if (type === 'stream') {
                    get().addMessage(data as Message, event.conversationId);
                } else if (type === 'thinking') {
                    set({ thinking: data as string });
                }
            });
        }
    },
}));

async function setTheme(theme: 'light' | 'dark') {
    const root = document.documentElement; // <html> element
    if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.add('light');
        root.classList.remove('dark');
    }

    if (theme === 'dark') {
        // @ts-expect-error - import is not a function
        import('highlight.js/styles/github-dark.css');
    } else {
        // @ts-expect-error - import is not a function
        import('highlight.js/styles/github.css');
    }

    const colors = theme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light;
    useAppStore.setState({
        graphColors: {
            legendColor: colors.text,
            gridColor: colors.border,
            tickColor: colors.border,
        },
    });
}

