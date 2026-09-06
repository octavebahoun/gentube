import { redirect } from 'next/navigation';
import { Clock, Infinity as InfinityIcon, Wallet } from 'lucide-react';
import { GxBadge } from '@/components/gx/gx-badge-empty';
import { GxTabs } from '@/components/gx/gx-tabs';
import { GxPage, GxPageHeader, GxNotice } from '@/components/gx/gx-page';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { getBillingOverview } from '@/lib/billing/checkout';
import { createPaymentGateway, isBillingConfigured } from '@/lib/payments';
import { reveillerLeTenant } from '@/lib/billing/reveil';
import { imagesAffordable, secondsAffordable } from '@/lib/credits/pricing';
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
function jour(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* Les états de paiement, en français, avec le ton de la mire qui va avec. */
const ETAT_PAIEMENT: Record<string, { label: string; tone: 'vert' | 'jaune' | 'rouge' | 'neutre' }> = {
  succeeded: { label: 'Encaissé', tone: 'vert' },
  paid: { label: 'Payé', tone: 'vert' },
  active: { label: 'Actif', tone: 'vert' },
  pending: { label: 'En attente', tone: 'jaune' },
  created: { label: 'Créé', tone: 'neutre' },
  past_due: { label: 'En retard', tone: 'jaune' },
  failed: { label: 'Échoué', tone: 'rouge' },
  cancelled: { label: 'Annulé', tone: 'neutre' },
  expired: { label: 'Expiré', tone: 'neutre' },
  suspended: { label: 'Suspendu', tone: 'rouge' },
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
  const e = ETAT_PAIEMENT[status] ?? { label: status, tone: 'neutre' as const };
  return <GxBadge tone={e.tone}>{e.label}</GxBadge>;
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
  ton,
}: {
  titre: string;
  montant: number;
  note: string;
  detail: string;
  mention: React.ReactNode;
  icone: React.ReactNode;
  ton: 'jaune' | 'cyan';
}) {
  return (
    <div className="plate relative overflow-hidden p-5 pl-6">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${ton === 'jaune' ? 'bg-jaune' : 'bg-cyan'}`}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="t-label flex items-center gap-2 text-paper-2">
          {icone}
          {titre}
        </p>
        {mention}
      </div>
      <p className="t-data mt-4 text-4xl font-bold">{credits(montant)}</p>
      <p className="t-data mt-1 text-xs text-paper-3">{note}</p>
      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-paper-3">{detail}</p>
    </div>
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
    <GxPage className="max-w-6xl">
      <GxPageHeader
        eyebrow="Facturation"
        titre="Crédits et facturation"
        intro="Tout en FCFA, par mobile money, sans carte bancaire. Deux poches : le quota mensuel expire avec son cycle, les crédits achetés restent."
      />

      <div className="space-y-4">
        {payment === 'return' && (
          <GxNotice tone="ok">
            Retour du paiement. Votre encaissement vient d’être relu auprès de SasPay : le solde
            ci-dessous est à jour. S’il n’a pas bougé, le paiement n’a pas abouti — rien n’a été
            débité, vous pouvez réessayer.
          </GxNotice>
        )}
        {!overview.billingConfigured && (
          <GxNotice tone="erreur">
            Les clés SasPay manquent sur cette instance : le paiement est désactivé. Renseignez{' '}
            <code className="font-mono">SASPAY_SANDBOX_API_KEY</code> et{' '}
            <code className="font-mono">SASPAY_SANDBOX_WEBHOOK_SECRET</code>.
          </GxNotice>
        )}
        {overview.subscription?.status === 'suspended' && (
          <GxNotice tone="erreur">
            Trop d’échecs de paiement : l’abonnement ne se renouvelle plus. Vos crédits restent
            intacts — payez un plan pour reprendre.
          </GxNotice>
        )}
        {!canManage && (
          <GxNotice tone="erreur">
            Seul un propriétaire ou un admin peut payer pour cet espace.
          </GxNotice>
        )}
      </div>

      {/* ── Les deux poches ─────────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Poche
          ton="jaune"
          titre="Quota mensuel"
          icone={<Clock className="size-4 text-marque" aria-hidden="true" />}
          mention={<GxBadge tone="jaune">expire</GxBadge>}
          montant={creditsPlan}
          note={`crédits · ${expireAt ? `expire le ${jour(expireAt)}` : 'pas de cycle en cours'} · ≈ ${minutes(secondsAffordable(creditsPlan, 'draft'))} en Full HD`}
          detail="Renouvelé à chaque cycle payé. Débité en premier, pour que personne ne perde une valeur qu’il aurait pu consommer."
        />
        <Poche
          ton="cyan"
          titre="Crédits achetés"
          icone={<Wallet className="size-4 text-info" aria-hidden="true" />}
          mention={
            <GxBadge tone="cyan" dot={false}>
              <InfinityIcon className="size-3" aria-hidden="true" /> jamais
            </GxBadge>
          }
          montant={creditsTopup}
          note={`crédits · conservés indéfiniment · ≈ ${minutes(secondsAffordable(creditsTopup, 'draft'))} en Full HD`}
          detail="Recharges payées en plus de l’abonnement. Faire expirer ce qui a été acheté serait du vol : ils restent. Débités après le quota."
        />
      </div>

      {/* ── Offre actuelle ──────────────────────────────────────────── */}
      <div className="plate mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="t-label text-paper-3">Offre actuelle</p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-display text-lg font-bold capitalize">{overview.plan}</span>
            {overview.subscription && <EtatPaiement status={overview.subscription.status} />}
          </p>
          <p className="mt-1 text-sm text-paper-3">
            {overview.subscription?.currentPeriodEnd
              ? `Renouvelle le ${jour(overview.subscription.currentPeriodEnd)}`
              : 'Aucune période payée pour l’instant.'}
          </p>
        </div>
        <div className="text-right">
          <p className="t-data text-3xl font-bold text-marque">{credits(overview.creditsBalance)}</p>
          <p className="t-data text-xs text-paper-3">
            crédits · ≈ {minutes(secondsAffordable(overview.creditsBalance, 'draft'))} en Full HD
          </p>
        </div>
      </div>

      {/* ── Onglets : payer, recharger, vérifier ────────────────────── */}
      <GxTabs
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
              <ul className="grid gap-3">
                {overview.offers.map((offer) => {
                  const actuelle = overview.plan === offer.plan;
                  return (
                    <li
                      key={offer.plan}
                      className="plate flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-display text-base font-bold">
                          {offer.name}
                          <span className="t-data ml-3 text-marque">{fcfa(offer.priceXof)}</span>
                          <span className="text-sm font-normal text-paper-3"> / mois</span>
                        </p>
                        <p className="t-data mt-1 text-xs text-paper-3">
                          {credits(offer.monthlyCredits)} crédits ≈{' '}
                          {minutes(secondsAffordable(offer.monthlyCredits, 'draft'))} en Full HD, ou{' '}
                          {imagesAffordable(offer.monthlyCredits)} images fixes
                        </p>
                      </div>
                      {actuelle ? (
                        <GxBadge tone="vert">Offre actuelle</GxBadge>
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
              <p className="mt-4 text-xs text-paper-3">
                Mobile money en FCFA via SasPay — MTN, Moov et Celtiis Cash. Les offres Business sont sur devis.
              </p>
            </div>
          ),
          recharges: (
            <div className="mt-6">
              <ul className="grid gap-3">
                {overview.topupPacks.map((pack) => (
                  <li
                    key={pack.id}
                    className="plate flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="t-data text-lg font-bold">
                        {credits(pack.credits)} crédits
                        <span className="ml-3 text-marque">{fcfa(pack.priceXof)}</span>
                      </p>
                      <p className="mt-1 text-xs text-paper-3">
                        Ces crédits n’expirent jamais, contrairement au quota mensuel.
                      </p>
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
              <p className="mt-4 text-xs text-paper-3">
                Volontairement plus cher à la minute que l’abonnement — sinon personne ne s’abonne.
              </p>
            </div>
          ),
          historique: (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <section className="plate p-5">
                <h2 className="font-display text-base font-bold">Paiements</h2>
                {overview.payments.length === 0 ? (
                  <p className="mt-4 text-sm text-paper-3">Aucun paiement pour l’instant.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {overview.payments.map((intent) => (
                      <li key={intent.id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {intent.kind === 'subscription'
                              ? `Abonnement ${intent.plan ?? ''}`
                              : 'Recharge de crédits'}
                          </p>
                          <p className="t-data mt-0.5 text-xs text-paper-3">
                            {jour(intent.createdAt)} · {credits(intent.creditsGranted)} crédits
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="t-data text-sm">{fcfa(intent.amountXof)}</p>
                          <EtatPaiement status={intent.status as PaymentStatus} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="plate p-5">
                <h2 className="font-display text-base font-bold">Grand livre</h2>
                <p className="mt-1 text-xs text-paper-3">Les dix dernières écritures.</p>
                {overview.ledger.length === 0 ? (
                  <p className="mt-4 text-sm text-paper-3">Aucune écriture.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {overview.ledger.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span
                              className={`t-data text-sm font-bold ${entry.delta < 0 ? 'text-danger' : 'text-ok'}`}
                            >
                              {entry.delta > 0 ? '+' : ''}
                              {credits(entry.delta)}
                            </span>
                            <GxBadge tone={entry.pocket === 'topup' ? 'cyan' : 'jaune'} dot={false}>
                              {entry.pocket === 'topup' ? 'Achetés' : 'Quota'}
                            </GxBadge>
                            <span className="truncate text-xs text-paper-3">
                              {MOTIF[entry.reason] ?? entry.reason.replace('_', ' ')}
                            </span>
                          </p>
                          <p className="t-data mt-0.5 text-xs text-paper-3">
                            {jour(entry.createdAt)} · solde après : {credits(entry.balanceAfter)}
                          </p>
                        </div>
                        <span className="t-data shrink-0 text-xs text-line-hi">#{entry.id}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 border-t border-line pt-3 text-xs text-paper-3">
                  Un débit qui traverse les deux poches écrit deux lignes — une par poche.
                </p>
              </section>
            </div>
          ),
        }}
      />
    </GxPage>
  );
}
