'use client';

import { useActionState } from 'react';
import { Lock, Trash2, Loader2 } from 'lucide-react';
import { updatePassword, deleteAccount } from '@/app/(login)/actions';
import { Button } from '@/components/kit/button';
import { Field, Input } from '@/components/kit/field';
import { Page, PageHeader, Section, Notice } from '@/components/kit/page';

type PasswordState = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  error?: string;
  success?: string;
};

type DeleteState = { password?: string; error?: string; success?: string };

export default function SecurityPage() {
  const [passwordState, passwordAction, isPasswordPending] = useActionState<PasswordState, FormData>(
    updatePassword,
    {}
  );
  const [deleteState, deleteAction, isDeletePending] = useActionState<DeleteState, FormData>(
    deleteAccount,
    {}
  );

  return (
    <Page className="max-w-3xl">
      <PageHeader
        eyebrow="Compte"
        titre="Sécurité"
        intro="Changez votre mot de passe, ou fermez définitivement ce compte."
      />

      <div className="space-y-6">
        <Section titre="Mot de passe" aide="Huit caractères au minimum.">
          <form className="space-y-6" action={passwordAction}>
            <Field label="Mot de passe actuel" htmlFor="current-password" required>
              <Input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={passwordState.currentPassword}
              />
            </Field>

            <Field
              label="Nouveau mot de passe"
              htmlFor="new-password"
              hint="Huit caractères au minimum."
              required
            >
              <Input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={passwordState.newPassword}
              />
            </Field>

            <Field
              label="Confirmer le nouveau mot de passe"
              htmlFor="confirm-password"
              error={passwordState.error}
              required
            >
              <Input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={passwordState.confirmPassword}
              />
            </Field>

            {passwordState.success && <Notice tone="ok">{passwordState.success}</Notice>}

            <Button type="submit" disabled={isPasswordPending}>
              {isPasswordPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Mise à jour…
                </>
              ) : (
                <>
                  <Lock className="size-4" aria-hidden="true" />
                  Changer le mot de passe
                </>
              )}
            </Button>
          </form>
        </Section>

        {/* La zone dangereuse porte le rouge, et rien d'autre. */}
        <section className="rounded-card border border-bad/40 bg-bad/5 p-4 sm:p-5">
          <h2 className="t-h3 text-bad">Supprimer le compte</h2>
          <p className="mt-2 text-sm text-ink-2">
            La suppression est définitive. Les vidéos et les crédits restants sont perdus,
            et rien ne permet de revenir en arrière.
          </p>
          <form action={deleteAction} className="mt-5 space-y-5">
            <Field
              label="Confirmez avec votre mot de passe"
              htmlFor="delete-password"
              error={deleteState.error}
              required
            >
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={deleteState.password}
              />
            </Field>

            <Button type="submit" variant="danger" disabled={isDeletePending}>
              {isDeletePending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Suppression…
                </>
              ) : (
                <>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Supprimer mon compte
                </>
              )}
            </Button>
          </form>
        </section>
      </div>
    </Page>
  );
}
