import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GenTube Card Components
 * Surface: #111419, Border: #292D35, Elevated: #171A20
 */
export function GxCard({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        'relative rounded-xl border border-[#292D35] bg-[#111419] p-6 text-[#F5F5F5]',
        'transition-all duration-200 ease-out',
        'hover:border-[#3D434F] hover:bg-[#171A20] hover:-translate-y-0.5 shadow-lg',
        className
      )}
      {...rest}
    >
      {children}
    </article>
  );
}

export function GxPerfCard({
  timecode,
  title,
  live = false,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  timecode: string;
  title: string;
  live?: boolean;
}) {
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-[#292D35] bg-[#171A20] text-[#F5F5F5] shadow-2xl',
        'transition-all duration-200 ease-out hover:border-[#FF3B30]/50 hover:glow-red-subtle',
        className
      )}
      {...rest}
    >
      <div aria-hidden="true" className="h-1 bg-gradient-gt" />
      <div className="flex items-center justify-between gap-3 border-b border-[#292D35] px-5 py-3.5 bg-[#0B0D10]/50">
        <p className="t-label text-[#FF3B30] font-bold">{title}</p>
        <p className="t-data text-xs text-[#A5A7AD]">{timecode}</p>
      </div>
      <div className="p-5">{children}</div>
    </article>
  );
}

export function GxCardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('t-h3 text-[#F5F5F5]', className)} {...rest} />;
}

/*
 * GenTube Stat Card
 */
export function GxStat({
  label,
  value,
  hint,
  tone = 'rouge',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'rouge' | 'orange' | 'purple' | 'amber' | 'success' | 'error' | 'jaune' | 'cyan' | 'magenta' | 'vert' | 'bleu';
  className?: string;
}) {
  const bars: Record<string, string> = {
    rouge: 'bg-[#FF3B30]',
    orange: 'bg-[#FF3B30]',
    jaune: 'bg-[#FF3B30]',
    purple: 'bg-[#A855F7]',
    magenta: 'bg-[#A855F7]',
    amber: 'bg-[#FFB340]',
    cyan: 'bg-[#FFB340]',
    success: 'bg-[#35D07F]',
    vert: 'bg-[#35D07F]',
    error: 'bg-[#FF4D5A]',
    bleu: 'bg-[#A855F7]',
  };
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-[#292D35] bg-[#111419] p-5 pl-6', className)}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', bars[tone])} />
      <p className="t-label text-[#A5A7AD]">{label}</p>
      <p className="t-data mt-2 text-3xl font-bold text-[#F5F5F5]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[#A5A7AD]">{hint}</p>}
    </div>
  );
}
