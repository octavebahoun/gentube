'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Le menu du compte, écrit à la main : pas de Radix, pas de portail.
 * Échap ferme, clic dehors ferme, flèches parcourent, le focus revient
 * au déclencheur.
 */
export function Menu({
  trigger,
  label,
  align = 'end',
  children,
}: {
  trigger: React.ReactNode;
  label: string;
  align?: 'start' | 'end';
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div ref={root} className="relative" onKeyDown={onMenuKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-[calc(100%+0.5rem)] z-(--z-pop) w-60 overflow-hidden',
            'rounded-card border border-line bg-surface-2 shadow-xl shadow-black/40',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          <div className="p-1.5">{children}</div>
        </div>
      )}
    </div>
  );
}

const item =
  'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-sm font-medium text-ink-2 ' +
  'transition-colors duration-(--t-fast) hover:bg-surface hover:text-ink ' +
  'outline-none focus-visible:bg-surface focus-visible:text-ink [&_svg]:size-4 [&_svg]:text-ink-3';

export function MenuItem({
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a role="menuitem" data-menu-item="" tabIndex={-1} className={cn(item, className)} {...rest} />;
}

export function MenuButton({
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      role="menuitem"
      data-menu-item=""
      tabIndex={-1}
      className={cn(item, 'text-left', className)}
      {...rest}
    />
  );
}
