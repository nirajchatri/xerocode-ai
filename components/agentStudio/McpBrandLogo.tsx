import React, { useState } from 'react';

import { mcpBrandLogoUrl } from './mcpCatalog';

const SIZE_PX = { xs: 16, sm: 28, md: 40, lg: 44 } as const;

type SizeKey = keyof typeof SIZE_PX;

export function McpBrandLogo({
  logoSlug,
  label,
  size = 'md',
  className = '',
  rounded = 'lg',
}: {
  logoSlug: string;
  label: string;
  size?: SizeKey;
  className?: string;
  /** Tile corner style */
  rounded?: 'md' | 'lg' | 'xl';
}) {
  const [failed, setFailed] = useState(false);
  const dim = SIZE_PX[size];
  const r = rounded === 'md' ? 'rounded-md' : rounded === 'xl' ? 'rounded-xl' : 'rounded-lg';
  const initial = (label.trim()[0] ?? '?').toUpperCase();

  if (failed || !logoSlug) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-slate-200 font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200 ${r} ${className}`}
        style={{ width: dim, height: dim, fontSize: dim * 0.45 }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/80 bg-white dark:border-slate-600 dark:bg-slate-900 ${r} ${className}`}
      style={{ width: dim, height: dim }}
    >
      <img
        src={mcpBrandLogoUrl(logoSlug)}
        alt=""
        width={Math.round(dim * 0.78)}
        height={Math.round(dim * 0.78)}
        className="object-contain"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
