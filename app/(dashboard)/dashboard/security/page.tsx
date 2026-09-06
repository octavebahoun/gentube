'use client';

import { useActionState } from 'react';
import { Lock, Trash2, Loader2 } from 'lucide-react';
import { updatePassword, deleteAccount } from '@/app/(login)/actions';
import { GxButton } from '@/components/gx/gx-button';
import { GxField, GxInput } from '@/components/gx/gx-field';
import { GxPage, GxPageHeader, GxSection, GxNotice } from '@/components/gx/gx-page';

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
    <GxPage className="max-w-3xl">
      <GxPageHeader
        eyebrow="Compte"
        titre="Sécurité"
        intro="Changez votre mot de passe, ou fermez définitivement ce compte."
      />

      <div className="space-y-6">
        <GxSection titre="Mot de passe" aide="Huit caractères au minimum.">
          <form className="space-y-6" action={passwordAction}>
            <GxField label="Mot de passe actuel" htmlFor="current-password" required>
              <GxInput
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={passwordState.currentPassword}
              />
            </GxField>

            <GxField
              label="Nouveau mot de passe"
              htmlFor="new-password"
              hint="Huit caractères au minimum, cent au maximum."
              required
            >
              <GxInput
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={passwordState.newPassword}
              />
            </GxField>

            <GxField
              label="Confirmer le nouveau mot de passe"
              htmlFor="confirm-password"
              error={passwordState.error}
              required
            >
              <GxInput
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={passwordState.confirmPassword}
              />
            </GxField>

            {passwordState.success && <GxNotice tone="ok">{passwordState.success}</GxNotice>}

            <GxButton type="submit" disabled={isPasswordPending}>
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
            </GxButton>
          </form>
        </GxSection>

        {/* La zone dangereuse porte le rouge de la mire, et rien d'autre. */}
        <section className="rounded-lg border border-rouge/40 bg-rouge/5 p-6">
          <h2 className="font-display text-lg font-bold tracking-tight text-danger">
            Supprimer le compte
          </h2>
          <p className="mt-2 text-sm text-paper-2">
            La suppression est définitive. Les vidéos et les crédits restants sont perdus,
            et rien ne permet de revenir en arrière.
          </p>
          <form action={deleteAction} className="mt-5 space-y-5">
            <GxField
              label="Confirmez avec votre mot de passe"
              htmlFor="delete-password"
              error={deleteState.error}
              required
            >
              <GxInput
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={100}
                defaultValue={deleteState.password}
              />
            </GxField>

            <GxButton type="submit" variant="danger" disabled={isDeletePending}>
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
            </GxButton>
          </form>
        </section>
      </div>
    </GxPage>
  );
}
