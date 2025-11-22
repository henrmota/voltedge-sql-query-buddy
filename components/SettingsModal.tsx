'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Preferences } from '@/types';
import { handleSaveUserPreferences } from '@/server/actions/user';
import { useAppStore } from '@/store/app';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const preferences = useAppStore(state => state.preferences);
  const setPreferences = useAppStore(state => state.setPreferences);
  
  const [formData, setFormData] = useState<Partial<Preferences>>({
    model: '',
    key: '',
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load existing preferences from store when modal opens
  useEffect(() => {
    if (isOpen && preferences) {
      setFormData({
        model: preferences.model || '',
        key: '', // Don't pre-fill API key for security
        name: preferences.name || '',
      });
      setError('');
      setSuccess(false);
    }
  }, [isOpen, preferences]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Model is required, but API key is only required if it's being changed (empty means keep existing)
    if (!formData.model) {
      setError('Model is a required field');
      return;
    }

    // API key is optional - if provided, it should not be just whitespace
    if (formData.key && formData.key.trim() === '') {
      setError('API Key cannot be empty if provided');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Only send fields that are being updated
      const updateData: Partial<Preferences> = {
        model: formData.model,
        name: formData.name || '',
      };
      
      // Only include key if it's being changed (not empty string)
      if (formData.key && formData.key.trim() !== '') {
        updateData.key = formData.key;
      }

      const updatedPreferences = await handleSaveUserPreferences(updateData);
      setPreferences(updatedPreferences as Preferences);
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-light-surface dark:bg-dark-surface rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-light-input dark:hover:bg-dark-input transition-colors"
            aria-label="Close modal"
          >
            <X size={20} className="text-light-text-secondary dark:text-dark-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {!preferences ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                Loading preferences...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
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
                  value={formData.model || ''}
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
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={formData.key || ''}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  placeholder="Leave empty to keep existing key"
                  className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border 
                           bg-light-input dark:bg-dark-input
                           text-light-text-primary dark:text-dark-text-primary
                           placeholder:text-light-text-secondary/50 dark:placeholder:text-dark-text-secondary/50
                           focus:outline-none focus:ring-2 focus:ring-brand-main"
                />
                <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  Leave empty to keep your existing API key. Only enter a new key if you want to change it.
                </p>
              </div>

              {/* Success Message */}
              {success && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Settings saved successfully!
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 px-4 border border-light-border dark:border-dark-border 
                           text-light-text-primary dark:text-dark-text-primary font-medium rounded-lg
                           hover:bg-light-input dark:hover:bg-dark-input transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || success}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-brand-from to-brand-to text-white font-medium rounded-lg
                           hover:brightness-110 active:brightness-90 transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : success ? 'Saved!' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

