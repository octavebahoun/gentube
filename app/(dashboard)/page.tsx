import {
  ArrowRight,
  Check,
  Clapperboard,
  Film,
  Mic,
  Music,
  Subtitles,
  Upload,
  Wand2,
} from 'lucide-react';
import { GxButton } from '@/components/gx/gx-button';
import { GxCard, GxCardTitle, GxPerfCard } from '@/components/gx/gx-card';
import { GxBadge } from '@/components/gx/gx-badge-empty';
import { GxTabs } from '@/components/gx/gx-tabs';
import { GxMeter } from '@/components/gx/gx-progress';
import { GxTile, GxMarquee } from '@/components/gx/gx-media';
import { Reveal } from '@/components/gx/gx-reveal';
import {
  CREDIT_FCFA,
  CREDITS_MONTAGE,
  CREDITS_PER_IMAGE,
  CREDITS_PER_SECOND,
  TRIAL_CREDITS,
  imagesAffordable,
  secondsAffordable,
} from '@/lib/credits/pricing';
import { PLAN_OFFERS, TOPUP_PACKS_FOR_SALE } from '@/lib/billing/plans';
import { ProofCarousel } from '@/components/landing-proof-carousel';

/*
 * ═══ LANDING — direction « LA MIRE » ════════════════════════════════════
 * Sujet : la salle d'étalonnage. Job unique de la page : créer sa première
 * vidéo. Thèse du hero : une image fixe qui se met à bouger — c'est
 * littéralement ce que vend le produit, donc c'est ce que la page fait.
 * Signature dépensée à un seul endroit : la mire (6 barres SMPTE).
 * Médias : vraies vidéos rendues par GenTube (public/showcase).
 * ══════════════════════════════════════════════════════════════════════ */

const LOOPS = [1, 2, 3, 4, 5, 6] as const;
const STILLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function minutes(credits: number) {
  return Math.floor(secondsAffordable(credits, 'draft') / 60);
}

function Eyebrow({ children, tone = 'jaune' }: { children: React.ReactNode; tone?: 'jaune' | 'cyan' | 'magenta' }) {
  const c = { jaune: 'text-marque', cyan: 'text-info', magenta: 'text-alerte' }[tone];
  return <p className={`t-label ${c}`}>{children}</p>;
}

function SolutionPanel({
  icon,
  titre,
  loop,
  children,
}: {
  icon: React.ReactNode;
  titre: string;
  loop: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <GxCard className="p-8">
        <GxCardTitle className="flex items-center gap-3">
          {icon}
          {titre}
        </GxCardTitle>
        <p className="mt-3 leading-relaxed text-paper-2">{children}</p>
      </GxCard>
      <GxTile
        poster={`/showcase/loop-${loop}.webp`}
        src={`/showcase/loop-${loop}.mp4`}
        legend="Rendu GenTube"
        timecode="00:05 · 1080p"
      />
    </div>
  );
}

export default function HomePage() {
  const proofs = [
    {
      titre: 'Essai gratuit',
      metric: `${TRIAL_CREDITS} crédits`,
      detail: `≈ ${minutes(TRIAL_CREDITS)} min de vidéo Full HD, filigranée, sans carte bancaire. De quoi juger le résultat.`,
    },
    {
      titre: 'Starter',
      metric: `${PLAN_OFFERS.starter.monthlyCredits.toLocaleString('fr-FR')} crédits / mois`,
      detail: `${PLAN_OFFERS.starter.priceXof.toLocaleString('fr-FR')} FCFA / mois ≈ ${minutes(PLAN_OFFERS.starter.monthlyCredits)} min Full HD ou ${imagesAffordable(PLAN_OFFERS.starter.monthlyCredits)} images.`,
    },
    {
      titre: 'Pro',
      metric: `${PLAN_OFFERS.pro.monthlyCredits.toLocaleString('fr-FR')} crédits / mois`,
      detail: `${PLAN_OFFERS.pro.priceXof.toLocaleString('fr-FR')} FCFA / mois ≈ ${minutes(PLAN_OFFERS.pro.monthlyCredits)} min Full HD. Les recharges n'expirent jamais.`,
    },
  ];

  return (
    <main className="grain relative bg-ink text-paper">
      {/* ── Réglette d'ancres ─────────────────────────────────────────── */}
      <div className="sticky top-(--header-h) z-30 border-b border-line bg-ink/90 backdrop-blur-xl">
        <nav aria-label="Sections" className="gutter no-bar mx-auto flex w-full max-w-(--content-max) items-center gap-1 overflow-x-auto">
          {[
            ['#mur', 'Le mur'],
            ['#probleme', 'Le problème'],
            ['#solution', 'La solution'],
            ['#preuves', 'Preuves'],
            ['#tarifs', 'Tarifs'],
            ['#faq', 'FAQ'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="t-label inline-flex min-h-11 shrink-0 cursor-pointer items-center px-3 text-paper-3 transition-colors duration-(--t-fast) hover:text-marque"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* ═══ 1. HERO ═══ */}
      <section className="gutter relative mx-auto w-full max-w-(--content-max) pt-14 pb-10 sm:pt-20">
        <div className="grid items-end gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="a-fade flex flex-wrap items-center gap-3">
              <GxBadge tone="magenta" live>
                Moteur de montage
              </GxBadge>
              <span className="t-data text-xs text-paper-3">1080p · voix FR · karaoké</span>
            </div>

            <h1 className="t-display a-rise d-1 mt-6">
              Décrivez.
              <br />
              <span className="text-marque">On monte.</span>
            </h1>

            <p className="a-rise d-2 mt-6 max-w-xl text-lg leading-relaxed text-paper-2">
              Vous écrivez un sujet. GenTube écrit le texte, enregistre la voix française,
              fabrique les images, cale les sous-titres karaoké, pose la musique et rend
              un MP4 monté. Vous n'ouvrez aucun logiciel de montage.
            </p>

            <div className="a-rise d-3 mt-9 flex flex-wrap gap-3">
              <GxButton href="/sign-up" size="lg">
                Créer ma première vidéo
                <ArrowRight className="size-4" aria-hidden="true" />
              </GxButton>
              <GxButton href="#mur" variant="secondary" size="lg">
                Voir ce que ça rend
              </GxButton>
            </div>

            <p className="t-data a-rise d-4 mt-5 text-xs text-paper-3">
              {TRIAL_CREDITS} crédits offerts · sans carte bancaire · mobile money · 1 crédit = {CREDIT_FCFA} FCFA
            </p>
          </div>

          {/* Le moniteur : la thèse en objet. Une fixe qui se met à bouger. */}
          <GxPerfCard
            live
            timecode="00:00 / 00:15 · 16:9"
            title="Régie — en cours"
            className="a-rise d-2 shadow-lift"
          >
            <div className="flex items-center gap-3 text-sm text-paper-2">
              <GxMeter label="Fabrication en cours" />
              GenTube assemble votre vidéo…
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                'Texte écrit à partir de votre sujet',
                'Voix française enregistrée, durées mesurées',
                'Images créées scène par scène',
                'Sous-titres karaoké, musique, montage',
              ].map((line, i) => (
                <li key={line} className="a-rise flex gap-2.5 text-paper-2" style={{ animationDelay: `${340 + i * 170}ms` }}>
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {[
                ['Image', `${CREDITS_PER_IMAGE} cr`],
                ['Full HD', `${CREDITS_PER_SECOND.draft} cr/s`],
                ['Montage', `${CREDITS_MONTAGE} cr`],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink-2 px-3 py-2.5">
                  <p className="t-label text-paper-3">{k}</p>
                  <p className="t-data mt-1 text-sm font-bold text-marque">{v}</p>
                </div>
              ))}
            </div>
          </GxPerfCard>
        </div>
      </section>

      {/* ═══ 2. LE MUR — pleine largeur, deux bancs qui défilent ═══ */}
      <section id="mur" className="scroll-mt-32 py-10">
        <div className="gutter mx-auto mb-6 flex w-full max-w-(--content-max) flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow tone="cyan">Le mur</Eyebrow>
            <h2 className="t-h2 mt-3">Des plans rendus par GenTube.</h2>
          </div>
          <p className="max-w-sm text-sm text-paper-3">
            Survolez une vignette : elle se met à bouger. C'est exactement ce que
            fait le produit — une description devient un plan animé.
          </p>
        </div>

        <GxMarquee duration={54} className="[mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
          {LOOPS.map((n) => (
            <GxTile
              key={`loop-${n}`}
              poster={`/showcase/loop-${n}.webp`}
              src={`/showcase/loop-${n}.mp4`}
              legend={`Plan animé ${String(n).padStart(2, '0')}`}
              timecode="00:05 · 1080p"
              className="w-[17rem] shrink-0 sm:w-[21rem]"
            />
          ))}
        </GxMarquee>

        <GxMarquee duration={72} reverse className="mt-3 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
          {STILLS.map((n) => (
            <GxTile
              key={`still-${n}`}
              poster={`/showcase/still-${n}.webp`}
              legend={`Image fixe ${String(n).padStart(2, '0')}`}
              timecode={`${CREDITS_PER_IMAGE} crédits`}
              className="w-[13rem] shrink-0 sm:w-[16rem]"
            />
          ))}
        </GxMarquee>

        <p className="gutter mx-auto mt-5 w-full max-w-(--content-max) text-xs text-paper-3">
          Extraits de rendus réels. Les vignettes ne bougent pas si votre système
          demande moins d'animation.
        </p>
      </section>

      {/* ═══ 3. LE PROBLÈME ═══ */}
      <section id="probleme" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16">
        <Reveal className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Eyebrow tone="magenta">Le problème</Eyebrow>
            <h2 className="t-h2 mt-3">
              Vous assemblez.
              <br />
              Personne ne monte.
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-paper-2">
            Une image générée par ici, une voix par là, un plan animé ailleurs. Puis
            la soirée passe à caler les sous-titres, à réexporter, à recommencer.
            GenTube prend le problème par l'autre bout&nbsp;: vous apportez le sujet,
            il rend le fichier monté.
          </p>
        </Reveal>
      </section>

      {/* ═══ 4. LA SOLUTION ═══ */}
      <section id="solution" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-8">
        <Reveal>
          <Eyebrow>La solution</Eyebrow>
          <h2 className="t-h2 mt-3 max-w-2xl">Tout ce qu'il faut, déjà assemblé.</h2>
        </Reveal>

        <GxTabs
          className="mt-10"
          defaultValue="voix"
          tabs={[
            { value: 'voix', label: 'Voix' },
            { value: 'images', label: 'Images' },
            { value: 'montage', label: 'Montage' },
          ]}
          panels={{
            voix: (
              <SolutionPanel
                icon={<Mic className="size-6 text-info" aria-hidden="true" />}
                titre="Une voix française qui donne le tempo"
                loop={1}
              >
                La voix enregistre chaque scène et mesure sa durée réelle. Le devis
                devient un prix ferme, et les images tombent juste sur les mots.
              </SolutionPanel>
            ),
            images: (
              <SolutionPanel
                icon={<Film className="size-6 text-info" aria-hidden="true" />}
                titre="Images fixes et plans animés"
                loop={4}
              >
                Une image fixe se paie une fois&nbsp;: {CREDITS_PER_IMAGE} crédits, quelle que
                soit sa durée à l'écran. Un plan animé Full HD coûte{' '}
                {CREDITS_PER_SECOND.draft} crédits la seconde. Vos propres fichiers
                remplacent la génération là où vous les déposez.
              </SolutionPanel>
            ),
            montage: (
              <SolutionPanel
                icon={<Clapperboard className="size-6 text-info" aria-hidden="true" />}
                titre="Montage, karaoké, musique"
                loop={5}
              >
                Sous-titres mot à mot <Subtitles className="inline size-4" aria-hidden="true" />,
                musique <Music className="inline size-4" aria-hidden="true" /> calée sur les
                coupes, montage à +{CREDITS_MONTAGE} crédits. Le même storyboard rend deux
                fois le même fichier.
              </SolutionPanel>
            ),
          }}
        />

        {/* Trois temps — l'ordre compte, donc il est numéroté. */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { n: '01', icon: Wand2, t: 'Décrivez', d: 'Un sujet suffit. Le storyboard se génère, scène par scène.' },
            { n: '02', icon: Upload, t: 'Ajustez', d: 'Réécrivez une scène, déposez vos fichiers. Le prix suit en direct.' },
            { n: '03', icon: Film, t: 'Publiez', d: 'Un MP4 monté, téléchargé ou envoyé sur YouTube.' },
          ].map((s, i) => (
            <Reveal key={s.t} delay={i * 90}>
              <GxCard className="h-full">
                <div className="flex items-baseline justify-between">
                  <s.icon className="size-6 text-marque" aria-hidden="true" />
                  <span className="t-data text-2xl font-bold text-line-hi">{s.n}</span>
                </div>
                <GxCardTitle className="mt-5">{s.t}</GxCardTitle>
                <p className="mt-2 text-sm leading-relaxed text-paper-3">{s.d}</p>
              </GxCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ 5. PREUVES ═══ */}
      <section id="preuves" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16">
        <Reveal className="text-center">
          <Eyebrow tone="cyan">Preuves</Eyebrow>
          <h2 className="t-h2 mt-3">Des chiffres vérifiables, pas des promesses.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-paper-3">
            Calculés depuis la grille tarifaire réelle. Aucun témoignage inventé sur cette page.
          </p>
        </Reveal>
        <ProofCarousel proofs={proofs} />
      </section>

      {/* ═══ 6. TARIFS ═══ */}
      <section id="tarifs" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-8">
        <Reveal>
          <Eyebrow>Tarifs</Eyebrow>
          <h2 className="t-h2 mt-3 max-w-2xl">Payez en FCFA, par mobile money.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper-3">
            Le quota mensuel se dépense en premier et expire avec le cycle. Les recharges
            passent après et n'expirent jamais.
          </p>
        </Reveal>

        <GxTabs
          className="mt-8"
          defaultValue="abos"
          tabs={[
            { value: 'abos', label: 'Abonnements' },
            { value: 'recharges', label: 'Recharges' },
          ]}
          panels={{
            abos: (
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <GxCard className="border-dashed">
                  <p className="t-label text-paper-3">Essai</p>
                  <p className="t-data mt-3 text-4xl font-bold">0 FCFA</p>
                  <p className="t-data mt-1 text-xs text-paper-3">
                    {TRIAL_CREDITS} crédits · filigrané
                  </p>
                  <p className="mt-4 text-sm text-paper-2">
                    ≈ {minutes(TRIAL_CREDITS)} min en Full HD pour juger le résultat.
                  </p>
                  <GxButton href="/sign-up" variant="secondary" size="sm" className="mt-6 w-full">
                    Commencer
                  </GxButton>
                </GxCard>

                {([PLAN_OFFERS.starter, PLAN_OFFERS.pro] as const).map((offer, i) => (
                  <GxPerfCard
                    key={offer.plan}
                    title={offer.name}
                    timecode={i === 0 ? 'le plus choisi' : 'accès Cinéma'}
                  >
                    <p className="t-data text-4xl font-bold text-marque">
                      {offer.priceXof.toLocaleString('fr-FR')}
                      <span className="ml-1 text-sm font-normal text-paper-3">FCFA / mois</span>
                    </p>
                    <p className="t-data mt-2 text-xs text-paper-3">
                      {offer.monthlyCredits.toLocaleString('fr-FR')} crédits · ≈{' '}
                      {minutes(offer.monthlyCredits)} min Full HD
                    </p>
                    <GxButton
                      href="/sign-up"
                      variant={i === 0 ? 'primary' : 'secondary'}
                      size="sm"
                      className="mt-6 w-full"
                    >
                      {i === 0 ? 'Créer ma première vidéo' : 'Passer au Pro'}
                    </GxButton>
                  </GxPerfCard>
                ))}
              </div>
            ),
            recharges: (
              <div className="mt-6 grid gap-3">
                {TOPUP_PACKS_FOR_SALE.map((pack) => (
                  <GxCard key={pack.id} className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="t-data text-xl font-bold">
                        {pack.credits.toLocaleString('fr-FR')} crédits
                        <span className="ml-3 text-paper-3">
                          {pack.priceXof.toLocaleString('fr-FR')} FCFA
                        </span>
                      </p>
                      <p className="t-data mt-1 text-xs text-paper-3">
                        ≈ {minutes(pack.credits)} min Full HD · n'expire jamais
                      </p>
                    </div>
                    <GxButton href="/sign-up" variant="secondary" size="sm">
                      Recharger
                    </GxButton>
                  </GxCard>
                ))}
              </div>
            ),
          }}
        />
      </section>

      {/* ═══ 7. FAQ ═══ */}
      <section id="faq" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16">
        <Reveal>
          <Eyebrow tone="magenta">FAQ</Eyebrow>
          <h2 className="t-h2 mt-3">Questions fréquentes</h2>
        </Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            ['Que recevez-vous exactement ?', 'Un MP4 monté : voix française, images, sous-titres karaoké, musique. Pas une archive de fichiers à assembler.'],
            ['Et si je fournis mes propres fichiers ?', 'Ils remplacent la génération sur les scènes concernées. Vous ne payez que ce qui reste à créer.'],
            ['Quelle langue ?', 'Interface et voix en français. Les prompts visuels partent en anglais vers les modèles, sans que vous ayez à le faire.'],
            ['Puis-je arrêter ?', "Oui, à tout moment. Le quota mensuel expire avec son cycle, les recharges achetées restent."],
          ].map(([q, a], i) => (
            <Reveal key={q} delay={i * 70}>
              <GxCard className="h-full">
                <h3 className="font-display text-base font-bold">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-paper-3">{a}</p>
              </GxCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ 8. CTA FINAL ═══ */}
      <section className="gutter mx-auto w-full max-w-(--content-max) pb-16">
        <Reveal>
          <div className="relative overflow-hidden rounded-lg bg-jaune p-8 text-ink sm:p-12">
            <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="t-label opacity-70">Dernière ligne</p>
                <h2 className="t-h2 mt-3 max-w-lg">Décrivez un sujet. Recevez une vidéo montée.</h2>
                <p className="t-data mt-3 text-sm opacity-80">
                  {TRIAL_CREDITS} crédits offerts · sans carte · ≈ {minutes(TRIAL_CREDITS)} min pour juger.
                </p>
              </div>
              <GxButton href="/sign-up" variant="dark" size="lg" className="shrink-0">
                Créer ma première vidéo
                <ArrowRight className="size-4" aria-hidden="true" />
              </GxButton>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="gutter mx-auto flex w-full max-w-(--content-max) flex-wrap items-center justify-between gap-3 py-8 text-xs text-paper-3">
          <p>© 2026 GenTube</p>
          <p className="t-data">
            1 crédit = {CREDIT_FCFA} FCFA · image {CREDITS_PER_IMAGE} cr · Full HD {CREDITS_PER_SECOND.draft} cr/s · montage {CREDITS_MONTAGE} cr
          </p>
        </div>
      </footer>
    </main>
  );
}
