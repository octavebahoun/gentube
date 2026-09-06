import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GX Field — label visible, aide, erreur câblée près du champ.
 * Jamais de placeholder qui tient lieu d'étiquette.
 */
export function GxField({
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
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="t-label block text-paper-2">
        {label} {required && <span aria-hidden="true" className="text-marque">*</span>}
      </label>
      {React.cloneElement(children, {
        id: htmlFor,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error) || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-paper-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-danger">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-rouge" />
          {error}
        </p>
      )}
    </div>
  );
}

/* Le champ : fond enfoncé, trait sobre, cyan quand il a le focus. */
const fieldBase =
  'min-h-11 w-full rounded-lg border border-line bg-ink px-4 text-base text-paper ' +
  'transition-[border-color,box-shadow,background-color] duration-(--t-fast) outline-none ' +
  'placeholder:text-paper-3/70 hover:border-line-hi ' +
  'focus:border-cyan focus:bg-ink-2 focus:shadow-[0_0_0_3px_rgba(70,229,224,0.16)] ' +
  'aria-[invalid=true]:border-rouge disabled:cursor-not-allowed disabled:opacity-45 md:text-sm';

export function GxInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...rest} />;
}

export function GxTextarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-28 py-3 leading-relaxed', className)} {...rest} />;
}

/* Le select natif, habillé. Pas de menu réinventé : le natif gagne sur mobile. */
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
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-paper-3"
      >
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
        </svg>
      </span>
    </div>
  );
}

/*
 * Choix exclusif avec explication : une plaque par option, l'aide sous le mot.
 * Reste des radios natives — clavier, lecteur d'écran et validation gratuits.
 */
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
      <legend className="t-label mb-3 text-paper-2">{legend}</legend>
      <div className="grid gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border border-line bg-ink p-4',
              'transition-colors duration-(--t-fast) hover:border-line-hi',
              'has-checked:border-jaune has-checked:bg-jaune/5',
              'has-focus-visible:outline-2 has-focus-visible:outline-cyan has-focus-visible:outline-offset-2'
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="mt-0.5 size-4 shrink-0 accent-jaune"
            />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">{o.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-paper-3">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {aide && <p className="mt-2 text-xs text-paper-3">{aide}</p>}
    </fieldset>
  );
}
