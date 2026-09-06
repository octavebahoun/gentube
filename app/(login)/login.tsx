'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signIn, signUp } from './actions';
import type { ActionState } from '@/lib/auth/middleware';
import { GxButton } from '@/components/gx/gx-button';
import { GxField, GxInput } from '@/components/gx/gx-field';
import { GxNotice } from '@/components/gx/gx-page';
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
    <main className="grid min-h-[100dvh] bg-ink lg:grid-cols-2">
      {/* Colonne média : de vrais rendus, en mosaïque. */}
      <aside className="relative hidden overflow-hidden border-r border-line lg:block" aria-hidden="true">
        <div className="grid h-full grid-cols-2 gap-1 p-1">
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
              className="size-full object-cover opacity-45"
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
        <div className="absolute right-0 bottom-0 left-0 p-10">
          <div className="mire h-[3px] w-24" />
          <p className="t-h2 mt-6 max-w-sm">Décrivez. On monte.</p>
          <p className="mt-4 max-w-sm text-sm text-paper-2">
            Des plans rendus par GenTube, sans logiciel de montage ouvert une seule fois.
          </p>
        </div>
      </aside>

      {/* Colonne formulaire */}
      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="GenTube — accueil">
            <span aria-hidden="true" className="mire size-7 rounded-md" />
            <span className="font-display text-lg font-bold tracking-tight">
              Gen<span className="text-marque">Tube</span>
            </span>
          </Link>

          <h1 className="t-h2 mt-10">{inscription ? 'Créez votre compte' : 'Content de vous revoir'}</h1>
          <p className="mt-3 text-sm leading-relaxed text-paper-3">
            {inscription
              ? `${TRIAL_CREDITS} crédits offerts à l'inscription, sans carte bancaire.`
              : 'Connectez-vous pour retrouver vos projets et vos vidéos.'}
          </p>

          <form className="mt-8 space-y-6" action={formAction}>
            <input type="hidden" name="redirect" value={redirect || ''} />
            <input type="hidden" name="priceId" value={priceId || ''} />
            <input type="hidden" name="inviteId" value={inviteId || ''} />

            <GxField label="E-mail" htmlFor="email" required>
              <GxInput
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                placeholder="vous@exemple.fr"
              />
            </GxField>

            <GxField
              label="Mot de passe"
              htmlFor="password"
              hint={inscription ? 'Huit caractères au minimum.' : undefined}
              required
            >
              <GxInput
                name="password"
                type="password"
                autoComplete={inscription ? 'new-password' : 'current-password'}
                defaultValue={state.password}
                required
                minLength={8}
                maxLength={100}
                placeholder="••••••••"
              />
            </GxField>

            {state?.error && <GxNotice tone="erreur">{state.error}</GxNotice>}

            <GxButton type="submit" size="lg" className="w-full" disabled={pending}>
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
            </GxButton>
          </form>

          <p className="mt-8 border-t border-line pt-6 text-sm text-paper-3">
            {inscription ? 'Vous avez déjà un compte ? ' : 'Pas encore de compte ? '}
            <Link
              href={lienAlternatif}
              className="font-semibold text-marque underline-offset-4 hover:underline"
            >
              {inscription ? 'Se connecter' : 'En créer un'}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
