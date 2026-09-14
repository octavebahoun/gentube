'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signIn, signUp } from './actions';
import type { ActionState } from '@/lib/auth/middleware';
import { Button } from '@/components/kit/button';
import { Field, Input } from '@/components/kit/field';
import { Notice } from '@/components/kit/page';
import { TRIAL_CREDITS } from '@/lib/credits/pricing';

/*
 * L'écran d'entrée — écran partagé : à gauche ce que le produit rend,
 * à droite le formulaire. On montre le résultat avant de demander un mot
 * de passe. Sur mobile, la colonne média disparaît : le formulaire d'abord.
 */
export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const priceId = searchParams.get('priceId');
  const inviteId = searchParams.get('inviteId');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  const inscription = mode === 'signup';
  const lienAlternatif = `${inscription ? '/sign-in' : '/sign-up'}${
    redirect ? `?redirect=${redirect}` : ''
  }${priceId ? `${redirect ? '&' : '?'}priceId=${priceId}` : ''}`;

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      {/* Colonne média : de vrais rendus, en mosaïque. */}
      <aside className="hidden flex-col border-r border-line lg:flex" aria-hidden="true">
        <div className="grid flex-1 grid-cols-2 gap-px bg-line">
          {[1, 4, 5, 2].map((n) => (
            <video
              key={n}
              src={`/showcase/loop-${n}.mp4`}
              poster={`/showcase/loop-${n}.webp`}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          ))}
        </div>
        <div className="border-t border-line p-8">
          <p className="t-h2 max-w-sm">Décrivez. On monte.</p>
          <p className="mt-2 max-w-sm text-sm text-ink-2">
            Des plans rendus par GenTube, sans logiciel de montage ouvert une seule fois.
          </p>
        </div>
      </aside>

      {/* Colonne formulaire */}
      <div className="flex items-center justify-center px-(--gutter) py-14">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="GenTube — accueil">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-[6px] border border-line-strong bg-surface-2"
            >
              <svg width="9" height="10" viewBox="0 0 9 10" fill="none">
                <path d="M0 0.5 8.5 5 0 9.5V0.5Z" fill="currentColor" className="text-ink-2" />
              </svg>
            </span>
            <span className="text-[17px] font-bold tracking-tight">
              Gen<span className="text-ink-2">Tube</span>
            </span>
          </Link>

          <h1 className="t-h2 mt-10">{inscription ? 'Créez votre compte' : 'Content de vous revoir'}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            {inscription
              ? `${TRIAL_CREDITS} crédits offerts à l'inscription, sans carte bancaire.`
              : 'Connectez-vous pour retrouver vos projets et vos vidéos.'}
          </p>

          <form className="mt-8 space-y-5" action={formAction}>
            <input type="hidden" name="redirect" value={redirect || ''} />
            <input type="hidden" name="priceId" value={priceId || ''} />
            <input type="hidden" name="inviteId" value={inviteId || ''} />

            <Field label="E-mail" htmlFor="email" required>
              <Input
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                placeholder="vous@exemple.fr"
              />
            </Field>

            <Field
              label="Mot de passe"
              htmlFor="password"
              hint={inscription ? 'Huit caractères au minimum.' : undefined}
              required
            >
              <Input
                name="password"
                type="password"
                autoComplete={inscription ? 'new-password' : 'current-password'}
                defaultValue={state.password}
                required
                minLength={8}
                maxLength={100}
                placeholder="••••••••"
              />
            </Field>

            {state?.error && <Notice tone="erreur">{state.error}</Notice>}

            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Un instant…
                </>
              ) : inscription ? (
                'Créer mon compte'
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>

          <p className="mt-8 border-t border-line pt-6 text-sm text-ink-2">
            {inscription ? 'Vous avez déjà un compte ? ' : 'Pas encore de compte ? '}
            <Link
              href={lienAlternatif}
              className="font-semibold text-ink underline-offset-4 hover:underline"
            >
              {inscription ? 'Se connecter' : 'En créer un'}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
