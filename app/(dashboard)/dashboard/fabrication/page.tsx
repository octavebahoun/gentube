import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { getUser } from '@/lib/db/queries';
import { tenantDb, eq } from '@/lib/db/tenant-db';
import { shots, videos } from '@/lib/db/schema';
import { listVideos } from '@/lib/videos';

type EtapeEtat = 'faite' | 'encours' | 'attente' | 'echec' | 'indispo';
type Etape = {
  cle: string;
  titre: string;
  detail: string;
  etat: EtapeEtat;
};

function buildEtapes(
  video: (typeof videos)['$inferSelect'],
  shotList: (typeof shots)['$inferSelect'][]
): Etape[] {
  const total = shotList.length;
  const avecAudio = shotList.filter((s) => s.audioUrl).length;
  const avecImage = shotList.filter((s) => s.sourceImageUrl).length;
  const videoShots = shotList.filter((s) => s.type === 'video');
  const avecClip = videoShots.filter((s) => s.assetUrl).length;
  const echecShot = shotList.some((s) => s.status === 'failed');

  // 1 — Storyboard
  const storyboard: Etape = {
    cle: 'storyboard',
    titre: 'Storyboard',
    detail:
      total === 0
        ? 'Aucune scène — générez le storyboard depuis la vidéo'
        : `${total} scène${total > 1 ? 's' : ''} · ${video.resolution}`,
    etat: total > 0 ? 'faite' : video.status === 'failed' ? 'echec' : 'attente',
  };

  // 2 — Voix off
  let voixEtat: EtapeEtat = 'attente';
  let voixDetail = 'En attente du storyboard';
  if (total > 0) {
    if (avecAudio === total && avecAudio > 0) {
      voixEtat = 'faite';
      voixDetail = 'Voix enregistrée — durée mesurée';
    } else if (avecAudio > 0) {
      voixEtat = 'encours';
      voixDetail = `${avecAudio}/${total} scènes enregistrées`;
    } else if (video.status === 'failed') {
      voixEtat = 'echec';
      voixDetail = 'Échec de la voix off — relance possible';
    } else {
      voixDetail = 'Prêt à enregistrer';
    }
  }
  const voix: Etape = { cle: 'voix', titre: 'Voix off', detail: voixDetail, etat: voixEtat };

  // 3 — Images (Flux)
  let imagesEtat: EtapeEtat = 'attente';
  let imagesDetail = 'En attente de la voix off';
  if (total > 0 && avecAudio === total) {
    if (avecImage === total) {
      imagesEtat = 'faite';
      imagesDetail = `${avecImage}/${total} images générées`;
    } else if (avecImage > 0) {
      imagesEtat = echecShot ? 'echec' : 'encours';
      imagesDetail = `${avecImage}/${total} images — ${echecShot ? 'certaines ont échoué' : 'en cours'}`;
    } else if (video.status === 'failed') {
      imagesEtat = 'echec';
      imagesDetail = 'Échec des images';
    } else {
      imagesDetail = 'Prêtes à générer après la voix';
    }
  } else if (total > 0) {
    imagesDetail = 'La voix off doit être enregistrée d’abord';
  }
  const images: Etape = { cle: 'images', titre: 'Images', detail: imagesDetail, etat: imagesEtat };

  // 4 — Plans animés (Wan) — pas encore branché
  const clips: Etape = {
    cle: 'clips',
    titre: 'Plans animés',
    detail:
      videoShots.length === 0
        ? 'Aucun plan animé dans ce storyboard'
        : `${avecClip}/${videoShots.length} clips — bientôt disponible (Wan)`,
    etat: videoShots.length === 0 ? 'indispo' : 'indispo',
  };

  // 5 — Montage (HyperFrames) — local OK, Lambda en prod à venir
  let montageEtat: EtapeEtat = 'indispo';
  let montageDetail = 'Bientôt : montage HyperFrames';
  if (video.outputUrl) {
    montageEtat = 'faite';
    montageDetail = 'Vidéo montée — prête';
  } else if (video.status === 'rendering') {
    montageEtat = 'encours';
    montageDetail = 'Montage en cours';
  } else if (video.status === 'failed') {
    montageEtat = 'echec';
    montageDetail = 'Échec du montage';
  }
  const montage: Etape = { cle: 'montage', titre: 'Montage', detail: montageDetail, etat: montageEtat };

  // 6 — Publication (YouTube)
  let publiEtat: EtapeEtat = 'indispo';
  let publiDetail = 'Bientôt : publication YouTube';
  if (video.youtubeVideoId) {
    publiEtat = 'faite';
    publiDetail = 'Publiée sur YouTube';
  } else if (video.status === 'published') {
    publiEtat = 'faite';
    publiDetail = 'Publiée';
  }
  const publi: Etape = { cle: 'publication', titre: 'Publication', detail: publiDetail, etat: publiEtat };

  return [storyboard, voix, images, clips, montage, publi];
}

function EtatIcon({ etat }: { etat: EtapeEtat }) {
  if (etat === 'faite') return <CheckCircle2 className="size-5 text-green-500" />;
  if (etat === 'encours') return <Loader2 className="size-5 animate-spin text-primary" />;
  if (etat === 'echec') return <AlertTriangle className="size-5 text-destructive" />;
  if (etat === 'indispo') return <Ban className="size-5 text-muted-foreground/50" />;
  return <CircleDashed className="size-5 text-muted-foreground" />;
}

const EtapeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  storyboard: FileText,
  voix: Mic,
  images: ImageIcon,
  clips: Film,
  montage: Clapperboard,
  publication: Upload,
};

export default async function FabricationPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const tdb = tenantDb(user.tenantId);
  const tenant = await tdb.getTenant();
  const allVideos = await listVideos(tdb);

  // tri : les plus récents d'abord ; les vidéos en cours en tête si besoin
  const sorted = [...allVideos].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  if (sorted.length === 0) {
    return (
      <section className="flex flex-1 flex-col p-4 lg:p-8">
        <div className="mb-8">
          <p className="text-xs font-medium tracking-widest text-brand-accent uppercase">
            Fabrication
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Production en direct</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Suivez vos vidéos pendant leur fabrication — ce qui avance, ce qui a
            échoué, et ce que vous pouvez relancer. Cet écran sera votre point
            de passage chaque matin.
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center py-16">
          <Empty className="max-w-md border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleDashed />
              </EmptyMedia>
              <EmptyTitle>Aucune fabrication</EmptyTitle>
              <EmptyDescription>
                Cette page s&apos;animera dès que vous lancerez une vidéo. Les
                fournisseurs échouent régulièrement : vous y verrez tout de suite
                quoi relancer.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/dashboard/projects" className={buttonVariants()}>
                Créer une vidéo
              </Link>
              <p className="text-xs text-muted-foreground">
                3 étapes sur 6 fonctionnent aujourd&apos;hui — storyboard, voix
                off et images. Plans animés, montage et publication arrivent.
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </section>
    );
  }

  // enrichir chaque vidéo de ses scènes
  const enriched = await Promise.all(
    sorted.map(async (video) => {
      const shotList = await tdb.findMany(shots, eq(shots.videoId, video.id));
      // tri par order en JS (ordre métier)
      shotList.sort((a, b) => a.order - b.order);
      const etapes = buildEtapes(video, shotList);
      const faites = etapes.filter((e) => e.etat === 'faite').length;
      const progression = Math.round((faites / etapes.length) * 100);
      return { video, shotList, etapes, progression };
    })
  );

  const enCours = enriched.filter(
    (e) =>
      e.video.status === 'generating' ||
      e.video.status === 'rendering' ||
      e.video.status === 'validated'
  );
  const fileAttente = enriched.filter((e) => e.video.status === 'validated' || e.video.status === 'draft').slice(0, 6);

  return (
    <section className="flex flex-1 flex-col gap-8 p-4 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-brand-accent uppercase">
            Fabrication
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Production en direct</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {enCours.length > 0
              ? `${enCours.length} vidéo${enCours.length > 1 ? 's' : ''} en fabrication · file gérée par n8n bientôt`
              : 'Aucune vidéo en fabrication en ce moment'}
            {' · '}
            <span className="tabular-nums">{tenant?.creditsBalance ?? 0} crédits</span>
          </p>
        </div>
        <Link href="/dashboard/projects" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Nouvelle vidéo
        </Link>
      </div>

      {enCours.length === 0 && fileAttente.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Aucune fabrication active — les vidéos validées apparaîtront ici
              dès que la file de jobs sera branchée. En attendant, la
              progression se lit scène par scène dans chaque vidéo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {enriched.slice(0, 12).map(({ video, shotList, etapes, progression }) => {
            const aEchoué = etapes.some((e) => e.etat === 'echec');
            return (
              <Card key={video.id} className={aEchoué ? 'border-destructive/40' : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        <Link href={`/dashboard/videos/${video.id}`} className="hover:text-primary hover:underline">
                          {video.title}
                        </Link>
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {video.resolution} · {video.ratio} · {shotList.length} scène
                        {shotList.length !== 1 ? 's' : ''} ·{' '}
                        <span className="capitalize">{video.status}</span>
                        {video.creditsConsumed > 0 && ` · ${video.creditsConsumed} crédits débités`}
                      </p>
                    </div>
                    <Badge variant={aEchoué ? 'destructive' : video.status === 'draft' ? 'secondary' : 'outline'} className="capitalize">
                      {video.status}
                    </Badge>
                  </div>
                  <Progress value={progression} className="mt-4">
                    <ProgressTrack>
                      <ProgressIndicator style={{ width: `${progression}%` }} />
                    </ProgressTrack>
                  </Progress>
                  <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{progression}% · 3/6 étapes actives</span>
                    <span>{new Date(video.updatedAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-4">
                    {etapes.map((etape) => {
                      const Icon = EtapeIcon[etape.cle] ?? FileText;
                      return (
                        <li key={etape.cle} className="flex gap-3">
                          <span className="mt-0.5 shrink-0">
                            <EtatIcon etat={etape.etat} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                              <span
                                className={
                                  etape.etat === 'attente' || etape.etat === 'indispo'
                                    ? 'text-sm font-medium text-muted-foreground'
                                    : 'text-sm font-medium'
                                }
                              >
                                {etape.titre}
                              </span>
                              {etape.etat === 'encours' && <Badge variant="secondary" className="text-[10px]">En cours</Badge>}
                              {etape.etat === 'echec' && <Badge variant="destructive" className="text-[10px]">Échoué</Badge>}
                              {etape.etat === 'indispo' && (
                                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  Bientôt
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{etape.detail}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {aEchoué && (
                    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                      <p className="text-xs text-destructive">
                        Une étape a échoué. Ouvrez la vidéo pour voir l&apos;erreur exacte et relancer —
                        les fournisseurs échouent régulièrement, la reprise est prévue.
                      </p>
                      <Link href={`/dashboard/videos/${video.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' mt-2'}>
                        Voir la vidéo
                      </Link>
                    </div>
                  )}
                  {etapes.every((e) => e.etat === 'indispo' || e.etat === 'attente') && video.status === 'draft' && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Brouillon — éditez le storyboard et validez-le pour lancer la fabrication.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {enriched.length > 12 && (
            <p className="text-center text-sm text-muted-foreground">
              + {enriched.length - 12} vidéo{enriched.length - 12 > 1 ? 's' : ''} plus ancienne
              {enriched.length - 12 > 1 ? 's' : ''} — filtrez dans la bibliothèque.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-6 lg:border-l lg:pl-8">
          <div>
            <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              File d&apos;attente
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sans file de jobs, il n&apos;y a pas de reprise après échec ni
              d&apos;orchestration n8n — chaque étape est un appel manuel. Cette
              colonne s&apos;animera quand la file sera branchée.
            </p>
            {fileAttente.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                {fileAttente.map(({ video }) => (
                  <Card key={video.id} className="border-dashed">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium">{video.title}</CardTitle>
                      <p className="text-xs capitalize text-muted-foreground">{video.status} · {video.resolution}</p>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="mt-4 border-dashed">
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">File vide</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-amber-400">3 étapes sur 6 actives</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Storyboard, voix off et images fonctionnent. Plans animés (Wan),
              montage (HyperFrames) et publication YouTube sont en cours
              d&apos;implémentation — les cartes ci-dessus restent honnêtes sur
              ce qui est à venir.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Cette fabrication
            </h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Vidéos totales</dt>
                <dd className="tabular-nums font-medium">{enriched.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">En échec</dt>
                <dd className="tabular-nums font-medium">
                  {enriched.filter((e) => e.etapes.some((s) => s.etat === 'echec')).length}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Crédits (solde)</dt>
                <dd className="tabular-nums font-medium">{tenant?.creditsBalance ?? 0}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}
