import { redirect } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_STYLE: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  active: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  created: 'bg-gray-100 text-gray-700',
  past_due: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
  expired: 'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-800',
};

function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {status.replace('_', ' ')}
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

  const overview = await getBillingOverview(tenantDb(user.tenantId));
  const { payment } = await searchParams;
  const canManage = user.role === 'owner' || user.role === 'admin';

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Billing</h1>

      {/* The gateway sends the payer back here; the balance itself only moves
          when the webhook confirms the payment, which can land a beat later. */}
      {payment === 'success' && (
        <p className="mb-6 rounded-md bg-green-50 p-4 text-sm text-green-800">
          Payment received. Credits appear as soon as GeniusPay confirms it —
          usually within a few seconds.
        </p>
      )}
      {payment === 'failed' && (
        <p className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-800">
          The payment was not completed. Nothing was charged — you can try again
          below.
        </p>
      )}
      {!overview.billingConfigured && (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          GeniusPay keys are missing on this instance, so checkout is disabled.
          Set the three <code>GENIUS_SANDBOX_*</code> variables (or the{' '}
          <code>GENIUS_LIVE_*</code> ones, with <code>GENIUS_ENV=live</code>).
        </p>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium capitalize">
                {overview.plan}{' '}
                {overview.subscription && (
                  <Badge status={overview.subscription.status} />
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {overview.subscription?.currentPeriodEnd
                  ? `Renews on ${day(overview.subscription.currentPeriodEnd)}`
                  : 'No paid period yet.'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">
                {credits(overview.creditsBalance)}
              </p>
              <p className="text-sm text-muted-foreground">
                credits ≈ {minutes(secondsAffordable(overview.creditsBalance, '480p'))}{' '}
                at 480p
              </p>
            </div>
          </div>
          {overview.subscription?.status === 'suspended' && (
            <p className="mt-4 text-sm text-red-600">
              Payment failed too many times, so the subscription stopped
              renewing. Your credits are untouched — pay a plan below to resume.
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
                  className="flex flex-col gap-3 border-b border-gray-100 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {offer.name} — {fcfa(offer.priceXof)}
                      <span className="text-sm text-muted-foreground"> / month</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {credits(offer.monthlyCredits)} credits ≈{' '}
                      {minutes(secondsAffordable(offer.monthlyCredits, '480p'))} at
                      480p
                    </p>
                  </div>
                  {current ? (
                    <span className="text-sm text-muted-foreground">
                      Current plan
                    </span>
                  ) : (
                    <CheckoutButton
                      endpoint="/api/billing/subscribe"
                      body={{ plan: offer.plan }}
                      label={`Pay ${fcfa(offer.priceXof)}`}
                      disabled={!canManage || !overview.billingConfigured}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Mobile money or card, in XOF, through GeniusPay. Business plans are
            quoted individually.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Top up credits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {overview.topupPacks.map((pack) => (
              <li
                key={pack.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {credits(pack.credits)} credits — {fcfa(pack.priceXof)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Bought credits never expire, unlike the monthly allowance.
                  </p>
                </div>
                <CheckoutButton
                  endpoint="/api/billing/topup"
                  body={{ packId: pack.id }}
                  label={`Pay ${fcfa(pack.priceXof)}`}
                  variant="outline"
                  disabled={!canManage || !overview.billingConfigured}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!canManage && (
        <p className="mb-8 text-sm text-muted-foreground">
          Only an owner or admin can pay for this workspace.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.payments.length === 0 ? (
            <p className="text-muted-foreground">No payment yet.</p>
          ) : (
            <ul className="space-y-3">
              {overview.payments.map((intent) => (
                <li
                  key={intent.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {intent.kind === 'subscription'
                        ? `Subscription — ${intent.plan ?? ''}`
                        : 'Credit top-up'}
                    </p>
                    <p className="text-muted-foreground">
                      {day(intent.createdAt)} · {credits(intent.creditsGranted)}{' '}
                      credits
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
    </section>
  );
}
