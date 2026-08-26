import { redirect } from 'next/navigation';
import { Clock, Infinity as InfinityIcon, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { getBillingOverview } from '@/lib/billing/checkout';
import { secondsAffordable } from '@/lib/credits/pricing';
import type { PaymentStatus } from '@/lib/db/schema';
import { CheckoutButton } from './billing-actions';

function fcfa(amount: number) {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}
function credits(amount: number) {
  return amount.toLocaleString('fr-FR');
}
function minutes(seconds: number) {
  return `${Math.floor(seconds / 60)} min`;
}
function day(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<string, string> = {
  succeeded: 'bg-green-500/15 text-green-400 border border-green-500/30',
  paid: 'bg-green-500/15 text-green-400 border border-green-500/30',
  active: 'bg-green-500/15 text-green-400 border border-green-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  created: 'bg-secondary text-muted-foreground border',
  past_due: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/30',
  cancelled: 'bg-secondary text-muted-foreground border',
  expired: 'bg-secondary text-muted-foreground border',
  suspended: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] ?? 'bg-secondary text-muted-foreground border'}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function PocketBadge({ pocket }: { pocket: string }) {
  const isTopup = pocket === 'topup';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${isTopup ? 'border-primary/30 bg-primary/10 text-primary' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}
    >
      {isTopup ? 'Achetés' : 'Quota'}
    </span>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const tdb = tenantDb(user.tenantId);
  const [overview, tenant] = await Promise.all([getBillingOverview(tdb), tdb.getTenant()]);
  const { payment } = await searchParams;
  const canManage = user.role === 'owner' || user.role === 'admin';

  const creditsPlan = tenant?.creditsPlan ?? 0;
  const creditsTopup = tenant?.creditsTopup ?? 0;
  const expireAt = tenant?.planCreditsExpireAt ?? null;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-2">
        <p className="text-xs font-medium tracking-widest text-brand-accent uppercase">Facturation</p>
        <h1 className="text-2xl font-semibold tracking-tight">Crédits et facturation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prix en FCFA · paiement par mobile money, sans carte bancaire. Deux poches&nbsp;:
          le quota mensuel expire, les crédits achetés n&apos;expirent jamais.
        </p>
      </div>

      {payment === 'success' && (
        <p className="mb-6 rounded-md border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400">
          Paiement reçu. Les crédits apparaissent dès que GeniusPay confirme — généralement en quelques secondes.
        </p>
      )}
      {payment === 'failed' && (
        <p className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          Le paiement n&apos;a pas abouti. Rien n&apos;a été débité — vous pouvez réessayer ci-dessous.
        </p>
      )}
      {!overview.billingConfigured && (
        <p className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          Les clés GeniusPay manquent sur cette instance : le paiement est désactivé. Renseignez les trois variables{' '}
          <code>GENIUS_SANDBOX_*</code> (ou <code>GENIUS_LIVE_*</code> avec <code>GENIUS_ENV=live</code>).
        </p>
      )}

      {/* ——— Deux poches — promesse commerciale, pas détail d’affichage ——— */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                <Clock className="size-4" />
              </span>
              Quota mensuel
              <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                expire
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{credits(creditsPlan)}</p>
            <p className="text-xs text-muted-foreground">
              crédits ·{' '}
              {expireAt ? (
                <>expire le {day(expireAt)}</>
              ) : (
                <>pas de cycle en cours</>
              )}
            </p>
            <Separator className="my-3" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Renouvelé chaque cycle ({overview.currentCycle ? day(overview.currentCycle.periodEnd) : '—'}).
              <span className="font-medium text-foreground"> Débité en premier</span> : on puise d&apos;abord ici pour que
              personne ne perde de valeur qu&apos;il aurait pu consommer.
            </p>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              ≈ {minutes(secondsAffordable(creditsPlan, 'video', '480p'))} animées à 480p
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wallet className="size-4" />
              </span>
              Crédits achetés
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                <InfinityIcon className="size-3" /> n&apos;expire jamais
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{credits(creditsTopup)}</p>
            <p className="text-xs text-muted-foreground">crédits · conservés indéfiniment</p>
            <Separator className="my-3" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Recharges payées en plus de l&apos;abonnement. Faire expirer ce
              qu&apos;on a acheté serait du vol — ils n&apos;expirent jamais.
              <span className="font-medium text-foreground"> Débités après le quota.</span>
            </p>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              ≈ {minutes(secondsAffordable(creditsTopup, 'video', '480p'))} animées à 480p
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Offre actuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium capitalize">
                {overview.plan} {overview.subscription && <Badge status={overview.subscription.status} />}
              </p>
              <p className="text-sm text-muted-foreground">
                {overview.subscription?.currentPeriodEnd
                  ? `Renouvelle le ${day(overview.subscription.currentPeriodEnd)}`
                  : 'Aucune période payée pour l’instant.'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">{credits(overview.creditsBalance)}</p>
              <p className="text-sm text-muted-foreground">
                crédits · ≈ {minutes(secondsAffordable(overview.creditsBalance, 'video', '480p'))} animées à 480p
              </p>
            </div>
          </div>
          {overview.subscription?.status === 'suspended' && (
            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              Trop d&apos;échecs de paiement : l&apos;abonnement ne se renouvelle plus. Vos crédits restent intacts —
              payez un plan ci-dessous pour reprendre.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {overview.offers.map((offer) => {
              const current = overview.plan === offer.plan;
              return (
                <li
                  key={offer.plan}
                  className="flex flex-col gap-3 border-b border-border pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {offer.name} — {fcfa(offer.priceXof)}
                      <span className="text-sm text-muted-foreground"> / mois</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {credits(offer.monthlyCredits)} crédits ≈ {minutes(secondsAffordable(offer.monthlyCredits, 'video', '480p'))} animées, ou{' '}
                      {minutes(secondsAffordable(offer.monthlyCredits, 'image', '480p'))} en images fixes
                    </p>
                  </div>
                  {current ? (
                    <span className="text-sm text-muted-foreground">Offre actuelle</span>
                  ) : (
                    <CheckoutButton
                      endpoint="/api/billing/subscribe"
                      body={{ plan: offer.plan }}
                      label={`Payer ${fcfa(offer.priceXof)}`}
                      disabled={!canManage || !overview.billingConfigured}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Mobile money ou carte, en XOF, via GeniusPay. Les plans Business sont sur devis.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Recharger des crédits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {overview.topupPacks.map((pack) => (
              <li key={pack.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {credits(pack.credits)} crédits — {fcfa(pack.priceXof)}
                  </p>
                  <p className="text-sm text-muted-foreground">Ces crédits n&apos;expirent jamais, contrairement au quota mensuel.</p>
                </div>
                <CheckoutButton
                  endpoint="/api/billing/topup"
                  body={{ packId: pack.id }}
                  label={`Payer ${fcfa(pack.priceXof)}`}
                  variant="outline"
                  disabled={!canManage || !overview.billingConfigured}
                />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Volontairement plus cher à la minute que l&apos;abonnement — sinon personne ne s&apos;abonne.
          </p>
        </CardContent>
      </Card>

      {!canManage && (
        <p className="mb-8 text-sm text-muted-foreground">Seul un owner ou un admin peut payer pour cet espace.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Historique des paiements</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement pour l’instant.</p>
            ) : (
              <ul className="space-y-3">
                {overview.payments.map((intent) => (
                  <li key={intent.id} className="flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium">
                        {intent.kind === 'subscription' ? `Abonnement — ${intent.plan ?? ''}` : 'Recharge de crédits'}
                      </p>
                      <p className="text-muted-foreground">
                        {day(intent.createdAt)} · {credits(intent.creditsGranted)} crédits
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{fcfa(intent.amountXof)}</p>
                      <Badge status={intent.status as PaymentStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grand livre — 10 dernières lignes</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune écriture.</p>
            ) : (
              <ul className="space-y-2">
                {overview.ledger.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className={`font-medium tabular-nums ${entry.delta < 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {entry.delta > 0 ? '+' : ''}{credits(entry.delta)}
                        </span>
                        <PocketBadge pocket={entry.pocket} />
                        <span className="truncate text-xs capitalize text-muted-foreground">{entry.reason.replace('_', ' ')}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day(entry.createdAt)} · solde après : {credits(entry.balanceAfter)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">#{entry.id}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Un débit qui traverse les deux poches écrit deux lignes — une par poche.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
