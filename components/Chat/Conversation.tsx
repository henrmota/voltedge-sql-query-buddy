/* eslint-disable react/display-name */
'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app';
import { Message } from '@/types';
import { ArrowUp, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { type Conversation } from '@/types';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie, PolarArea, Radar, Scatter, Bubble, Doughnut } from 'react-chartjs-2';
import React from 'react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale,
  Tooltip,
  Legend
);

// Function to clean color values by removing spaces from hex codes
// Handles cases like "#3 B82 F6" -> "#3B82F6"
const cleanColorValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    // Remove spaces from hex color codes (e.g., "#3 B82 F6" -> "#3B82F6")
    return value.replace(/#\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])/g, '#$1$2$3$4$5$6')
                 .replace(/#\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])/g, '#$1$2$3');
  }
  if (Array.isArray(value)) {
    return value.map(cleanColorValue);
  }
  return value;
};

// Function to fix property names with spaces (backend issue)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeChartJSON = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(normalizeChartJSON);
  }
  
  if (obj !== null && typeof obj === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized: any = {};
    for (const key in obj) {
      // Remove spaces from property names and convert to camelCase
      const normalizedKey = key.replace(/\s+/g, '');
      const value = normalizeChartJSON(obj[key]);
      
      // Clean color values in color-related properties
      if (key.toLowerCase().includes('color') || 
          normalizedKey.toLowerCase().includes('color')) {
        normalized[normalizedKey] = cleanColorValue(value);
      } else {
        // Preserve label values as-is (don't modify xLabel/yLabel content)
        normalized[normalizedKey] = value;
      }
    }
    return normalized;
  }
  
  // Clean color values in string values
  if (typeof obj === 'string' && obj.startsWith('#')) {
    return cleanColorValue(obj);
  }
  
  return obj;
};

// Memoized chart renderer with download button
const ChartRenderer = React.memo(({ code, graphColors }: { code: string; graphColors: { legendColor: string; gridColor: string; tickColor: string } }) => {
  let config;

  try {
    const parsed = JSON.parse(code);
    // Normalize property names (remove spaces)
    config = normalizeChartJSON(parsed);
  } catch (error) {
    return <pre className="text-red-500 dark:text-red-400">Invalid chart JSON: {String(error)}</pre>;
  }

  const { type, data, options = {} } = config;

  // Validate data structure
  if (!data || typeof data !== 'object') {
    return <pre className="text-red-500 dark:text-red-400">Invalid chart data: data must be an object</pre>;
  }

  // Ensure datasets exists and is an array
  if (!data.datasets || !Array.isArray(data.datasets) || data.datasets.length === 0) {
    return <pre className="text-red-500 dark:text-red-400">Invalid chart data: datasets array is required and must not be empty</pre>;
  }

  // Extract color overrides and labels
  // Handle normalized property names (spaces removed by normalizeChartJSON)
  const {
    colorOverrides = {},
    xLabel: xLabelOption,
    yLabel: yLabelOption,
    // Also check for normalized versions (spaces removed)
    xlabel: xLabelNormalized,
    ylabel: yLabelNormalized
  } = options;

  const legendColor = colorOverrides.legendColor ?? graphColors.legendColor;
  const xTickColor = colorOverrides.xTickColor ?? graphColors.tickColor;
  const yTickColor = colorOverrides.yTickColor ?? graphColors.tickColor;
  const gridColor = colorOverrides.gridColor ?? graphColors.gridColor;
  
  // Extract labels - prioritize camelCase, then lowercase, then use empty string (don't show generic defaults)
  const xLabel = xLabelOption || xLabelNormalized || '';
  const yLabel = yLabelOption || yLabelNormalized || '';

  // Default color palette matching agent instructions
  const defaultColors = [
    { border: '#3B82F6', background: 'rgba(59,130,246,0.1)' }, // Primary Blue
    { border: '#10B981', background: 'rgba(16,185,129,0.1)' }, // Green
    { border: '#F59E0B', background: 'rgba(245,158,11,0.1)' }, // Amber
    { border: '#8B5CF6', background: 'rgba(139,92,246,0.1)' }, // Purple
    { border: '#EF4444', background: 'rgba(239,68,68,0.1)' }, // Red
    { border: '#14B8A6', background: 'rgba(20,184,166,0.1)' }, // Teal
    { border: '#EC4899', background: 'rgba(236,72,153,0.1)' }, // Pink
    { border: '#6366F1', background: 'rgba(99,102,241,0.1)' }, // Indigo
  ];

  // Preserve backend-provided colors, only apply defaults when colors are missing
  const themedData = {
    ...data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    datasets: data.datasets.map((dataset: any, index: number) => {
      const defaultColor = defaultColors[index % defaultColors.length];
      
      // Helper to clean a color string (remove spaces from hex codes)
      const cleanColorString = (color: string): string => {
        // Remove spaces from hex color codes (e.g., "#3 B82 F6" -> "#3B82F6")
        return color.replace(/#\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])/g, '#$1$2$3$4$5$6')
                    .replace(/#\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])\s*([0-9A-Fa-f])/g, '#$1$2$3')
                    .trim();
      };
      
      // Helper to check if a single color value is valid (string)
      const isValidColorString = (color: unknown): color is string => {
        if (typeof color !== 'string') return false;
        const trimmed = color.trim();
        // Accept hex colors, rgb/rgba, named colors, etc.
        return trimmed !== '' && trimmed !== 'null' && trimmed !== 'undefined';
      };
      
      // Helper to check if a color value is valid (string or array of strings)
      const isValidColor = (color: unknown): boolean => {
        if (isValidColorString(color)) return true;
        if (Array.isArray(color) && color.length > 0) {
          return color.every(c => isValidColorString(c));
        }
        return false;
      };
      
      // Helper to check if backgroundColor is valid (string or non-empty array)
      const isValidBackgroundColor = (bgColor: unknown): boolean => {
        return isValidColor(bgColor);
      };
      
      // Debug: Log original dataset colors
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Chart] Dataset ${index} original colors:`, {
          borderColor: dataset.borderColor,
          backgroundColor: dataset.backgroundColor,
          pointBackgroundColor: dataset.pointBackgroundColor,
          pointBorderColor: dataset.pointBorderColor
        });
      }
      
      // Build the dataset object, preserving backend colors when valid
      const processedDataset: any = { ...dataset };
      
      // Only override borderColor if missing or invalid (preserve backend value if valid)
      // borderColor can be a string (line charts) or array (bar charts)
      if (isValidColor(dataset.borderColor)) {
        // Clean and keep backend color (string or array)
        if (typeof dataset.borderColor === 'string') {
          processedDataset.borderColor = cleanColorString(dataset.borderColor);
        } else if (Array.isArray(dataset.borderColor)) {
          processedDataset.borderColor = dataset.borderColor.map((c: string | unknown) => 
            typeof c === 'string' ? cleanColorString(c) : c
          );
        } else {
          processedDataset.borderColor = dataset.borderColor;
        }
      } else {
        // Use default - for bar charts, convert to array; for line charts, use string
        processedDataset.borderColor = type === 'bar' ? [defaultColor.border] : defaultColor.border;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Chart] Dataset ${index} borderColor missing/invalid, using default:`, processedDataset.borderColor);
        }
      }
      
      // Only override backgroundColor if missing or invalid (preserve backend value if valid)
      // backgroundColor can be a string (line charts) or array (bar charts)
      if (isValidBackgroundColor(dataset.backgroundColor)) {
        // Clean and keep backend color (string or array)
        if (typeof dataset.backgroundColor === 'string') {
          processedDataset.backgroundColor = cleanColorString(dataset.backgroundColor);
        } else if (Array.isArray(dataset.backgroundColor)) {
          processedDataset.backgroundColor = dataset.backgroundColor.map((c: string | unknown) => 
            typeof c === 'string' ? cleanColorString(c) : c
          );
        } else {
          processedDataset.backgroundColor = dataset.backgroundColor;
        }
      } else {
        // Use default - for bar charts, convert to array; for line charts, use string
        processedDataset.backgroundColor = type === 'bar' ? [defaultColor.background] : defaultColor.background;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Chart] Dataset ${index} backgroundColor missing/invalid, using default:`, processedDataset.backgroundColor);
        }
      }
      
      // Only override pointBackgroundColor if missing or invalid
      // pointBackgroundColor should be a string (for line/scatter charts)
      if (isValidColorString(dataset.pointBackgroundColor)) {
        processedDataset.pointBackgroundColor = cleanColorString(dataset.pointBackgroundColor);
      } else {
        // Fallback to borderColor if valid (extract first if array), otherwise use default
        if (isValidColor(dataset.borderColor)) {
          const borderColorValue = Array.isArray(dataset.borderColor) 
            ? dataset.borderColor[0] 
            : dataset.borderColor;
          processedDataset.pointBackgroundColor = typeof borderColorValue === 'string' 
            ? cleanColorString(borderColorValue) 
            : borderColorValue;
        } else {
          processedDataset.pointBackgroundColor = defaultColor.border;
        }
      }
      
      // Only override pointBorderColor if missing or invalid
      // pointBorderColor should be a string (for line/scatter charts)
      if (isValidColorString(dataset.pointBorderColor)) {
        processedDataset.pointBorderColor = cleanColorString(dataset.pointBorderColor);
      } else {
        processedDataset.pointBorderColor = graphColors.legendColor;
      }
      
      // Debug: Log final processed colors
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Chart] Dataset ${index} final colors:`, {
          borderColor: processedDataset.borderColor,
          backgroundColor: processedDataset.backgroundColor,
          pointBackgroundColor: processedDataset.pointBackgroundColor,
          pointBorderColor: processedDataset.pointBorderColor
        });
      }
      
      return processedDataset;
    }) || []
  };

  const chartProps = { data: themedData, options };

  const ChartComponent = (() => {
    const dimensions = { width: 400, height: 400 };

    const finalOptions = {
      ...options,
      responsive: false,
      maintainAspectRatio: true,
      plugins: {
        ...(options.plugins || {}),
        // Disable Chart.js automatic color plugin - we handle colors ourselves
        colors: {
          enabled: false,
          forceOverride: false
        },
        title: {
          ...(options.plugins?.title || {}),
          color: legendColor,
          display: options.title ? true : (options.plugins?.title?.display ?? false),
          text: options.title || options.plugins?.title?.text || '',
        },
        legend: {
          ...(options.plugins?.legend || {}),
          labels: {
            ...(options.plugins?.legend?.labels || {}),
            color: legendColor
          }
        },
        tooltip: {
          ...(options.plugins?.tooltip || {}),
          backgroundColor: graphColors.legendColor === '#f9fafb' ? '#1f2937' : '#ffffff',
          titleColor: graphColors.legendColor === '#f9fafb' ? '#ffffff' : '#1f2937',
          bodyColor: graphColors.legendColor === '#f9fafb' ? '#ffffff' : '#1f2937',
          borderColor: gridColor,
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          ...(options.scales?.x || {}),
          grid: {
            ...(options.scales?.x?.grid || {}),
            color: gridColor
          },
          ticks: {
            ...(options.scales?.x?.ticks || {}),
            color: xTickColor
          },
          title: {
            display: !!xLabel, // Only display if label is provided
            text: xLabel || '',
            color: legendColor,
            ...(options.scales?.x?.title || {})
          }
        },
        y: {
          ...(options.scales?.y || {}),
          grid: {
            ...(options.scales?.y?.grid || {}),
            color: gridColor
          },
          ticks: {
            ...(options.scales?.y?.ticks || {}),
            color: yTickColor
          },
          title: {
            display: !!yLabel, // Only display if label is provided
            text: yLabel || '',
            color: legendColor,
            ...(options.scales?.y?.title || {})
          }
        }
      }
    };

    switch (type) {
      case "bar": return <Bar {...chartProps} {...dimensions} options={finalOptions} />;
      case "line": return <Line {...chartProps} {...dimensions} options={finalOptions} />;
      case "pie": return <Pie {...chartProps} {...dimensions} options={finalOptions} />;
      case "polarArea": return <PolarArea {...chartProps} {...dimensions} options={finalOptions} />;
      case "radar": return <Radar {...chartProps} {...dimensions} options={finalOptions} />;
      case "scatter": return <Scatter {...chartProps} {...dimensions} options={finalOptions} />;
      case "bubble": return <Bubble {...chartProps} {...dimensions} options={finalOptions} />;
      case "doughnut": return <Doughnut {...chartProps} {...dimensions} options={finalOptions} />;
      default: return <pre className="text-red-500 dark:text-red-400">Unknown chart type: {type}</pre>;
    }
  })();

  return (
    <div 
      data-chart-container
      className="relative shadow-lg flex my-6 items-center justify-center group w-[600px] h-[600px] 
                    border-2 border-light-border dark:border-dark-border rounded-xl
                    bg-light-surface dark:bg-dark-surface p-6"
      style={{ isolation: 'isolate' }}
    >
      {ChartComponent}
    </div>
  );
});
// Function to normalize Unicode characters in math/markdown content
const normalizeContent = (content: string): string => {
  return content
    // Normalize asterisk operators to regular asterisks
    .replace(/∗/g, '*')
    // Normalize prime marks around text (′text′ -> "text")
    .replace(/′\s*([^′]+)\s*′/g, '"$1"')
    // Remove remaining standalone prime marks
    .replace(/′/g, "'")
    // Normalize other mathematical/typographic Unicode to ASCII
    .replace(/−/g, '-')  // minus sign to hyphen
    .replace(/×/g, 'x')  // multiplication sign
    .replace(/÷/g, '/')  // division sign
    // Remove zero-width spaces and other invisible characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Fix missing spaces: add space before capital letter after lowercase/digit/punctuation
    .replace(/([a-z0-9.])([A-Z])/g, '$1 $2')
    // Fix missing spaces: add space after period/comma if followed by letter
    .replace(/([.,])([A-Za-z])/g, '$1 $2')
    // Fix missing spaces: add space before 'with' or 'of' or 'the' when attached
    .replace(/(product|revenue|dataset)(with|of|the|is)/gi, '$1 $2')
    // Clean up dollar signs that are improperly formatted (e.g., "word$" -> "word $")
    .replace(/([a-zA-Z])\$/g, '$1 $')
    .replace(/\$([a-zA-Z])/g, '$ $1')
    // Normalize multiple spaces to single space (but preserve newlines)
    .replace(/[^\S\n]+/g, ' ')
    // Clean up any remaining formatting issues
    .trim();
};

// Memoized message item
const MessageItem = React.memo(({ msg, graphColors }: { msg: Message; graphColors: { legendColor: string; gridColor: string; tickColor: string } }) => {
  const normalizedContent = normalizeContent(msg.content);
  
  return (
    <div className={`flex w-full mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          ${msg.role === 'user' ? 'max-w-[70%]' : 'max-w-[95%]'}
          rounded-xl flex items-start gap-3 text-md min-w-0
          ${msg.role === 'user'
            ? 'bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white p-3'
            : 'bg-transparent text-light-text-primary dark:text-dark-text-primary p-2'}
        `}
      >
        {msg.role === 'user' ? (
          <User className="flex-shrink-0 text-white mt-0.5" size={20} />
        ) : (
          <Bot className="flex-shrink-0 text-brand-main mt-10" size={22} />
        )}

        {msg.role === 'assistant' ? (
          <div className="min-w-0 flex-1 overflow-x-auto mt-10">
            <div className="prose dark:prose-invert max-w-none text-base leading-relaxed -mt-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                  [rehypeHighlight, { ignoreMissing: true, subset: false }]
                ]}
                skipHtml={false}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const code = String(children).trim();
                    
                    if (match && match[1] === 'chart') {
                      return <ChartRenderer code={code} graphColors={graphColors} />;
                    }
                    return (
                      <code className={className ?? undefined} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {normalizedContent}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <p className="text-white break-words flex-1 min-w-0">
            {msg.content}
          </p>
        )}
      </div>
    </div>
  );
}, (prev, next) => 
  prev.msg.id === next.msg.id && 
  prev.msg.content === next.msg.content && 
  prev.graphColors.legendColor === next.graphColors.legendColor &&
  prev.graphColors.gridColor === next.graphColors.gridColor &&
  prev.graphColors.tickColor === next.graphColors.tickColor
);

export default function Conversation() {
  const conversation = useAppStore((state) => state.activeConversation);
  const thinking = useAppStore((state) => state.thinking);
  const sendMessage = useAppStore((state) => state.sendMessage);
  const graphColors = useAppStore((state) => state.graphColors);
  const [message, setMessage] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUserNearBottomRef = useRef(true);
  const INPUT_HEIGHT = 80;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const scrollToBottomWithRetries = useCallback((retries = 3, delay = 120) => {
    scrollToBottom('auto');
    if (retries <= 0) return;
    for (let i = 1; i <= retries; i++) {
      setTimeout(() => scrollToBottom('smooth'), i * delay);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isUserNearBottomRef.current = distanceFromBottom < 140;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.style.paddingBottom = `${INPUT_HEIGHT + 16}px`;
    if (isUserNearBottomRef.current) {
      scrollToBottomWithRetries(4, 150);
    }
  }, [conversation.messages.length, thinking, scrollToBottomWithRetries]);

  const handleSendMessage = useCallback(() => {
    if (!message.trim()) return;
    sendMessage(message);
    setMessage('');
  }, [message, sendMessage]);

  return (
    <div className="relative flex flex-col w-full h-full bg-light-surface dark:bg-dark-surface rounded-2xl overflow-hidden">
      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-hidden overflow-y-auto p-4"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: `calc(${INPUT_HEIGHT} + 1rem)` // Add space for fixed input
        }}
      >
        <div className="max-w-5xl mx-auto w-full">
          {conversation.messages.map((msg) => (
            <MessageItem key={msg.id} msg={msg} graphColors={graphColors} />
          ))}

          {thinking ? (
            <div className="flex justify-start">
              <p className="text-md thinking-gradient">...{thinking}</p>
            </div>
          ): null}
        </div>
      </div>

      {/* Input */}
      <div className="absolute left-4 right-4 bottom-4" style={{ height: INPUT_HEIGHT }}>
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-2 bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-md shadow-lg p-2 border border-light-border dark:border-dark-border rounded-full h-full">
            <input
              type="text"
              value={message}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="border-none flex-1 px-4 py-3 rounded-full outline-none text-light-text-primary dark:text-dark-text-primary bg-transparent placeholder:text-light-text-secondary/50 dark:placeholder:text-dark-text-secondary/50"
            />
            <button
              onClick={handleSendMessage}
              className="rounded-full p-2 bg-brand-main text-white hover:brightness-110 transition cursor-pointer mr-2"
            >
              <ArrowUp size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
