import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type StudioPopoverSelectSection = {
  heading?: string;
  options: { value: string; label: string }[];
};

type StudioPopoverSelectProps = {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  sections: StudioPopoverSelectSection[];
  isDarkMode: boolean;
  onMenuOpen?: () => void;
  triggerClassName?: string;
};

function collectLabels(sections: StudioPopoverSelectSection[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sections) {
    for (const o of s.options) {
      m.set(o.value, o.label);
    }
  }
  return m;
}

/**
 * Button + portaled list — avoids Chrome quirks with native select inside overflow-hidden / stacked layouts.
 */
export const StudioPopoverSelect: React.FC<StudioPopoverSelectProps> = ({
  ariaLabel,
  value,
  onChange,
  placeholder,
  disabled,
  sections,
  isDarkMode,
  onMenuOpen,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const labelByValue = useMemo(() => collectLabels(sections), [sections]);
  const displayLabel = value && labelByValue.has(value) ? labelByValue.get(value)! : placeholder;

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 4;
    let left = r.left;
    let width = Math.max(r.width, 200);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    setMenuBox({
      top: r.bottom + pad,
      left,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition, sections, displayLabel]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerCls =
    triggerClassName ??
    `inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs outline-none transition-colors ${
      isDarkMode
        ? 'border-slate-600 bg-slate-900 text-slate-100 hover:border-slate-500 disabled:opacity-50'
        : 'border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 disabled:opacity-50'
    }`;

  const menuSurface = isDarkMode
    ? 'border border-slate-600 bg-slate-900 shadow-xl shadow-black/40'
    : 'border border-slate-200 bg-white shadow-xl shadow-slate-900/10';

  const itemCls = (active: boolean) =>
    `flex w-full cursor-pointer items-center px-2.5 py-2 text-left text-xs ${
      active
        ? isDarkMode
          ? 'bg-violet-500/20 text-violet-100'
          : 'bg-violet-50 text-violet-900'
        : isDarkMode
          ? 'text-slate-200 hover:bg-slate-800'
          : 'text-slate-800 hover:bg-slate-50'
    }`;

  const headingCls = isDarkMode
    ? 'sticky top-0 bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500'
    : 'sticky top-0 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500';

  const menu =
    open && menuBox && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            className={`fixed z-[10050] max-h-[min(320px,calc(100vh-24px))] overflow-auto rounded-lg py-1 ${menuSurface}`}
            style={{
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
            }}
          >
            {sections.every((s) => s.options.length === 0) ? (
              <div
                className={`px-2.5 py-2 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
              >
                No options
              </div>
            ) : (
              sections.map((sec, si) => (
                <div key={si}>
                  {sec.heading ? <div className={headingCls}>{sec.heading}</div> : null}
                  {sec.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      className={itemCls(o.value === value)}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={triggerCls}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => {
            const next = !v;
            if (next) {
              onMenuOpen?.();
              queueMicrotask(() => updateMenuPosition());
            }
            return next;
          });
        }}
      >
        <span className={`min-w-0 flex-1 truncate ${!value ? 'opacity-70' : ''}`}>{displayLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
};
