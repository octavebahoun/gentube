import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/*
 * Bouton du kit.
 * - primary : l'ambre. Une seule action principale par écran, jamais deux.
 * - secondary : surface, pour l'action de second rang.
 * - ghost : sans fond, pour la navigation et les actions discrètes.
 * - danger : contour rouge, pour ce qui détruit.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand font-semibold text-on-brand hover:bg-brand-hover active:bg-brand',
  secondary:
    'border border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-base',
};

export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    'inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-control',
    'transition-colors duration-(--t-fast) ease-(--ease-out)',
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
    variants[variant],
    sizes[size],
    className
  );
}

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant, size, className, ...rest }: ButtonProps) {
  return <button className={buttonClass({ variant, size, className })} {...rest} />;
}

export type ButtonLinkProps = {
  variant?: Variant;
  size?: Size;
  href: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, className })} {...rest} />;
}
