'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GxButton } from '@/components/gx/gx-button';

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
