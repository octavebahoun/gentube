import { redirect } from 'next/navigation';
import { Clock, Infinity as InfinityIcon, Wallet } from 'lucide-react';
import { Badge } from '@/components/kit/badge';
import { Card, CardBody, CardHeader } from '@/components/kit/card';
import { Tabs } from '@/components/kit/tabs';
import { Page, PageHeader, Notice, Section } from '@/components/kit/page';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { getBillingOverview } from '@/lib/billing/checkout';
import { createPaymentGateway, isBillingConfigured } from '@/lib/payments';
import { reveillerLeTenant } from '@/lib/billing/reveil';
import { imagesAffordable, secondsAffordable } from '@/lib/credits/pricing';
import type { PaymentStatus } from '@/lib/db/schema';
import { CheckoutButton, SubscriptionCancellation } from './billing-actions';

function fcfa(amount: number) {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}
function credits(amount: number) {
  return amount.toLocaleString('fr-FR');
}
function minutes(seconds: number) {
  return `${Math.floor(seconds / 60)} min`;
}
function jour(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* Les états de paiement, en français, avec le ton de la mire qui va avec. */
const ETAT_PAIEMENT: Record<
  string,
  { label: string; tone: 'ok' | 'neutral' | 'bad'; live?: boolean }
> = {
  succeeded: { label: 'Encaissé', tone: 'ok' },
  paid: { label: 'Payé', tone: 'ok' },
  active: { label: 'Actif', tone: 'ok' },
  pending: { label: 'En attente', tone: 'neutral', live: true },
  created: { label: 'Créé', tone: 'neutral' },
  past_due: { label: 'En retard', tone: 'bad' },
  failed: { label: 'Échoué', tone: 'bad' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
  expired: { label: 'Expiré', tone: 'neutral' },
  suspended: { label: 'Suspendu', tone: 'bad' },
};

const MOTIF: Record<string, string> = {
  plan_grant: 'Dotation du plan',
  topup: 'Recharge',
  generation: 'Génération',
  render: 'Montage',
  refund: 'Remboursement',
  trial: 'Essai offert',
};

function EtatPaiement({ status }: { status: string }) {
  const e = ETAT_PAIEMENT[status] ?? { label: status, tone: 'neutral' as const };
  return (
    <Badge tone={e.tone} live={e.live}>
      {e.label}
    </Badge>
  );
}

/**
 * Crédite le retour d'un paiement sans attendre le rappel du prestataire.
 *
 * SasPay ne livre aucun webhook aujourd'hui — vérifié sur deux transactions
 * réelles le 5 septembre 2026, journal de livraison vide. Sans ce déclencheur,
 * un client paie et ne voit rien arriver.
 *
 * Il ne remplace pas le rappel : il le double. Le même règlement passé deux
 * fois est arrêté par la clé d'idempotence, donc rien n'est crédité deux fois.
 *
 * Rien ici ne doit faire tomber la page. Un client qui vient de payer a le
 * droit de voir sa facturation même si la passerelle est injoignable — son
 * paiement sera repris au réveil suivant.
 */
async function rattraper(tenantId: number): Promise<void> {
  if (!isBillingConfigured()) return;
  try {
    await reveillerLeTenant(createPaymentGateway(), tenantId);
  } catch (error) {
    console.error('Rattrapage au retour de paiement impossible:', error);
  }
}

/* Une poche de crédits : ce qu'elle contient, quand elle se vide. */
function Poche({
  titre,
  montant,
  note,
  detail,
  mention,
  icone,
}: {
  titre: string;
  montant: number;
  note: string;
  detail: string;
  mention: React.ReactNode;
  icone: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="t-label flex items-center gap-2">
          {icone}
          {titre}
        </p>
        {mention}
      </CardHeader>
      <CardBody>
        <p className="t-data text-4xl font-bold text-ink">{credits(montant)}</p>
        <p className="t-data mt-1 text-xs text-ink-3">{note}</p>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{detail}</p>
      </CardBody>
    </Card>
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
  const { payment } = await searchParams;

  // Le payeur revient : on relit ses encaissements AVANT d'afficher le solde,
  // sinon la page montrerait l'ancien et il croirait avoir payé pour rien.
  if (payment === 'return') await rattraper(user.tenantId);

  const [overview, tenant] = await Promise.all([getBillingOverview(tdb), tdb.getTenant()]);
  const canManage = user.role === 'owner' || user.role === 'admin';

  const creditsPlan = tenant?.creditsPlan ?? 0;
  const creditsTopup = tenant?.creditsTopup ?? 0;
  const expireAt = tenant?.planCreditsExpireAt ?? null;

  return (
    <Page>
      <PageHeader
        eyebrow="Facturation"
        titre="Crédits et facturation"
        intro="Tout en FCFA, par mobile money, sans carte bancaire. Deux poches : le quota mensuel expire avec son cycle, les crédits achetés restent."
      />

      <div className="space-y-4">
        {payment === 'return' && (
          <Notice tone="ok">
            Retour du paiement. Votre encaissement vient d’être relu auprès de SasPay : le solde
            ci-dessous est à jour. S’il n’a pas bougé, le paiement n’a pas abouti — rien n’a été
            débité, vous pouvez réessayer.
          </Notice>
        )}
        {!overview.billingConfigured && (
          <Notice tone="erreur">
            Les clés SasPay manquent sur cette instance : le paiement est désactivé. Renseignez{' '}
            <code className="font-mono">SASPAY_SANDBOX_API_KEY</code> et{' '}
            <code className="font-mono">SASPAY_SANDBOX_WEBHOOK_SECRET</code>.
          </Notice>
        )}
        {overview.subscription?.status === 'suspended' && (
          <Notice tone="erreur">
            Trop d’échecs de paiement : l’abonnement ne se renouvelle plus. Vos crédits restent
            intacts — payez un plan pour reprendre.
          </Notice>
        )}
        {!canManage && (
          <Notice tone="erreur">
            Seul un propriétaire ou un admin peut payer pour cet espace.
          </Notice>
        )}
      </div>

      {/* ── Les deux poches ─────────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Poche
          titre="Quota mensuel"
          icone={<Clock className="size-4" aria-hidden="true" />}
          mention={<Badge tone="neutral">expire</Badge>}
          montant={creditsPlan}
          note={`crédits · ${expireAt ? `expire le ${jour(expireAt)}` : 'pas de cycle en cours'} · ≈ ${minutes(secondsAffordable(creditsPlan, 'draft'))} en Full HD`}
          detail="Renouvelé à chaque cycle payé. Débité en premier, pour que personne ne perde une valeur qu’il aurait pu consommer."
        />
        <Poche
          titre="Crédits achetés"
          icone={<Wallet className="size-4" aria-hidden="true" />}
          mention={
            <Badge tone="neutral" dot={false}>
              <InfinityIcon className="size-3" aria-hidden="true" /> jamais
            </Badge>
          }
          montant={creditsTopup}
          note={`crédits · conservés indéfiniment · ≈ ${minutes(secondsAffordable(creditsTopup, 'draft'))} en Full HD`}
          detail="Recharges payées en plus de l’abonnement. Faire expirer ce qui a été acheté serait du vol : ils restent. Débités après le quota."
        />
      </div>

      {/* ── Offre actuelle ──────────────────────────────────────────── */}
      <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="t-label">Offre actuelle</p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-lg font-bold capitalize text-ink">{overview.plan}</span>
            {overview.subscription && <EtatPaiement status={overview.subscription.status} />}
          </p>
          <p className="mt-1 text-sm text-ink-3">
            {overview.subscription?.currentPeriodEnd
              ? `Renouvelle le ${jour(overview.subscription.currentPeriodEnd)}`
              : 'Aucune période payée pour l’instant.'}
          </p>
        </div>
        <div className="text-right">
          <p className="t-data text-3xl font-bold text-ink">{credits(overview.creditsBalance)}</p>
          <p className="t-data text-xs text-ink-3">
            crédits · ≈ {minutes(secondsAffordable(overview.creditsBalance, 'draft'))} en Full HD
          </p>
        </div>
        <SubscriptionCancellation subscription={overview.subscription} canManage={canManage} />
      </Card>

      {/* ── Onglets : payer, recharger, vérifier ────────────────────── */}
      <Tabs
        className="mt-8"
        defaultValue="plans"
        tabs={[
          { value: 'plans', label: 'Abonnements' },
          { value: 'recharges', label: 'Recharges' },
          { value: 'historique', label: 'Historique', count: overview.payments.length },
        ]}
        panels={{
          plans: (
            <div className="mt-6">
              <ul className="grid grid-cols-1 gap-3">
                {overview.offers.map((offer) => {
                  const actuelle = overview.plan === offer.plan;
                  return (
                    <Card
                      key={offer.plan}
                      className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-base font-bold text-ink">
                          {offer.name}
                          <span className="t-data ml-3">{fcfa(offer.priceXof)}</span>
                          <span className="text-sm font-normal text-ink-3"> / mois</span>
                        </p>
                        <p className="t-data mt-1 text-xs text-ink-3">
                          {credits(offer.monthlyCredits)} crédits ≈{' '}
                          {minutes(secondsAffordable(offer.monthlyCredits, 'draft'))} en Full HD, ou{' '}
                          {imagesAffordable(offer.monthlyCredits)} images fixes
                        </p>
                      </div>
                      {actuelle ? (
                        <Badge tone="ok">Offre actuelle</Badge>
                      ) : (
                        <CheckoutButton
                          endpoint="/api/billing/subscribe"
                          body={{ plan: offer.plan }}
                          label={`Payer ${fcfa(offer.priceXof)}`}
                          disabled={!canManage || !overview.billingConfigured}
                        />
                      )}
                    </Card>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-ink-3">
                Mobile money en FCFA via SasPay — MTN, Moov et Celtiis Cash. Les offres Business sont sur devis.
              </p>
            </div>
          ),
          recharges: (
            <div className="mt-6">
              <ul className="grid grid-cols-1 gap-3">
                {overview.topupPacks.map((pack) => (
                  <Card
                    key={pack.id}
                    className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="t-data text-lg font-bold text-ink">
                        {credits(pack.credits)} crédits
                        <span className="ml-3">{fcfa(pack.priceXof)}</span>
                      </p>
                      <p className="mt-1 text-xs text-ink-3">
                        Ces crédits n’expirent jamais, contrairement au quota mensuel.
                      </p>
                    </div>
                    <CheckoutButton
                      endpoint="/api/billing/topup"
                      body={{ packId: pack.id }}
                      label={`Payer ${fcfa(pack.priceXof)}`}
                      disabled={!canManage || !overview.billingConfigured}
                    />
                  </Card>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-3">
                Volontairement plus cher à la minute que l’abonnement — sinon personne ne s’abonne.
              </p>
            </div>
          ),
          historique: (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Section titre="Paiements">
                {overview.payments.length === 0 ? (
                  <p className="text-sm text-ink-3">Aucun paiement pour l’instant.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {overview.payments.map((intent) => (
                      <li key={intent.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {intent.kind === 'subscription'
                              ? `Abonnement ${intent.plan ?? ''}`
                              : 'Recharge de crédits'}
                          </p>
                          <p className="t-data mt-0.5 text-xs text-ink-3">
                            {jour(intent.createdAt)} · {credits(intent.creditsGranted)} crédits
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="t-data text-sm text-ink">{fcfa(intent.amountXof)}</p>
                          <div className="mt-1 flex justify-end">
                            <EtatPaiement status={intent.status as PaymentStatus} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section titre="Grand livre" aide="Les dix dernières écritures.">
                {overview.ledger.length === 0 ? (
                  <p className="text-sm text-ink-3">Aucune écriture.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {overview.ledger.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span
                              className={`t-data text-sm font-bold ${entry.delta < 0 ? 'text-bad' : 'text-ok'}`}
                            >
                              {entry.delta > 0 ? '+' : ''}
                              {credits(entry.delta)}
                            </span>
                            <Badge tone="neutral" dot={false}>
                              {entry.pocket === 'topup' ? 'Achetés' : 'Quota'}
                            </Badge>
                            <span className="truncate text-xs text-ink-3">
                              {MOTIF[entry.reason] ?? entry.reason.replace('_', ' ')}
                            </span>
                          </p>
                          <p className="t-data mt-0.5 text-xs text-ink-3">
                            {jour(entry.createdAt)} · solde après : {credits(entry.balanceAfter)}
                          </p>
                        </div>
                        <span className="t-data shrink-0 text-xs text-ink-3">#{entry.id}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
                  Un débit qui traverse les deux poches écrit deux lignes — une par poche.
                </p>
              </Section>
            </div>
          ),
        }}
      />
    </Page>
  );
}
