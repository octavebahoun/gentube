'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { GxButton } from '@/components/gx/gx-button';
import { GxNotice } from '@/components/gx/gx-page';

/**
 * Démarre un règlement et confie le payeur à la passerelle.
 *
 * Le bouton ne calcule jamais un prix : il envoie l'identifiant d'une offre et
 * suit l'URL que le serveur a obtenue de la passerelle. Les montants affichés à
 * côté viennent du même catalogue en dur que celui qui débite.
 */
export function CheckoutButton({
  endpoint,
  body,
  label,
  disabled = false,
  variant = 'default',
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  disabled?: boolean;
  variant?: 'default' | 'outline';
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok || !data?.checkoutUrl) {
        setError(data?.message ?? "Le paiement n'a pas pu démarrer. Réessayez.");
        setPending(false);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setError('Réseau injoignable. Vérifiez votre connexion et réessayez.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <GxButton
        onClick={start}
        disabled={disabled || pending}
        size="sm"
        variant={variant === 'outline' ? 'secondary' : 'primary'}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Redirection…
          </>
        ) : (
          label
        )}
      </GxButton>
      {error && (
        <p role="alert" className="max-w-xs text-xs font-semibold text-danger sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Annule ou reprend l'abonnement sans redirection.
 *
 * Contrairement au paiement, pas de checkout : un appel API suffit, puis on
 * relit la page pour voir le nouvel état de `cancelAt`.
 */
export function CancelButton({
  endpoint,
  label,
  disabled = false,
  onSuccess,
}: {
  endpoint: string;
  label: string;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function action() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "L'opération a échoué. Réessayez.");
        setPending(false);
        return;
      }

      onSuccess?.();
    } catch {
      setError('Réseau injoignable. Vérifiez votre connexion et réessayez.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <GxButton onClick={action} disabled={disabled || pending} size="sm" variant="ghost">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Traitement…
          </>
        ) : (
          label
        )}
      </GxButton>
      {error && (
        <p role="alert" className="max-w-xs text-xs font-semibold text-danger sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Gère l'annulation et la reprise d'abonnement selon l'état de `cancelAt`.
 */
export function SubscriptionCancellation({
  subscription,
  canManage,
}: {
  subscription: {
    status: string;
    cancelAt: Date | null;
    currentPeriodEnd: Date | null;
  } | null;
  canManage: boolean;
}) {
  const router = useRouter();

  if (!subscription || !canManage) return null;

  const isActive = subscription.status === 'active' || subscription.status === 'paid';
  if (!isActive) return null;

  const handleSuccess = () => {
    router.refresh();
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (subscription.cancelAt) {
    return (
      <div className="mt-4 space-y-3">
        <p className="flex items-start gap-2 rounded-lg border border-line bg-bg-2 px-3 py-2.5 text-sm">
          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-paper-3" />
          Annulation prévue le {formatDate(subscription.cancelAt)}. Votre accès continue jusqu'à cette date.
        </p>
        <CancelButton
          endpoint="/api/billing/revert-cancel"
          label="Reprendre le renouvellement"
          onSuccess={handleSuccess}
        />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <CancelButton
        endpoint="/api/billing/cancel"
        label="Annuler à la fin de la période"
        onSuccess={handleSuccess}
      />
      <p className="mt-2 text-xs text-paper-3">
        Le renouvellement s'arrêtera après le {formatDate(subscription.currentPeriodEnd)}. Vos crédits restent intacts.
      </p>
    </div>
  );
}
