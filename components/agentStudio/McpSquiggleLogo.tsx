import React from 'react';

/** Minimal MCP-style mark (squiggle in a rounded square) used on canvas + inspector. */
export function McpSquiggleLogo({
  className,
  size = 'md',
  tone = 'default',
}: {
  className?: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'on_bar';
}) {
  const outer =
    tone === 'on_bar'
      ? size === 'sm'
        ? 'h-6 w-6 rounded-md border border-white/35 bg-white/15'
        : 'h-11 w-11 rounded-xl border border-white/35 bg-white/15 shadow-sm'
      : size === 'sm'
        ? 'h-6 w-6 rounded-md border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900'
        : 'h-11 w-11 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900';
  const dim = size === 'sm' ? 14 : 26;
  const svgTone = tone === 'on_bar' ? 'text-white' : 'text-slate-900 dark:text-slate-100';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${outer} ${className ?? ''}`} aria-hidden>
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 26 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={svgTone}
      >
        <path
          d="M7 18c2-6 10-10 11-13M7 18c-.5-7 11-13 13-17M13 21c-.5-10 11-17 13-21"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
