import {
  ArrowRight,
  Check,
  Clapperboard,
  Film,
  Mic,
  Music,
  Play,
  Sparkles,
  Subtitles,
  Upload,
  Wand2,
  Zap,
  Sliders,
  Layers,
  Video,
  ChevronRight,
  Star,
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
 * ═══ GENTUBE LANDING PAGE — CINEMATIC AI VIDEO PLATFORM ══════════════════
 * Direction artistique : AI × Cinema × Motion × Creative Studio
 * Palette : #050608 (Bg), #0B0D10 (Secondary), #111419 (Surface), #171A20 (Elevated)
 * Accent Action : Rouge Brand #FF3B30, Accent IA : Violet #A855F7, Highlight : #FFB340
 * ═════════════════════════════════════════════════════════════════════════ */

const LOOPS = [1, 2, 3, 4, 5, 6] as const;
const STILLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function minutes(credits: number) {
  return Math.floor(secondsAffordable(credits, 'draft') / 60);
}

function Eyebrow({ children, tone = 'rouge' }: { children: React.ReactNode; tone?: 'rouge' | 'purple' | 'amber' }) {
  const c = { rouge: 'text-[#FF3B30]', purple: 'text-[#A855F7]', amber: 'text-[#FFB340]' }[tone];
  return <p className={`t-label ${c}`}>{children}</p>;
}

export default function HomePage() {
  const proofs = [
    {
      titre: 'Essai gratuit',
      metric: `${TRIAL_CREDITS} crédits`,
      detail: `≈ ${minutes(TRIAL_CREDITS)} min de vidéo Full HD, filigranée, sans carte bancaire. De quoi tester la création vidéo IA immédiatement.`,
    },
    {
      titre: 'Plan Starter',
      metric: `${PLAN_OFFERS.starter.monthlyCredits.toLocaleString('fr-FR')} crédits / mois`,
      detail: `${PLAN_OFFERS.starter.priceXof.toLocaleString('fr-FR')} FCFA / mois ≈ ${minutes(PLAN_OFFERS.starter.monthlyCredits)} min Full HD ou ${imagesAffordable(PLAN_OFFERS.starter.monthlyCredits)} visuels cinématiques.`,
    },
    {
      titre: 'Plan Pro Studio',
      metric: `${PLAN_OFFERS.pro.monthlyCredits.toLocaleString('fr-FR')} crédits / mois`,
      detail: `${PLAN_OFFERS.pro.priceXof.toLocaleString('fr-FR')} FCFA / mois ≈ ${minutes(PLAN_OFFERS.pro.monthlyCredits)} min Full HD avec voix ElevenLabs. Les recharges n'expirent jamais.`,
    },
  ];

  return (
    <main className="relative bg-[#050608] text-[#F5F5F5] selection:bg-[#FF3B30] selection:text-[#050608]">
      {/* Glows d'arrière-plan cinématiques très subtils */}
      <div className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#FF3B30]/10 via-[#A855F7]/5 to-transparent blur-[140px]" />

      {/* ── Navigation Minimaliste ─────────────────────────────────── */}
      <div className="sticky top-(--header-h) z-30 border-b border-[#292D35] bg-[#050608]/90 backdrop-blur-xl">
        <nav aria-label="Sections" className="gutter no-bar mx-auto flex w-full max-w-(--content-max) items-center gap-2 overflow-x-auto py-1">
          {[
            ['#studio', 'Creative Studio'],
            ['#features', 'Fonctionnalités'],
            ['#workflow', 'Workflow'],
            ['#galerie', 'Galerie'],
            ['#temoignages', 'Témoignages'],
            ['#pricing', 'Tarifs'],
            ['#faq', 'FAQ'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="t-label inline-flex min-h-11 shrink-0 cursor-pointer items-center px-3.5 text-[#A5A7AD] transition-colors duration-200 hover:text-[#FF3B30]"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* ═══ 1. HERO CINÉMATIQUE ═══ */}
      <section className="gutter relative mx-auto w-full max-w-(--content-max) pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="flex flex-col items-center text-center">
          <div className="a-fade inline-flex items-center gap-2.5 rounded-full border border-[#A855F7]/30 bg-[#A855F7]/10 px-4 py-1.5 glow-purple-subtle">
            <Sparkles className="size-4 text-[#A855F7]" aria-hidden="true" />
            <span className="t-label text-xs font-bold text-[#A855F7]">AI × Cinema × Motion Studio</span>
          </div>

          <h1 className="t-display a-rise d-1 mt-6 max-w-4xl tracking-tight text-[#F5F5F5]">
            Transforme tes idées en <br />
            <span className="text-gradient-gt">vidéos cinématiques</span> avec l'IA
          </h1>

          <p className="a-rise d-2 mt-6 max-w-2xl text-lg leading-relaxed text-[#A5A7AD]">
            GenTube est le studio créatif IA tout-en-un : génération de scripts, voix off cinématique, montage intelligent, sous-titres animés et effets de transition professionnels.
          </p>

          <div className="a-rise d-3 mt-8 flex flex-wrap items-center justify-center gap-4">
            <GxButton href="/sign-up" variant="primary" size="lg" glow>
              Commencer gratuitement
              <ArrowRight className="size-4" aria-hidden="true" />
            </GxButton>
            <GxButton href="#studio" variant="secondary" size="lg">
              <Play className="size-4 text-[#FF3B30]" aria-hidden="true" />
              Voir la démo
            </GxButton>
          </div>

          <p className="t-data a-rise d-4 mt-4 text-xs text-[#A5A7AD]">
            {TRIAL_CREDITS} crédits offerts · Sans carte bancaire · Paiement Mobile Money (XOF)
          </p>

          {/* Mockup Réaliste de l'Éditeur Vidéo GenTube */}
          <div id="studio" className="a-rise d-5 mt-12 w-full scroll-mt-32">
            <div className="relative overflow-hidden rounded-2xl border border-[#292D35] bg-[#0B0D10] shadow-2xl glow-red-subtle">
              {/* Studio Toolbar Header */}
              <div className="flex items-center justify-between border-b border-[#292D35] bg-[#111419] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="size-3 rounded-full bg-[#FF4D5A]/80" />
                    <span className="size-3 rounded-full bg-[#FFB340]/80" />
                    <span className="size-3 rounded-full bg-[#35D07F]/80" />
                  </div>
                  <span className="t-label text-xs text-[#A5A7AD] ml-2">GenTube Video Studio v2.4 — [Projet_Docu_IA.gt]</span>
                </div>
                <div className="flex items-center gap-3">
                  <GxBadge tone="purple" live>
                    AI Assistant Actif
                  </GxBadge>
                  <span className="font-mono text-xs text-[#FF3B30] font-bold">00:02:14 / 00:05:00</span>
                </div>
              </div>

              {/* Main Studio Editor Workspace */}
              <div className="grid grid-cols-1 gap-px bg-[#292D35] lg:grid-cols-[240px_1fr_280px]">
                {/* Left Panel: Media Library */}
                <div className="bg-[#0B0D10] p-4 text-left hidden lg:block">
                  <p className="t-label text-xs text-[#A5A7AD] mb-3">Médiathèque IA</p>
                  <div className="space-y-2">
                    {[
                      { name: 'Scene_1_Cyber.mp4', duration: '5s', tag: 'Vidéo IA' },
                      { name: 'Voiceover_FR.mp3', duration: '12s', tag: 'Voix Eleven' },
                      { name: 'BGM_Cinematic.wav', duration: '2m', tag: 'Musique' },
                      { name: 'Captions_FR.json', duration: '12s', tag: 'Sous-titres' },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-[#292D35] bg-[#111419] p-2.5 text-xs">
                        <div className="truncate font-mono text-[#F5F5F5]">{item.name}</div>
                        <span className="rounded bg-[#A855F7]/20 px-1.5 py-0.5 text-[10px] text-[#A855F7]">{item.tag}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Center Video Preview Monitor */}
                <div className="bg-[#050608] p-6 flex flex-col items-center justify-center min-h-[320px]">
                  <div className="relative w-full max-w-xl aspect-video rounded-xl border border-[#292D35] overflow-hidden bg-[#111419] group shadow-2xl">
                    <img
                      src="/showcase/loop-1.webp"
                      alt="Aperçu Studio GenTube"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050608]/90 via-transparent to-transparent flex flex-col justify-end p-4">
                      <div className="flex items-center justify-between">
                        <div className="bg-[#050608]/80 backdrop-blur-md px-3 py-1 rounded border border-[#FF3B30]/40 text-xs font-mono text-[#FF3B30]">
                          REC 1080p 60fps
                        </div>
                        <div className="bg-[#A855F7]/80 backdrop-blur-md px-3 py-1 rounded text-xs font-mono text-white">
                          Transition: Shader Melt
                        </div>
                      </div>
                      <p className="mt-2 text-center text-sm font-semibold text-[#F5F5F5] bg-[#050608]/70 py-1.5 px-3 rounded border border-[#292D35]">
                        "L'intelligence artificielle redéfinit les frontières du cinéma..."
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Panel: AI Inspector */}
                <div className="bg-[#0B0D10] p-4 text-left hidden lg:block">
                  <p className="t-label text-xs text-[#A855F7] mb-3 flex items-center gap-1.5">
                    <Sparkles className="size-3.5" /> Prompt Studio
                  </p>
                  <div className="rounded-xl border border-[#A855F7]/30 bg-[#171A20] p-3 text-xs space-y-3">
                    <p className="text-[#A5A7AD]">Prompt visuel :</p>
                    <p className="font-mono text-[#F5F5F5] bg-[#050608] p-2 rounded border border-[#292D35]">
                      Cinematic shot of futuristic camera lens in dark studio, dramatic orange and purple lighting, 8k resolution.
                    </p>
                    <GxButton variant="ai" size="sm" className="w-full">
                      Régénérer la scène
                    </GxButton>
                  </div>
                </div>
              </div>

              {/* Bottom Interactive Studio Timeline */}
              <div className="border-t border-[#292D35] bg-[#111419] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#A5A7AD] font-mono mb-1">
                  <span>TIMELINE MULTI-TRACKS</span>
                  <span>TIME: 00:02:14</span>
                </div>
                {/* Track 1: Video */}
                <div className="flex items-center gap-2">
                  <span className="w-20 text-xs font-mono text-[#FF3B30] text-left">Piste Vidéo</span>
                  <div className="flex-1 grid grid-cols-4 gap-1 h-8">
                    <div className="bg-[#FF3B30]/30 border border-[#FF3B30] rounded px-2 py-1 text-[10px] font-mono text-white flex items-center">Scène 1 (Wan 2.2)</div>
                    <div className="bg-[#FF3B30]/50 border border-[#FF3B30] rounded px-2 py-1 text-[10px] font-mono text-white flex items-center">Scène 2 (Flux)</div>
                    <div className="bg-[#FF3B30]/30 border border-[#FF3B30] rounded px-2 py-1 text-[10px] font-mono text-white flex items-center">Scène 3 (P-Video)</div>
                    <div className="bg-[#171A20] border border-[#292D35] rounded px-2 py-1 text-[10px] font-mono text-[#A5A7AD] flex items-center">+ Ajouter</div>
                  </div>
                </div>
                {/* Track 2: Audio Voice */}
                <div className="flex items-center gap-2">
                  <span className="w-20 text-xs font-mono text-[#A855F7] text-left">Voix OFF</span>
                  <div className="flex-1 bg-[#A855F7]/20 border border-[#A855F7] h-6 rounded px-2 py-0.5 text-[10px] font-mono text-white flex items-center">
                    ElevenLabs Fr-Voice (12.4s)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. SECTION : L'IA AU SERVICE DE TA CRÉATIVITÉ ═══ */}
      <section className="gutter mx-auto w-full max-w-(--content-max) py-16 lg:py-24 border-t border-[#292D35]">
        <Reveal className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow tone="purple">L'IA au service de ta créativité</Eyebrow>
            <h2 className="t-h2 mt-4 text-[#F5F5F5]">
              Ne perds plus des heures en montage. Concentre-toi sur l'histoire.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[#A5A7AD]">
              Les outils de montage traditionnels sont lents et complexes. GenTube combine la puissance des derniers modèles IA (Flux, Wan 2.2, ElevenLabs, DeepSeek) dans une interface studio unifiée.
            </p>
            <div className="mt-8 space-y-4">
              {[
                { title: 'Workflow 10x plus rapide', desc: 'Du prompt à la vidéo montable en moins de 3 minutes.' },
                { title: 'Qualité cinéma professionnelle', desc: 'Rendus haute définition, voix naturelles et transitions fluides.' },
                { title: 'Contrôle créatif total', desc: 'Édite chaque mot, ajust la timeline et choisis tes effets.' },
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#FF3B30]/20 text-[#FF3B30]">
                    <Check className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-[#F5F5F5]">{item.title}</h3>
                    <p className="text-sm text-[#A5A7AD]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <GxPerfCard title="Génération Studio" timecode="4K Render Engine">
              <div className="space-y-4">
                <div className="rounded-xl border border-[#292D35] bg-[#050608] p-4">
                  <p className="t-label text-xs text-[#A855F7] mb-2">Pipelined Generation</p>
                  <p className="text-sm font-mono text-[#F5F5F5]">1. DeepSeek Storyboard Generator</p>
                  <p className="text-sm font-mono text-[#F5F5F5] mt-1">2. EdgeTTS & ElevenLabs Voice Alignment</p>
                  <p className="text-sm font-mono text-[#F5F5F5] mt-1">3. Flux Klein 4B & Wan 2.2 Motion Synthesis</p>
                  <p className="text-sm font-mono text-[#FF3B30] mt-1">4. HyperFrames Distributed AWS Rendering</p>
                </div>
                <div className="flex items-center justify-between text-xs text-[#A5A7AD]">
                  <span>Durée estimée : 45s</span>
                  <span className="text-[#35D07F]">Prêt pour export MP4</span>
                </div>
              </div>
            </GxPerfCard>
          </div>
        </Reveal>
      </section>

      {/* ═══ 3. SECTION : FONCTIONNALITÉS ═══ */}
      <section id="features" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16">
        <Reveal className="text-center">
          <Eyebrow tone="rouge">Fonctionnalités Studio</Eyebrow>
          <h2 className="t-h2 mt-3">Tout ce dont tu as besoin pour créer.</h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-[#A5A7AD]">
            Un ensemble d'outils intelligents conçus spécifiquement pour la création vidéo moderne.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Wand2, title: 'Script IA', desc: 'Génération de storyboards captivants structurés scène par scène grâce à DeepSeek.' },
            { icon: Mic, title: 'Voice-Over Naturel', desc: 'Voix off réalistes en français alimentées par Amazon Polly et ElevenLabs.' },
            { icon: Film, title: 'Montage Intelligent', desc: 'Assemblage automatique des plans, cadrages dynamiques et mouvements de caméra.' },
            { icon: Subtitles, title: 'Sous-titres Karaoké', desc: 'Synchronisation mot à mot pour un engagement maximal sur les réseaux sociaux.' },
            { icon: Layers, title: 'Media Library', desc: 'Bibliothèque de visuels, effets sonores (SFX) et musiques libres de droits.' },
            { icon: Zap, title: 'Export & Publication', desc: 'Rendu MP4 ultra-rapide et publication directe vers YouTube.' },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <GxCard className="h-full group">
                <div className="flex size-12 items-center justify-center rounded-xl bg-[#171A20] border border-[#292D35] text-[#FF3B30] group-hover:border-[#FF3B30] group-hover:glow-red-subtle transition-all">
                  <f.icon className="size-6" />
                </div>
                <GxCardTitle className="mt-5">{f.title}</GxCardTitle>
                <p className="mt-2 text-sm text-[#A5A7AD] leading-relaxed">{f.desc}</p>
              </GxCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ 4. SECTION : WORKFLOW ═══ */}
      <section id="workflow" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16 border-t border-[#292D35]">
        <Reveal className="text-center">
          <Eyebrow tone="purple">Workflow Créatif</Eyebrow>
          <h2 className="t-h2 mt-3">Une histoire visuelle en 4 étapes simples.</h2>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {[
            { step: '01', title: 'IDEA', desc: 'Renseigne ton sujet ou ton idée de vidéo.' },
            { step: '02', title: 'CREATE', desc: "L'IA génère le script, la voix et les images." },
            { step: '03', title: 'EDIT', desc: 'Personnalise le montage sur la timeline.' },
            { step: '04', title: 'PUBLISH', desc: 'Exporte en MP4 ou publie directement.' },
          ].map((w, idx) => (
            <Reveal key={w.step} delay={idx * 100}>
              <div className="relative rounded-xl border border-[#292D35] bg-[#111419] p-6 text-center">
                <span className="font-mono text-3xl font-bold text-[#A855F7]">{w.step}</span>
                <h3 className="mt-3 font-display text-lg font-bold text-[#F5F5F5]">{w.title}</h3>
                <p className="mt-2 text-xs text-[#A5A7AD] leading-relaxed">{w.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ 5. SECTION : GALERIE DE CRÉATIONS ═══ */}
      <section id="galerie" className="scroll-mt-32 py-16">
        <div className="gutter mx-auto mb-8 flex w-full max-w-(--content-max) flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow tone="amber">Galerie Cinéma</Eyebrow>
            <h2 className="t-h2 mt-2">Rendus réels générés par GenTube.</h2>
          </div>
          <p className="max-w-sm text-sm text-[#A5A7AD]">
            Survole une vignette pour lancer la prévisualisation vidéo.
          </p>
        </div>

        <GxMarquee duration={50} className="[mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
          {LOOPS.map((n) => (
            <GxTile
              key={`loop-${n}`}
              poster={`/showcase/loop-${n}.webp`}
              src={`/showcase/loop-${n}.mp4`}
              legend={`Plan animé GenTube #${String(n).padStart(2, '0')}`}
              timecode="00:05 · 1080p"
              className="w-[18rem] shrink-0 sm:w-[22rem]"
            />
          ))}
        </GxMarquee>
      </section>

      {/* ═══ 6. SECTION : TÉMOIGNAGES ═══ */}
      <section id="temoignages" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16 border-t border-[#292D35]">
        <Reveal className="text-center">
          <Eyebrow tone="rouge">Témoignages</Eyebrow>
          <h2 className="t-h2 mt-3">Ce que disent les créateurs.</h2>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {[
            {
              name: 'Marc K.',
              role: 'Créateur YouTube (120k abonnés)',
              quote: "GenTube m'a permis de doubler ma fréquence de publication sans sacrifier la qualité visuelle.",
            },
            {
              name: 'Sarah L.',
              role: 'Fondatrice Agence Digital Motion',
              quote: 'Les voix en français et la qualité des sous-titres sont tout simplement bluffantes pour nos clients.',
            },
            {
              name: 'David O.',
              role: 'Producteur de Contenu Tech',
              quote: "L'éditeur vidéo studio donne l'impression d'avoir un monteur professionnel dans son navigateur.",
            },
          ].map((t, idx) => (
            <Reveal key={t.name} delay={idx * 100}>
              <GxCard className="h-full flex flex-col justify-between">
                <div>
                  <div className="flex gap-1 text-[#FF3B30]">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="size-4 fill-current" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-[#F5F5F5] italic leading-relaxed">"{t.quote}"</p>
                </div>
                <div className="mt-6 border-t border-[#292D35] pt-4">
                  <p className="font-display font-bold text-sm text-[#F5F5F5]">{t.name}</p>
                  <p className="text-xs text-[#A5A7AD]">{t.role}</p>
                </div>
              </GxCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ 7. SECTION : PRICING ═══ */}
      <section id="pricing" className="gutter mx-auto w-full max-w-(--content-max) scroll-mt-32 py-16">
        <Reveal className="text-center">
          <Eyebrow tone="purple">Tarification Claire</Eyebrow>
          <h2 className="t-h2 mt-3">Des offres adaptées à tes besoins.</h2>
          <p className="mt-2 text-sm text-[#A5A7AD]">Paiement sécurisé en FCFA par Mobile Money (MTN, Moov, Celtiis).</p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {/* Free Trial */}
          <GxCard className="border-dashed flex flex-col justify-between">
            <div>
              <p className="t-label text-[#A5A7AD]">Essai Gratuit</p>
              <p className="t-data mt-4 text-4xl font-bold text-[#F5F5F5]">0 FCFA</p>
              <p className="mt-2 text-xs text-[#A5A7AD]">{TRIAL_CREDITS} crédits offerts à l'inscription</p>
              <p className="mt-4 text-sm text-[#A5A7AD] leading-relaxed">
                Idéal pour tester l'éditeur studio et créer tes premières séquences vidéo sans engagement.
              </p>
            </div>
            <GxButton href="/sign-up" variant="secondary" className="mt-8 w-full">
              Essayer gratuitement
            </GxButton>
          </GxCard>

          {/* Starter */}
          <GxPerfCard title="Starter Plan" timecode="Inclus Voix Polly">
            <div className="flex flex-col justify-between h-full">
              <div>
                <p className="t-data text-4xl font-bold text-[#FF3B30]">
                  {PLAN_OFFERS.starter.priceXof.toLocaleString('fr-FR')} <span className="text-sm text-[#A5A7AD]">FCFA / mois</span>
                </p>
                <p className="mt-2 text-xs text-[#A5A7AD]">
                  {PLAN_OFFERS.starter.monthlyCredits.toLocaleString('fr-FR')} crédits / mois
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-[#A5A7AD]">
                  <li className="flex items-center gap-2"><Check className="size-4 text-[#35D07F]" /> ≈ {minutes(PLAN_OFFERS.starter.monthlyCredits)} min de vidéo Full HD</li>
                  <li className="flex items-center gap-2"><Check className="size-4 text-[#35D07F]" /> Voix Off Amazon Polly Neural</li>
                  <li className="flex items-center gap-2"><Check className="size-4 text-[#35D07F]" /> Montage Studio & Sous-titres</li>
                </ul>
              </div>
              <GxButton href="/sign-up" variant="primary" className="mt-8 w-full" glow>
                S'abonner au Starter
              </GxButton>
            </div>
          </GxPerfCard>

          {/* Pro */}
          <GxPerfCard title="Pro Studio" timecode="ElevenLabs Included">
            <div className="flex flex-col justify-between h-full">
              <div>
                <p className="t-data text-4xl font-bold text-[#A855F7]">
                  {PLAN_OFFERS.pro.priceXof.toLocaleString('fr-FR')} <span className="text-sm text-[#A5A7AD]">FCFA / mois</span>
                </p>
                <p className="mt-2 text-xs text-[#A5A7AD]">
                  {PLAN_OFFERS.pro.monthlyCredits.toLocaleString('fr-FR')} crédits / mois
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-[#A5A7AD]">
                  <li className="flex items-center gap-2"><Check className="size-4 text-[#35D07F]" /> ≈ {minutes(PLAN_OFFERS.pro.monthlyCredits)} min de vidéo Full HD</li>
                  <li className="flex items-center gap-2"><Check className="size-4 text-[#35D07F]" /> Voix ElevenLabs Ultra-naturelles</li>
                  <li className="flex items-center gap-2"><Check className="size-4 text-[#35D07F]" /> Priorité de rendu AWS Lambda</li>
                </ul>
              </div>
              <GxButton href="/sign-up" variant="ai" className="mt-8 w-full" glow>
                Passer au Pro Studio
              </GxButton>
            </div>
          </GxPerfCard>
        </div>
      </section>

      {/* ═══ 8. CTA FINAL ═══ */}
      <section className="gutter mx-auto w-full max-w-(--content-max) pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-[#FF3B30]/30 bg-gradient-to-r from-[#171A20] via-[#111419] to-[#0B0D10] p-10 lg:p-16 glow-red-subtle">
            <div className="flex flex-col items-center text-center">
              <h2 className="t-h1 text-[#F5F5F5]">Prêt à créer ta prochaine vidéo ?</h2>
              <p className="mt-4 max-w-xl text-lg text-[#A5A7AD]">
                Rejoins les créateurs qui utilisent GenTube pour produire du contenu cinématique captivant.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <GxButton href="/sign-up" variant="primary" size="lg" glow>
                  Commencer gratuitement
                  <ArrowRight className="size-4" />
                </GxButton>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-[#292D35] bg-[#0B0D10] py-12">
        <div className="gutter mx-auto flex w-full max-w-(--content-max) flex-wrap items-center justify-between gap-6 text-xs text-[#A5A7AD]">
          <div className="flex items-center gap-3">
            <span className="size-6 rounded bg-[#FF3B30]" />
            <span className="font-display font-bold text-sm text-[#F5F5F5]">GenTube Studio</span>
          </div>
          <p>© 2026 GenTube — Creative Video AI Platform</p>
          <div className="flex gap-4">
            <a href="#studio" className="hover:text-[#F5F5F5]">Studio</a>
            <a href="#features" className="hover:text-[#F5F5F5]">Fonctionnalités</a>
            <a href="#pricing" className="hover:text-[#F5F5F5]">Tarifs</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
