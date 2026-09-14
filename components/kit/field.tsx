import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Les champs du kit : le contrôle natif, habillé, jamais remplacé.
 * Le label est toujours visible, l'erreur toujours près du champ,
 * et décrite au lecteur d'écran par aria-describedby.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }>;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-bad">
            *
          </span>
        )}
      </label>
      {React.cloneElement(children, {
        id: htmlFor,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error) || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  'min-h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-base text-ink ' +
  'outline-none transition-colors duration-(--t-fast) ' +
  'placeholder:text-ink-3 hover:border-line-strong ' +
  'focus:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
  'aria-[invalid=true]:border-bad disabled:cursor-not-allowed disabled:opacity-45 md:text-sm';

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-28 py-3 leading-relaxed', className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, 'cursor-pointer appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="12"
        height="8"
        viewBox="0 0 12 8"
        fill="none"
        className="pointer-events-none absolute inset-y-0 right-3 my-auto text-ink-3"
      >
        <path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      </svg>
    </div>
  );
}

/* Choix radio présentés en cartes : natif dessous, lisible dessus. */
export function ChoiceGroup({
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
      <legend className="mb-3 text-sm font-medium text-ink">{legend}</legend>
      <div className="grid gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-card border border-line bg-surface p-4',
              'transition-colors duration-(--t-fast) hover:border-line-strong',
              'has-checked:border-ink-3 has-checked:bg-surface-2'
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="mt-0.5 size-4 shrink-0 accent-ink"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-2">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {aide && <p className="mt-2 text-xs text-ink-3">{aide}</p>}
    </fieldset>
  );
}
