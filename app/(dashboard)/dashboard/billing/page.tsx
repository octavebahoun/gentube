'use client';

import { Suspense, useState, useTransition } from 'react';
import useSWR from 'swr';
import { Loader2, CreditCard, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import type { BillingOverview } from '@/lib/billing/billing.service';
import type { User } from '@/lib/db/schema';
import { secondsAffordable } from '@/lib/credits/pricing';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const xof = new Intl.NumberFormat('fr-FR');

function formatXof(amount: number) {
  return `${xof.format(amount)} FCFA`;
}

function formatMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 1 ? `${minutes} min` : `${seconds}s`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  succeeded: 'success',
  paid: 'success',
  active: 'success',
  pending: 'warning',
  created: 'secondary',
  past_due: 'warning',
  failed: 'destructive',
  cancelled: 'destructive',
  suspended: 'destructive',
  expired: 'outline',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>
  );
}

/** Sends the browser to the gateway checkout the API just opened. */
async function startCheckout(
  url: string,
  body: unknown,
  onError: (message: string) => void
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok || !data.checkoutUrl) {
    onError(data.error ?? 'Le paiement n’a pas pu être ouvert.');
    return;
  }
  window.location.href = data.checkoutUrl;
}

function BillingContent() {
  const { data, error, isLoading } = useSWR<BillingOverview>(
    '/api/billing',
    fetcher
  );
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const canManage = user?.role === 'owner' || user?.role === 'admin';

  if (isLoading) {
    return (
      <Card className="h-[160px]">
        <CardHeader>
          <CardTitle>Facturation</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facturation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">
            Impossible de charger les informations de facturation.
          </p>
        </CardContent>
      </Card>
    );
  }

  const run = (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <>
      {!data.configured && (
        <Card className="mb-8 border-amber-300">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-900">
              GeniusPay n’est pas encore configuré sur cette instance : aucune
              clé marchand n’est enregistrée. Les boutons de paiement resteront
              inactifs jusque-là.
            </p>
          </CardContent>
        </Card>
      )}

      {message && (
        <Card className="mb-8 border-red-300">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{message}</p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Plan et solde</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium capitalize">{data.plan}</p>
                {data.subscription && (
                  <StatusBadge status={data.subscription.status} />
                )}
              </div>
              {data.subscription ? (
                <p className="text-sm text-muted-foreground">
                  Période en cours jusqu’au{' '}
                  {formatDate(data.subscription.currentPeriodEnd)}
                  {data.subscription.cancelAtPeriodEnd &&
                    ' — résiliation programmée'}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun abonnement actif.
                </p>
              )}
            </div>

            <div className="text-left sm:text-right">
              <p className="text-3xl font-semibold tabular-nums">
                {xof.format(data.balances.total)}
              </p>
              <p className="text-sm text-muted-foreground">
                crédits ≈ {formatMinutes(secondsAffordable(data.balances.total, '480p'))}{' '}
                en 480p
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">
                Quota du plan (expire en fin de cycle)
              </p>
              <p className="text-xl font-medium tabular-nums">
                {xof.format(data.balances.plan)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Crédits achetés (sans expiration)
              </p>
              <p className="text-xl font-medium tabular-nums">
                {xof.format(data.balances.purchased)}
              </p>
            </div>
          </div>

          {data.balances.total === 0 && (
            <p className="text-sm text-red-500">
              Solde épuisé — la génération de vidéos est bloquée jusqu’à une
              recharge.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Changer de plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium capitalize">{plan.id}</p>
                  <p className="text-2xl font-semibold">
                    {formatXof(plan.priceXof)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      / mois
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {xof.format(plan.credits)} crédits ·{' '}
                    {formatMinutes(secondsAffordable(plan.credits, '480p'))} en
                    480p
                  </p>
                </div>
                <Button
                  className="mt-4 bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={
                    !canManage ||
                    !data.configured ||
                    pending ||
                    data.plan === plan.id
                  }
                  onClick={() =>
                    run(`plan-${plan.id}`, () =>
                      startCheckout(
                        '/api/billing/subscribe',
                        { plan: plan.id },
                        setMessage
                      )
                    )
                  }
                >
                  {busy === `plan-${plan.id}` ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ouverture…
                    </>
                  ) : data.plan === plan.id ? (
                    'Plan actuel'
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Choisir
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {data.subscription && canManage && (
            <div className="mt-4">
              {data.subscription.cancelAtPeriodEnd ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run('resume', async () => {
                      const res = await fetch('/api/billing/resume', {
                        method: 'POST',
                      });
                      if (!res.ok) setMessage((await res.json()).error);
                      else window.location.reload();
                    })
                  }
                >
                  Annuler la résiliation
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run('cancel', async () => {
                      const res = await fetch('/api/billing/cancel', {
                        method: 'POST',
                      });
                      if (!res.ok) setMessage((await res.json()).error);
                      else window.location.reload();
                    })
                  }
                >
                  Résilier en fin de période
                </Button>
              )}
            </div>
          )}

          {!canManage && (
            <p className="mt-4 text-sm text-muted-foreground">
              Seul un propriétaire ou un administrateur peut gérer la
              facturation.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Recharger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {data.packs.map((pack) => (
              <div key={pack.index} className="rounded-lg border p-4">
                <p className="text-lg font-medium">
                  {xof.format(pack.credits)} crédits
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatXof(pack.priceXof)} — sans expiration
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={!canManage || !data.configured || pending}
                  onClick={() =>
                    run(`pack-${pack.index}`, () =>
                      startCheckout(
                        '/api/billing/topup',
                        { packIndex: pack.index },
                        setMessage
                      )
                    )
                  }
                >
                  {busy === `pack-${pack.index}` ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ouverture…
                    </>
                  ) : (
                    'Recharger'
                  )}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Paiement par Mobile Money ou carte via GeniusPay. Les crédits sont
            ajoutés après confirmation par la passerelle, jamais avant.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-muted-foreground">Aucune transaction.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Crédits</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.createdAt)}</TableCell>
                    <TableCell className="capitalize">
                      {payment.kind === 'topup' ? 'Recharge' : 'Abonnement'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatXof(payment.amountXof)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {xof.format(payment.creditsGranted)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={payment.status} />
                    </TableCell>
                    <TableCell>
                      {payment.status === 'pending' && payment.checkoutUrl && (
                        <a
                          href={payment.checkoutUrl}
                          className="inline-flex items-center text-sm text-orange-600 hover:underline"
                        >
                          Reprendre
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function BillingPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Facturation</h1>
      <Suspense>
        <BillingContent />
      </Suspense>
    </section>
  );
}
