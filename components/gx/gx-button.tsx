import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ai' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

/*
 * GenTube Button Component — Direction C
 * Primary Action: Brand Red (#FF3B30)
 * AI Action: Purple (#A855F7)
 * Radius: 10px - 16px (rounded-xl)
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-[#FF3B30] text-white font-bold hover:bg-[#D0021B] hover:shadow-[0_0_25px_-5px_rgba(255,59,48,0.5)] border border-[#FF3B30]/30',
  ai:
    'bg-[#A855F7] text-white font-bold hover:bg-[#B975F8] hover:shadow-[0_0_25px_-5px_rgba(168,85,247,0.5)] border border-[#A855F7]/30',
  secondary:
    'border border-[#292D35] bg-[#111419] text-[#F5F5F5] hover:border-[#3D434F] hover:bg-[#171A20]',
  ghost: 'text-[#A5A7AD] hover:bg-[#171A20] hover:text-[#F5F5F5]',
  danger: 'bg-[#FF4D5A] text-white font-bold hover:bg-[#FF6B76] hover:shadow-[0_0_25px_-5px_rgba(255,77,90,0.5)]',
  dark: 'bg-[#171A20] text-[#F5F5F5] border border-[#292D35] hover:bg-[#292D35]',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-xs rounded-lg',
  md: 'h-11 px-5 text-sm rounded-xl',
  lg: 'h-13 px-7 text-base rounded-2xl',
};

export type GxButtonProps = {
  variant?: Variant;
  size?: Size;
  href?: string;
  glow?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function GxButton({
  variant = 'primary',
  size = 'md',
  glow = false,
  href,
  className,
  children,
  ...rest
}: GxButtonProps) {
  const cls = cn(
    'group/btn relative isolate inline-flex cursor-pointer items-center justify-center gap-2.5',
    'font-display font-semibold tracking-tight whitespace-nowrap',
    'transition-all duration-200 ease-out',
    'hover:-translate-y-0.5 active:translate-y-0',
    'outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050608]',
    'disabled:pointer-events-none disabled:opacity-45',
    glow && variant === 'primary' && 'glow-red-subtle',
    glow && variant === 'ai' && 'glow-purple-subtle',
    variants[variant],
    sizes[size],
    className
  );

  if (href) {
    return (
      <a href={href} className={cls} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
