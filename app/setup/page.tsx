'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { Preferences } from '@/types';
import { handleSaveUserPreferences } from '@/server/actions/user';
import { useAppStore } from '@/store/app';

export default function Setup() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const preferences = useAppStore(state => state.preferences);
  const setPreferences = useAppStore(state => state.setPreferences);
  const theme = useAppStore(state => state.theme);

  const [formData, setFormData] = useState<Partial<Preferences>>({ model: preferences?.model ?? '', key: preferences?.key ?? '', name: preferences?.name ?? '' });
  
  // Initialize theme from HTML element on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const htmlElement = document.documentElement;
      const currentTheme = htmlElement.classList.contains('dark') ? 'dark' : 'light';
      if (currentTheme !== theme) {
        useAppStore.setState({ theme: currentTheme });
      }
    }
  }, [theme]);
  
  useEffect(() => {
    if (!preferences) return; 
    setFormData({ model: preferences.model, key: preferences.key, name: preferences.name });
  }, [preferences]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.model || !formData.key) {
      setError('Model and API Key are required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const preferences = await handleSaveUserPreferences(formData);
      setPreferences(preferences as Preferences);
      router.push('/');
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-light-surface dark:bg-dark-surface rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <Logo height={60} className="mb-4" />
          <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
            Welcome to VoltEdge
          </h1>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-center">
            Let&apos;s set up your preferences to get started
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border 
                       bg-light-input dark:bg-dark-input
                       text-light-text-primary dark:text-dark-text-primary
                       placeholder:text-light-text-secondary/50 dark:placeholder:text-dark-text-secondary/50
                       focus:outline-none focus:ring-2 focus:ring-brand-main"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
              API Model <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="e.g., gpt-4o, gpt-4-turbo, gpt-3.5-turbo"
              required
              className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border 
                       bg-light-input dark:bg-dark-input
                       text-light-text-primary dark:text-dark-text-primary
                       placeholder:text-light-text-secondary/50 dark:placeholder:text-dark-text-secondary/50
                       focus:outline-none focus:ring-2 focus:ring-brand-main"
            />
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Enter the OpenAI model name you want to use
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
              OpenAI API Key <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="password"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              placeholder="sk-..."
              required
              className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border 
                       bg-light-input dark:bg-dark-input
                       text-light-text-primary dark:text-dark-text-primary
                       placeholder:text-light-text-secondary/50 dark:placeholder:text-dark-text-secondary/50
                       focus:outline-none focus:ring-2 focus:ring-brand-main"
            />
            <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Your API key is stored securely and never shared
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-brand-from to-brand-to text-white font-medium rounded-lg
                     hover:brightness-110 active:brightness-90 transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}

