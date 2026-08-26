import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clapperboard,
  Coins,
  Film,
  Image as ImageIcon,
  Mic,
  Music,
  Palette,
  Play,
  Sparkles,
  Subtitles,
  Upload,
  Video as VideoIcon,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// ——— Sur-titre discret, rouge accent ———
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.18em] text-brand-accent uppercase">
      {children}
    </p>
  );
}

export default function HomePage() {
  return (
    <main className="bg-background text-foreground">
      {/* Header — noir, rouge, nav fantôme comme la maquette */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Play className="size-3.5 fill-current" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Gen<span className="text-brand-accent">Tube</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a href="#fonctionnalites" className="hover:text-foreground">Fonctionnalités</a>
            <a href="#comment" className="hover:text-foreground">Comment ça marche</a>
            <a href="#cas" className="hover:text-foreground">Cas d’usage</a>
            <a href="#tarifs" className="hover:text-foreground">Tarifs</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Se connecter
            </Link>
            <Link href="/sign-up" className={buttonVariants({ size: 'sm' }) + ' rounded-full'}>
              Commencer
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — thèse du produit */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <Eyebrow>Création vidéo par IA — voix française, montage inclus</Eyebrow>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              On tape un sujet,
              <span className="block text-brand-accent">on récupère une vidéo prête à publier.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              GenTube écrit le texte, enregistre la voix off, génère chaque image et chaque plan animé,
              cale les sous-titres mot à mot, la musique et le montage — et publie sur votre chaîne YouTube.
              Les autres outils livrent des pièces détachées ; nous livrons une vidéo finie.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: 'lg' }) + ' rounded-full'}>
                Créer gratuitement
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#comment"
                className={buttonVariants({ variant: 'outline', size: 'lg' }) + ' rounded-full'}
              >
                <Play className="size-4" />
                Voir la démo
              </a>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-primary" />
                Sans carte bancaire
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-primary" />
                Générée en quelques minutes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-primary" />
                Mobile money
              </span>
            </div>
          </div>

          {/* Visuel hero — cadre sombre avec lueur rouge */}
          <div className="relative lg:col-span-6">
            <div className="absolute -inset-3 -z-10 rounded-2xl bg-primary/20 blur-2xl" />
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="relative aspect-video bg-muted">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                    <Play className="size-6 fill-current" />
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-white backdrop-blur">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 animate-pulse rounded-full bg-red-500" />
                    16:9 · 848×480 → 1280×720 · 30 IPS
                  </span>
                  <span className="tabular-nums opacity-70">00:00 / 00:15</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                <span>Voix française · sous-titres karaoké</span>
                <span className="tabular-nums">1 crédit = 1 s en 480p</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 étapes */}
      <section id="comment" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border bg-card p-6 sm:p-8">
          <div className="text-center">
            <Eyebrow>Simple, rapide, puissant</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Votre vidéo en 3 étapes</h2>
          </div>
          <div className="relative mt-8 grid gap-6 sm:grid-cols-3">
            <div className="absolute left-[16%] right-[16%] top-6 hidden h-px border-t border-dashed border-border sm:block" />
            {[
              { n: '01', icon: Wand2, title: 'Tapez votre sujet', desc: 'Un thème, un titre, ou un script. L’IA s’occupe du reste.' },
              { n: '02', icon: Sparkles, title: 'L’IA fait sa magie', desc: 'Scènes, voix, images, musique et montage — tout est assemblé.' },
              { n: '03', icon: Upload, title: 'Téléchargez & partagez', desc: 'Récupérez le MP4 ou publiez direct sur YouTube.' },
            ].map((s) => (
              <div key={s.n} className="relative flex flex-col items-center text-center">
                <span className="flex size-12 items-center justify-center rounded-full border bg-background text-primary shadow-sm">
                  <s.icon className="size-5" />
                </span>
                <p className="mt-3 text-xs font-semibold tracking-widest text-brand-accent">{s.n}</p>
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <p className="mt-1 max-w-[22ch] text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fonctionnalités — 6 cartes */}
      <section id="fonctionnalites" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <Eyebrow>Le montage est le différenciateur</Eyebrow>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Tout ce qu’il faut pour créer</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            La concurrence livre une image, une voix, un plan — et vous laisse assembler. GenTube monte :
            HTML → MP4 via HyperFrames, calé à la frame, reproductible.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Film, title: 'Génération vidéo IA', desc: 'Des vidéos haute qualité à partir d’un simple sujet. Aucun montage manuel.' },
            { icon: Mic, title: 'Voix & avatars IA', desc: 'Voix françaises naturelles (Polly / ElevenLabs) avec alignement mot à mot.' },
            { icon: Music, title: 'Musique libre de droits', desc: 'Musique et bruitages calés sur les coupes, volumes par scène.' },
            { icon: Subtitles, title: 'Sous-titres auto', desc: 'Karaoké mot à mot, style personnalisable, jamais hors cadre.' },
            { icon: Palette, title: 'Styles multiples', desc: 'Cinématique, anime, réaliste, 3D — prompt visuel par scène.' },
            { icon: Clapperboard, title: 'Formats multiples', desc: '16:9, 9:16, 1:1 — 848×480 ou 1280×720, multiples de 16.' },
          ].map((f) => (
            <Card key={f.title} className="bg-card">
              <CardHeader>
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <f.icon className="size-4" />
                </span>
                <CardTitle className="text-sm">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Cas d’usage — 4 cartes image */}
      <section id="cas" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Eyebrow>Pour créateurs, écoles, radios et PME d’Afrique de l’Ouest</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Des vidéos pour chaque usage</h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Marketing & pubs', desc: 'Des annonces qui convertissent.', icon: VideoIcon },
            { title: 'YouTube & contenu', desc: 'Faites grandir votre chaîne.', icon: Play },
            { title: 'Formation & entreprise', desc: 'Des vidéos pro pour vos équipes.', icon: ImageIcon },
            { title: 'Histoires & animation', desc: 'Donnez vie à vos idées.', icon: Sparkles },
          ].map((c) => (
            <Card key={c.title} className="overflow-hidden">
              <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                <c.icon className="size-8 text-muted-foreground/60" />
              </div>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{c.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Tarifs — FCFA, deux poches, mobile money */}
      <section id="tarifs" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <Eyebrow>Tarifs</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Simple, transparent</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Payez en FCFA par mobile money. 1 crédit = 1 s d’image fixe en 480p. Un plan animé coûte 2× —
            il nous coûte 100× plus.
          </p>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {/* Essai */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-baseline gap-2 text-base">
                Essai <span className="text-xs font-normal text-muted-foreground">— découvrir</span>
              </CardTitle>
              <p className="text-2xl font-bold">0 FCFA</p>
              <p className="text-xs text-muted-foreground">120 crédits · 480p · filigrané</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> 1 min animée ou 2 min d’images</li>
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Toutes les voix</li>
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Idéal pour juger le résultat</li>
              </ul>
              <Link href="/sign-up" className={buttonVariants({ variant: 'outline' }) + ' w-full rounded-full'}>
                Commencer
              </Link>
            </CardContent>
          </Card>

          {/* Pro — mis en avant */}
          <Card className="relative border-primary/50 shadow-lg shadow-primary/10">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              Le plus populaire
            </span>
            <CardHeader>
              <CardTitle className="flex items-baseline gap-2 text-base">
                Starter <span className="text-xs font-normal text-muted-foreground">— créer</span>
              </CardTitle>
              <p className="text-2xl font-bold">
                15 000 FCFA
                <span className="text-xs font-normal text-muted-foreground"> / mois</span>
              </p>
              <p className="text-xs text-muted-foreground">2 640 crédits · 22 min animées ou 44 min d’images</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Toutes résolutions (720p inclus)</li>
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Sans filigrane</li>
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Sous-titres karaoké</li>
              </ul>
              <Link href="/sign-up" className={buttonVariants() + ' w-full rounded-full'}>
                Essai gratuit
              </Link>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-baseline gap-2 text-base">
                Pro <span className="text-xs font-normal text-muted-foreground">— produire</span>
              </CardTitle>
              <p className="text-2xl font-bold">
                30 000 FCFA
                <span className="text-xs font-normal text-muted-foreground"> / mois</span>
              </p>
              <p className="text-xs text-muted-foreground">5 400 crédits · 45 min animées ou 90 min d’images</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Recharge 5 000 F = 720 crédits</li>
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Deux poches : quota / achetés</li>
                <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Support prioritaire</li>
              </ul>
              <a href="mailto:contact@gentube.example" className={buttonVariants({ variant: 'outline' }) + ' w-full rounded-full'}>
                Nous contacter
              </a>
            </CardContent>
          </Card>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-muted-foreground">
          Recharge : 5 000 FCFA = 720 crédits (n’expire jamais). Plafond GeniusPay 500 kF/mois pour toute la
          plateforme.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Questions fréquentes</h2>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            ['Qu’est-ce que GenTube ?', 'Une IA qui transforme un sujet en vidéo montée et prête à publier sur YouTube. Pas un générateur d’images en vrac.'],
            ['Quelle langue ?', 'Interface en français, prompts visuels en anglais (les modèles sont entraînés en anglais), voix en français.'],
            ['Usage commercial ?', 'Oui. Vous possédez la vidéo. Le filigrane d’essai reste si la vidéo a été payée en essai.'],
            ['Délai de génération ?', 'Quelques minutes selon la longueur. La page Fabrication suit chaque étape.'],
            ['Compétences en montage ?', 'Aucune. Le montage est la partie que GenTube fait à votre place.'],
            ['Résiliation ?', 'À tout moment. La recharge non consommée n’expire jamais — le quota mensuel, si.'],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-medium">{q}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border bg-primary p-6 text-primary-foreground sm:flex-row">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <span className="flex size-7 items-center justify-center rounded-full bg-white text-primary">
                <Play className="size-3.5 fill-current" />
              </span>
              Prêt à créer votre première vidéo ?
            </h2>
            <p className="mt-1 text-xs text-primary-foreground/80">
              Tapez un sujet. Récupérez une vidéo montée. Publiez.
            </p>
          </div>
          <Link href="/sign-up" className={buttonVariants({ variant: 'secondary' }) + ' rounded-full'}>
            Créer gratuitement
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Play className="size-3 fill-current" />
                </span>
                GenTube
              </p>
              <p className="mt-2 text-xs text-muted-foreground">© 2026 GenTube. Tous droits réservés.</p>
            </div>
            <div>
              <p className="text-xs font-semibold">Produit</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li><a href="#fonctionnalites" className="hover:text-foreground">Fonctionnalités</a></li>
                <li><a href="#comment" className="hover:text-foreground">Comment ça marche</a></li>
                <li><a href="#tarifs" className="hover:text-foreground">Tarifs</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold">Entreprise</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">À propos</a></li>
                <li><a href="#" className="hover:text-foreground">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold">Suivez-nous</p>
              <div className="mt-2 flex gap-2 text-muted-foreground">
                <span className="flex size-7 items-center justify-center rounded-full border text-xs">𝕏</span>
                <span className="flex size-7 items-center justify-center rounded-full border text-xs">▶</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
