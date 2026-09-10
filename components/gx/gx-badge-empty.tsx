import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone =
  | 'neutre'
  | 'rouge'
  | 'orange'
  | 'purple'
  | 'success'
  | 'error'
  | 'amber'
  | 'jaune'
  | 'vert'
  | 'magenta'
  | 'cyan'
  | 'bleu';

const tones: Record<Tone, string> = {
  neutre: 'border-[#292D35] bg-[#171A20] text-[#A5A7AD] [--dot:#A5A7AD]',
  rouge: 'border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#FF3B30] [--dot:#FF3B30]',
  orange: 'border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#FF3B30] [--dot:#FF3B30]',
  jaune: 'border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#FF3B30] [--dot:#FF3B30]',
  purple: 'border-[#A855F7]/30 bg-[#A855F7]/10 text-[#A855F7] [--dot:#A855F7]',
  success: 'border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F] [--dot:#35D07F]',
  error: 'border-[#FF4D5A]/30 bg-[#FF4D5A]/10 text-[#FF4D5A] [--dot:#FF4D5A]',
  amber: 'border-[#FFB340]/30 bg-[#FFB340]/10 text-[#FFB340] [--dot:#FFB340]',
  cyan: 'border-[#FFB340]/30 bg-[#FFB340]/10 text-[#FFB340] [--dot:#FFB340]',
  vert: 'border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F] [--dot:#35D07F]',
  magenta: 'border-[#A855F7]/30 bg-[#A855F7]/10 text-[#A855F7] [--dot:#A855F7]',
  bleu: 'border-[#A855F7]/30 bg-[#A855F7]/10 text-[#A855F7] [--dot:#A855F7]',
};

/*
 * GenTube Badge Component
 */
export function GxBadge({
  className,
  tone = 'neutre',
  dot = true,
  live = false,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean; live?: boolean }) {
  return (
    <span
      className={cn(
        't-label inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider',
        tones[tone],
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full bg-(--dot)', live && 'animate-pulse')}
        />
      )}
      {children}
    </span>
  );
}

/* GenTube Empty State Component */
export function GxEmpty({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-6 py-16 text-center rounded-xl border border-[#292D35] bg-[#111419]', className)}>
      <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-xl border border-[#292D35] bg-[#171A20] text-[#FF3B30] [&_svg]:size-7">
        {icon}
      </span>
      <p className="t-h3 text-[#F5F5F5]">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-[#A5A7AD]">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
