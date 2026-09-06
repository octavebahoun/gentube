import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

/*
 * GX Button — pilule pleine sur plaque au rasoir. Zéro preset, zéro Radix.
 * La signature : au survol, la mire sort par le bas du bouton primaire,
 * comme une bande qui défile sous une tête de lecture.
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-jaune text-ink font-bold hover:shadow-[0_10px_30px_-10px_rgba(255,225,77,0.55)]',
  secondary:
    'border border-line-hi bg-ink-2 text-paper hover:border-cyan hover:bg-ink-3',
  ghost: 'text-paper-2 hover:bg-ink-3 hover:text-paper',
  accent:
    'bg-magenta text-ink font-bold hover:shadow-[0_10px_30px_-10px_rgba(255,79,195,0.55)]',
  danger: 'bg-rouge text-ink font-bold hover:opacity-90',
  dark: 'bg-paper text-ink font-bold hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-4 text-[0.8125rem]',
  md: 'min-h-11 px-6 text-sm',
  lg: 'min-h-[3.25rem] px-8 text-base',
};

export type GxButtonProps = {
  variant?: Variant;
  size?: Size;
  href?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function GxButton({
  variant = 'primary',
  size = 'md',
  href,
  className,
  children,
  ...rest
}: GxButtonProps) {
  const cls = cn(
    'group/btn relative isolate inline-flex cursor-pointer items-center justify-center gap-2',
    'overflow-hidden rounded-pill font-display font-semibold tracking-tight whitespace-nowrap',
    'transition-[transform,box-shadow,background-color,border-color,color] duration-(--t-fast) ease-(--ease-out)',
    'hover:-translate-y-0.5 active:translate-y-0',
    'outline-none focus-visible:outline-2 focus-visible:outline-cyan focus-visible:outline-offset-3',
    'disabled:pointer-events-none disabled:opacity-45',
    variants[variant],
    sizes[size],
    className
  );

  const inner = (
    <>
      {children}
      <span
        aria-hidden="true"
        className="mire absolute inset-x-0 bottom-0 h-[3px] translate-y-full transition-transform duration-(--t-fast) ease-(--ease-out) group-hover/btn:translate-y-0"
      />
    </>
  );

  if (href) {
    return (
      <a href={href} className={cls} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  );
}
