'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Starts a checkout and hands the payer over to GeniusPay.
 *
 * The button never computes a price: it posts an offer id and follows the URL
 * the server got from the gateway. Amounts shown next to it come from the same
 * hardcoded catalogue the server charges from.
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
        setError(data?.message ?? 'Could not start the payment.');
        setPending(false);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setError('Network error — please try again.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={start}
        disabled={disabled || pending}
        variant={variant}
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Redirecting…
          </>
        ) : (
          label
        )}
      </Button>
      {error && <p className="text-sm text-red-500 max-w-xs text-right">{error}</p>}
    </div>
  );
}
