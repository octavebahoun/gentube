import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GenTube Progress Gauge
 */
export function GxProgress({
  value,
  max = 100,
  label,
  tone = 'rouge',
  className,
}: {
  value: number;
  max?: number;
  label: string;
  tone?: 'rouge' | 'purple' | 'gradient';
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  const fills = {
    rouge: 'bg-[#FF3B30]',
    purple: 'bg-[#A855F7]',
    gradient: 'bg-gradient-gt',
  };

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-[#171A20] border border-[#292D35]', className)}
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 origin-left transition-transform duration-300 ease-out', fills[tone])}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

/*
 * GenTube Audio / Render Meter Animation
 */
export function GxMeter({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-end gap-0.5', className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="w-1 origin-bottom rounded-full bg-[#FF3B30]"
          style={{
            height: `${8 + i * 3}px`,
            animation: `gt-bar ${520 + i * 130}ms ease-in-out ${i * 90}ms infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
