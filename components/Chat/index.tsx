'use client';
import Aside from '@/components/Aside';
import { Conversation, Preferences } from '@/types';
import ConversationChat from '@/components/Chat/Conversation';
import { useAppStore } from '@/store/app';
import { useEffect, useEffectEvent } from 'react';

interface ChatProps {
  conversations: Conversation[];
  preferences: Preferences;
}

export default function Chat({ conversations, preferences }: ChatProps) {
  const init = useAppStore((state) => state.initialize);
  useEffect(() => {
    init(conversations ?? [], preferences);
  }, [conversations, init, preferences]);

  return (
    <div className="h-screen w-full flex overflow-hidden">
      <Aside conversations={conversations} />
      <main className="flex-1 min-w-0 h-full overflow-hidden p-6 bg-light-bg dark:bg-dark-bg">
        <div className="w-full h-full max-w-full">
          <ConversationChat />
        </div>
      </main>
    </div>
  );
}
