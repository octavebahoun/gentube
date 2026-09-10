import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GenTube Field — label, hint, error, AI tags
 */
export function GxField({
  label,
  htmlFor,
  hint,
  error,
  required,
  ai = false,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  ai?: boolean;
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="t-label block text-[#F5F5F5]">
          {label} {required && <span aria-hidden="true" className="text-[#FF3B30]">*</span>}
        </label>
        {ai && (
          <span className="t-label text-[10px] text-[#A855F7] bg-[#A855F7]/10 px-2 py-0.5 rounded-full border border-[#A855F7]/30">
            Assistant IA
          </span>
        )}
      </div>
      {React.cloneElement(children, {
        id: htmlFor,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error) || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-[#A5A7AD]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-[#FF4D5A]">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#FF4D5A]" />
          {error}
        </p>
      )}
    </div>
  );
}

/* Base style for inputs */
const fieldBase =
  'min-h-11 w-full rounded-xl border border-[#292D35] bg-[#171A20] px-4 text-base text-[#F5F5F5] ' +
  'transition-all duration-200 outline-none ' +
  'placeholder:text-[#A5A7AD]/60 hover:border-[#3D434F] ' +
  'focus:border-[#FF3B30] focus:bg-[#111419] focus:ring-2 focus:ring-[#FF3B30]/20 ' +
  'aria-[invalid=true]:border-[#FF4D5A] disabled:cursor-not-allowed disabled:opacity-45 md:text-sm';

export function GxInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...rest} />;
}

export function GxTextarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-28 py-3 leading-relaxed', className)} {...rest} />;
}

export function GxSelect({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(fieldBase, 'cursor-pointer appearance-none pr-10', className)}
        {...rest}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#A5A7AD]"
      >
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
        </svg>
      </span>
    </div>
  );
}

export function GxChoix({
  name,
  legend,
  options,
  defaultValue,
  aide,
}: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string; hint: string }[];
  defaultValue?: string;
  aide?: string;
}) {
  return (
    <fieldset>
      <legend className="t-label mb-3 text-[#A5A7AD]">{legend}</legend>
      <div className="grid gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border border-[#292D35] bg-[#171A20] p-4',
              'transition-all duration-200 hover:border-[#3D434F]',
              'has-checked:border-[#FF3B30] has-checked:bg-[#FF3B30]/10'
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="mt-0.5 size-4 shrink-0 accent-[#FF3B30]"
            />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold text-[#F5F5F5]">{o.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-[#A5A7AD]">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {aide && <p className="mt-2 text-xs text-[#A5A7AD]">{aide}</p>}
    </fieldset>
  );
}
