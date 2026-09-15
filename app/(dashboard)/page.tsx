import {
  ArrowRight,
  Check,
  Clapperboard,
  Layers,
  Mic,
  Subtitles,
  Wand2,
  Zap,
} from 'lucide-react';
import { ButtonLink } from '@/components/kit/button';
import { Card } from '@/components/kit/card';
import { Badge } from '@/components/kit/badge';
import { Tile, Marquee } from '@/components/kit/tile';
import { Reveal } from '@/components/kit/reveal';
import { ProofCarousel } from '@/components/landing-proof-carousel';
import {
  TRIAL_CREDITS,
  secondsAffordable,
  imagesAffordable,
} from '@/lib/credits/pricing';
import { PLAN_OFFERS } from '@/lib/billing/plans';

const LOOPS = [1, 2, 3, 4, 5, 6] as const;

/* Le catalogue de mouvements de caméra, monté par le cadreur. Chaque boucle
 * est un vrai rendu p-video 1080p, compressé pour l'accueil. */
const EFFETS = [
  { n: 1, label: 'Panoramique' },
  { n: 2, label: 'Tilt vertical' },
  { n: 3, label: 'Travelling vertical' },
  { n: 4, label: 'Whip pan' },
  { n: 5, label: 'Crash zoom' },
  { n: 6, label: 'Travelling latéral' },
  { n: 7, label: 'Caméra portée' },
  { n: 8, label: 'Slow motion' },
] as const;

function minutes(credits: number) {
  return Math.floor(secondsAffordable(credits, 'draft') / 60);
}

export default function HomePage() {
  const proofs = [
    {
      titre: 'Essai gratuit',
      metric: `${TRIAL_CREDITS} crédits`,
      detail: `≈ ${minutes(TRIAL_CREDITS)} min de vidéo montée, sans carte bancaire. De quoi juger le résultat sur une vraie vidéo.`,
    },
    {
      titre: `Plan ${PLAN_OFFERS.starter.name}`,
      metric: `${PLAN_OFFERS.starter.monthlyCredits.toLocaleString('fr-FR')} crédits / mois`,
      detail: `${PLAN_OFFERS.starter.priceXof.toLocaleString('fr-FR')} FCFA / mois ≈ ${minutes(PLAN_OFFERS.starter.monthlyCredits)} min de vidéo montée ou ${imagesAffordable(PLAN_OFFERS.starter.monthlyCredits)} visuels. Voix Polly Neural.`,
    },
    {
      titre: `Plan ${PLAN_OFFERS.pro.name}`,
      metric: `${PLAN_OFFERS.pro.monthlyCredits.toLocaleString('fr-FR')} crédits / mois`,
      detail: `${PLAN_OFFERS.pro.priceXof.toLocaleString('fr-FR')} FCFA / mois ≈ ${minutes(PLAN_OFFERS.pro.monthlyCredits)} min de vidéo montée. Voix ElevenLabs.`,
    },
  ];

  return (
    <main className="display-tight bg-canvas text-ink">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-(--content-max) px-(--gutter) pt-14 pb-10 lg:pt-24 lg:pb-14">
        <p className="t-label">Studio vidéo IA</p>
        <h1 className="t-display mt-4 max-w-3xl">Décrivez. On monte.</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
          Écrivez votre sujet. GenTube écrit le storyboard scène par scène, fabrique la voix et les
          images, monte le MP4. Vous corrigez, vous publiez.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <ButtonLink href="/sign-up" size="lg">
            Créer ma première vidéo
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href="#preuves" variant="secondary" size="lg">
            Voir des rendus réels
          </ButtonLink>
        </div>
        <p className="mt-4 text-xs text-ink-3">
          {TRIAL_CREDITS} crédits offerts · sans carte bancaire · mobile money et carte, en FCFA
        </p>
      </section>

      {/* ── LE MUR : de vrais rendus, plein cadre ────────────────────── */}
      <section aria-label="Rendus réels" className="border-y border-line py-4">
        <Marquee duration={54}>
          {LOOPS.map((n) => (
            <Tile
              key={`loop-${n}`}
              poster={`/showcase/loop-${n}.webp`}
              src={`/showcase/loop-${n}.mp4`}
              legend={`Rendu GenTube ${String(n).padStart(2, '0')}`}
              timecode="00:05 · 1080p"
              className="w-[17rem] shrink-0 sm:w-[21rem]"
            />
          ))}
        </Marquee>
      </section>

      {/* ── LE CATALOGUE D'EFFETS ────────────────────────────────────── */}
      <section
        aria-label="Catalogue de mouvements de caméra"
        className="border-b border-line py-4"
      >
        <div className="mx-auto mb-4 w-full max-w-(--content-max) px-(--gutter)">
          <p className="t-label">Le catalogue</p>
          <h2 className="t-h2 mt-2 max-w-2xl">
            Des mouvements de caméra de cinéma, écrits par un prompt.
          </h2>
        </div>
        <Marquee duration={48} reverse>
          {EFFETS.map(({ n, label }) => (
            <Tile
              key={`effet-${n}`}
              poster={`/showcase/effet-${n}.webp`}
              src={`/showcase/effet-${n}.mp4`}
              legend={label}
              timecode="1080p"
              className="w-[17rem] shrink-0 sm:w-[21rem]"
            />
          ))}
        </Marquee>
      </section>

      {/* ── LE PROBLÈME ──────────────────────────────────────────────── */}
      <section id="probleme" className="mx-auto w-full max-w-(--content-max) scroll-mt-24 px-(--gutter) py-16 lg:py-24">
        <Reveal>
          <p className="t-label">Le problème</p>
          <h2 className="t-h1 mt-3 max-w-2xl">
            Monter une vidéo prend une journée. Vous en avez une heure.
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              {
                Icon: Wand2,
                titre: 'Le storyboard s’écrit à la main',
                texte: 'Scène par scène, phrase par phrase. C’est le travail qui prend le plus de temps, et personne ne le voit.',
              },
              {
                Icon: Mic,
                titre: 'La voix se réenregistre à chaque correction',
                texte: 'Un mot change, tout est à reprendre. Le studio, le micro, le calage — encore.',
              },
              {
                Icon: Clapperboard,
                titre: 'Le montage attend un monteur',
                texte: 'Et le monteur, c’est vous. Le soir, après la journée.',
              },
            ].map((p) => (
              <div key={p.titre} className="border-t border-line pt-5">
                <p.Icon className="size-5 text-ink-3" aria-hidden="true" />
                <h3 className="t-h3 mt-3">{p.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{p.texte}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── LA SOLUTION ──────────────────────────────────────────────── */}
      <section id="solution" className="border-t border-line">
        <div className="mx-auto w-full max-w-(--content-max) scroll-mt-24 px-(--gutter) py-16 lg:py-24">
          <Reveal>
            <p className="t-label">La solution</p>
            <h2 className="t-h1 mt-3 max-w-2xl">Un prompt écrit. Un MP4 monté.</h2>
          </Reveal>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              {
                n: '1',
                titre: 'Décrivez',
                texte:
                  'Votre sujet, votre ton, votre durée. Le LLM écrit le storyboard : la phrase que la voix lit, le visuel à fabriquer, l’effet à appliquer.',
              },
              {
                n: '2',
                titre: 'Corrigez',
                texte:
                  'Un kanban de scènes. Réordonnez, réécrivez, changez la voix, ajustez un plan. Le devis en crédits se met à jour en direct.',
              },
              {
                n: '3',
                titre: 'Recevez',
                texte:
                  'La chaîne fabrique : voix, images, clips animés, montage. Le MP4 arrive prêt à publier, en Full HD.',
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
                  <span className="t-data text-sm font-bold text-ink-3">{s.n} / 3</span>
                  <h3 className="t-h3 mt-3">{s.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.texte}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-8">
            <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {[
                { Icon: Zap, titre: '43 effets', texte: 'au catalogue, appliqués par le cadreur' },
                { Icon: Layers, titre: '19 structures', texte: 'de plan, du portrait au plan large' },
                { Icon: Mic, titre: '3 voix', texte: 'aperçu, Polly Neural, ElevenLabs' },
                { Icon: Subtitles, titre: 'Sous-titres karaoké', texte: 'synchronisés mot à mot' },
              ].map((c) => (
                <div key={c.titre} className="bg-surface p-5">
                  <c.Icon className="size-5 text-ink-3" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-ink">{c.titre}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">{c.texte}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PREUVES ──────────────────────────────────────────────────── */}
      <section id="preuves" className="border-t border-line">
        <div className="mx-auto w-full max-w-(--content-max) scroll-mt-24 px-(--gutter) py-16 lg:py-24">
          <Reveal className="text-center">
            <p className="t-label">Preuves</p>
            <h2 className="t-h1 mt-3">Les chiffres, pas les promesses.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-2">
              Le produit est mesuré, pas raconté. Voici ce qui tourne aujourd’hui.
            </p>
          </Reveal>

          <Reveal className="mt-10">
            <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {[
                { valeur: '858', label: 'tests au vert' },
                { valeur: '43', label: 'effets au catalogue' },
                { valeur: '34 s', label: 'pour monter 16 s de vidéo' },
                { valeur: '0,0105 $', label: 'coût réel du rendu' },
              ].map((s) => (
                <div key={s.label} className="bg-surface px-5 py-6 text-center">
                  <p className="t-data text-3xl font-bold text-ink">{s.valeur}</p>
                  <p className="mt-1.5 text-xs text-ink-3">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className="mt-10">
            <ProofCarousel proofs={proofs} />
          </Reveal>
        </div>
      </section>

      {/* ── TARIFS ───────────────────────────────────────────────────── */}
      <section id="tarifs" className="border-t border-line">
        <div className="mx-auto w-full max-w-(--content-max) scroll-mt-24 px-(--gutter) py-16 lg:py-24">
          <Reveal>
            <p className="t-label">Tarifs</p>
            <h2 className="t-h1 mt-3 max-w-2xl">Le prix est en FCFA. Le paiement est mobile money.</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-2">
              Pas de conversion, pas de carte obligatoire. Les crédits du plan vivent 30 jours ;
              les crédits rechargés n’expirent jamais.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col p-5">
              <p className="t-label">Essai</p>
              <p className="t-data mt-3 text-3xl font-bold">0 FCFA</p>
              <p className="mt-1 text-xs text-ink-3">{TRIAL_CREDITS} crédits offerts à l’inscription</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />≈{' '}
                  {minutes(TRIAL_CREDITS)} min de vidéo montée
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  Storyboard, voix, images, montage
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  Sans carte bancaire
                </li>
              </ul>
              <ButtonLink href="/sign-up" variant="secondary" className="mt-6 w-full">
                Essayer gratuitement
              </ButtonLink>
            </Card>

            <Card className="flex flex-col p-5">
              <p className="t-label">{PLAN_OFFERS.starter.name}</p>
              <p className="t-data mt-3 text-3xl font-bold">
                {PLAN_OFFERS.starter.priceXof.toLocaleString('fr-FR')}{' '}
                <span className="text-sm font-normal text-ink-3">FCFA / mois</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {PLAN_OFFERS.starter.monthlyCredits.toLocaleString('fr-FR')} crédits par mois
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />≈{' '}
                  {minutes(PLAN_OFFERS.starter.monthlyCredits)} min de vidéo montée
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  Voix Amazon Polly Neural
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  Storyboard éditable et sous-titres
                </li>
              </ul>
              <ButtonLink href="/sign-up" variant="secondary" className="mt-6 w-full">
                Choisir Starter
              </ButtonLink>
            </Card>

            <Card className="flex flex-col p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="t-label">{PLAN_OFFERS.pro.name}</p>
                <Badge tone="neutral">Le plus complet</Badge>
              </div>
              <p className="t-data mt-3 text-3xl font-bold">
                {PLAN_OFFERS.pro.priceXof.toLocaleString('fr-FR')}{' '}
                <span className="text-sm font-normal text-ink-3">FCFA / mois</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {PLAN_OFFERS.pro.monthlyCredits.toLocaleString('fr-FR')} crédits par mois
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />≈{' '}
                  {minutes(PLAN_OFFERS.pro.monthlyCredits)} min de vidéo montée
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  Voix ElevenLabs
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  Priorité de rendu
                </li>
              </ul>
              <ButtonLink href="/sign-up" variant="secondary" className="mt-6 w-full">
                Choisir Pro
              </ButtonLink>
            </Card>
          </div>

          <p className="mt-5 text-xs text-ink-3">
            Recharges ponctuelles dès 2 000 FCFA — les crédits achetés n’expirent jamais.
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl scroll-mt-24 px-(--gutter) py-16 lg:py-24">
          <Reveal>
            <p className="t-label">Questions</p>
            <h2 className="t-h1 mt-3">Ce qu’on nous demande avant d’essayer.</h2>
          </Reveal>

          <div className="mt-8 divide-y divide-line border-y border-line">
            {[
              {
                q: 'Faut-il savoir monter une vidéo ?',
                r: 'Non. Vous écrivez le sujet, le storyboard est généré scène par scène, et le montage est automatique. Si vous voulez corriger, le kanban vous donne chaque scène : phrase, visuel, effet.',
              },
              {
                q: 'Comment je paie ?',
                r: 'Mobile money (MTN, Moov, Celtiis) ou carte, en FCFA, via SasPay. L’essai de 120 crédits ne demande aucune carte.',
              },
              {
                q: 'Mes crédits expirent-ils ?',
                r: 'Les crédits inclus dans un plan vivent le temps du cycle, 30 jours. Les crédits que vous rechargez n’expirent jamais.',
              },
              {
                q: 'Quelle voix pour la narration ?',
                r: 'Français, trois moteurs selon le plan : Edge TTS pour l’aperçu, Amazon Polly Neural avec Starter, ElevenLabs avec Pro.',
              },
              {
                q: 'Est-ce que je peux publier directement sur YouTube ?',
                r: 'L’export MP4 est prêt à publier dès maintenant. La connexion de chaîne YouTube est en place côté compte ; la publication automatique reste à activer.',
              },
            ].map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="text-ink-3 transition-transform duration-(--t-fast) group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{f.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── DERNIER MOT ──────────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-16 lg:py-20">
          <Reveal>
            <h2 className="t-h1 max-w-2xl">Votre première vidéo est à un prompt.</h2>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Créer ma première vidéo
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <span className="text-xs text-ink-3">
                {TRIAL_CREDITS} crédits offerts · sans carte
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-(--content-max) flex-wrap items-center justify-between gap-4 px-(--gutter) py-8 text-xs text-ink-3">
          <p className="font-semibold text-ink">GenTube</p>
          <nav aria-label="Pied de page" className="flex flex-wrap items-center gap-4">
            <a href="#solution" className="transition-colors duration-(--t-fast) hover:text-ink">
              Comment ça marche
            </a>
            <a href="#tarifs" className="transition-colors duration-(--t-fast) hover:text-ink">
              Tarifs
            </a>
            <a href="#faq" className="transition-colors duration-(--t-fast) hover:text-ink">
              FAQ
            </a>
          </nav>
          <p>© 2026 GenTube — fait pour l’Afrique de l’Ouest</p>
        </div>
      </footer>
    </main>
  );
}
