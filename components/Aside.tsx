'use client';

import { useAppStore } from '@/store/app';
import Switch from './Switch';
import {
  MessageCircle,
  MessageCircleX,
  Plus,
  Settings,
} from 'lucide-react';
import Logo from './Logo';
import { useMemo, useState, useEffect } from 'react';
import SettingsModal from './SettingsModal';

export default function ChatAside() {
  const conversationsMap = useAppStore((state) => state.conversations);
  const conversationIds = useAppStore((state) => state.conversationIds);
  const activeConversationId = useAppStore(
    (state) => state.activeConversation.id
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const conversations = useMemo(() => {
    return conversationIds
      .map((id) => conversationsMap.get(id))
      .filter(Boolean);
  }, [conversationIds, conversationsMap]);

  const setActiveConversation = useAppStore(
    (state) => state.selectConversation
  );
  const theme = useAppStore((state) => state.theme);

  // Sync theme from HTML element on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const htmlElement = document.documentElement;
      const currentTheme = htmlElement.classList.contains('dark') ? 'dark' : 'light';
      if (currentTheme !== theme) {
        useAppStore.setState({ theme: currentTheme });
      }
    }
  }, [theme]);
  return (
    <>
      <aside
        className={`flex flex-col h-full w-80 flex-shrink-0 border-r border-light-border dark:border-dark-border
                  bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary
                  `}
      >
        <header className="justify-center border-b h-[60px] border-light-border dark:border-dark-border color-text-primary flex items-center bg-light-surface dark:bg-dark-surface">
          <Logo height={50} className="mb-[6px]" />
        </header>
        <div className="p-4 border-b flex flex-col gap-2 items-center justify-between border-light-border dark:border-dark-border">
          <Switch
            enabled={theme === 'dark'}
            setEnabled={() => useAppStore.getState().toogleTheme()}
          />
        </div>
        {/* Header */}
        <div className="flex flex-col justify-between px-4 pt-6 pb-2"></div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {/* Section Header */}
          <div className="flex items-center gap-3 mb-4 px-2 py-1">
            <MessageCircle
              size={18}
              className="text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0"
            />
            <p className="font-semibold text-sm text-light-text-primary dark:text-dark-text-primary">
              Conversations
            </p>
          </div>

          {conversations?.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-light-text-secondary dark:text-dark-text-secondary">
              <MessageCircleX size={16} className="flex-shrink-0" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* New Conversation Button */}
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                         text-light-text-primary dark:text-dark-text-primary
                         bg-light-input/50 dark:bg-dark-input/50
                         hover:bg-light-input dark:hover:bg-dark-input
                         cursor-pointer
                         transition-all duration-200 shadow-sm hover:shadow-md
                         group"
                onClick={() => setActiveConversation(-1).catch(console.error)}
              >
                <Plus
                  size={18}
                  className="flex-shrink-0 group-hover:rotate-90 transition-transform duration-200"
                />
                <span>New Conversation</span>
              </button>

              {/* Conversations List */}
              <div className="mt-3 space-y-1">
                {conversations
                  .filter((conversation) => conversation !== undefined)
                  .map((conversation) => {
                    const isActive = conversation.id === activeConversationId;
                    return (
                      <div
                        key={conversation.messages[0]?.id || conversation.id}
                        onClick={() => setActiveConversation(conversation.id)}
                        className={`
                      group relative flex items-start gap-3 px-3 py-2.5 rounded-lg
                      cursor-pointer transition-all duration-200
                      ${
                        isActive
                          ? 'bg-light-input dark:bg-dark-input border-l-2 border-brand-main'
                          : 'hover:bg-light-input/50 dark:hover:bg-dark-input/50 border-l-2 border-transparent'
                      }
                    `}
                      >
                        <MessageCircle
                          size={16}
                          className={`flex-shrink-0 mt-0.5 transition-colors duration-200
                        ${
                          isActive
                            ? 'text-brand-main'
                            : 'text-light-text-secondary dark:text-dark-text-secondary group-hover:text-brand-main'
                        }`}
                        />
                        <p
                          className={`
                      text-sm line-clamp-2 leading-relaxed transition-colors duration-200
                      ${
                        isActive
                          ? 'text-light-text-primary dark:text-dark-text-primary font-medium'
                          : 'text-light-text-secondary dark:text-dark-text-secondary group-hover:text-light-text-primary dark:group-hover:text-dark-text-primary'
                      }
                    `}
                        >
                          {conversation.messages[0]?.content ||
                            'New conversation'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="p-4 border-t border-light-border dark:border-dark-border">
          <button
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 
                     cursor-pointer text-sm font-medium text-light-text-primary dark:text-dark-text-primary
                     rounded-lg
                     transition-all duration-200 group"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings
              size={18}
              className="flex-shrink-0 group-hover:rotate-45 transition-transform duration-300"
            />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
