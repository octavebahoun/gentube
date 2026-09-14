'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Film, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/kit/button';
import { Card, CardTitle } from '@/components/kit/card';
import { EtatBadge } from '@/components/kit/etat';
import { Notice } from '@/components/kit/page';
import { cn } from '@/lib/utils';
import type { ClientAsset, Shot, Video } from '@/lib/db/schema';
import { deleteVideoAction, reorderShotsAction } from '../actions';
import { PriceStrip } from '@/components/storyboard/price-strip';
import { SortableShotCard } from '@/components/storyboard/shot-card';
import {
  AddShotForm,
  ApportForm,
  GenerateButton,
  NovitaForm,
  RenderForm,
  ValidateForm,
  VisualsForm,
  VoiceoverForm,
} from '@/components/storyboard/storyboard-forms';
import { type ActionState, seconds } from '@/components/storyboard/utils';

export function StoryboardEditor({
  video,
  shots,
  apercus,
  apercusAnimes,
  creditsEstimated,
  balance,
  canAfford,
  durationsMeasured,
  assets,
}: {
  video: Video;
  shots: Shot[];
  /** Aperçu signé de chaque plan, par identifiant. Voir lib/storage/lecture. */
  apercus: Record<number, string | null>;
  /** Si cet aperçu est un clip : un `.mp4` dans un `<img>` n'affiche rien. */
  apercusAnimes: Record<number, boolean>;
  creditsEstimated: number;
  balance: number;
  canAfford: boolean;
  durationsMeasured: boolean;
  assets: ClientAsset[];
}) {
  const editable = video.status === 'draft';
  const videosApportees = assets
    .filter((asset) => asset.kind === 'video')
    .map((asset) => ({
      id: asset.id,
      label: asset.originalName ?? `Fichier ${asset.id}`,
      words: Array.isArray(asset.words) ? asset.words.length : 0,
    }));
  const spokenSeconds = shots.reduce((t, s) => t + s.durationS, 0);

  const producible = video.status === 'validated' || video.status === 'generating';
  const hasAnimated = shots.some((shot) => shot.type === 'video');

  // Les mêmes statuts que `RENDERABLE` dans lib/render/service : proposer le
  // bouton sur un statut que le moteur refuse ne donne qu'une erreur 409.
  // `rendered` en fait partie : une vidéo livrée ne se remonte pas.
  const montable =
    (video.status === 'generating' ||
      video.status === 'rendering' ||
      video.status === 'failed') &&
    shots.length > 0 &&
    shots.every((shot) => Boolean(shot.audioUrl)) &&
    shots.every((shot) => Boolean(shot.assetUrl) || shot.status === 'ready');

  const [items, setItems] = useState(shots);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [activeShotId, setActiveShotId] = useState<number | string>(shots[0]?.id ?? '');

  useEffect(() => {
    setItems(shots);
    if (shots.length > 0 && !activeShotId) {
      setActiveShotId(shots[0].id);
    }
  }, [shots]);

  const activeShot = items.find((s) => s.id === activeShotId) || items[0];
  const apercuActif = activeShot ? apercus[activeShot.id] : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setReorderError(null);
    try {
      const formData = new FormData();
      formData.set('videoId', String(video.id));
      formData.set('orderedIds', JSON.stringify(next.map((s) => s.id)));
      const result = await reorderShotsAction({}, formData);
      if (result && 'error' in result && result.error) {
        setItems(previous);
        setReorderError(result.error);
      }
    } catch {
      setItems(previous);
      setReorderError("L'ordre n'a pas pu être enregistré. Réessayez.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Barre d'état : où en est la fabrication, et l'étape suivante. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <EtatBadge status={video.status} />
          <span className="t-data text-xs text-ink-3">
            {items.length} scène{items.length !== 1 ? 's' : ''} · {seconds(spokenSeconds)} de narration
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && items.length === 0 && <GenerateButton videoId={video.id} hasShots={false} />}
          {montable && (
            <RenderForm
              videoId={video.id}
              dejaRendu={video.status === 'failed'}
              enCours={video.status === 'rendering'}
            />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Moniteur + pellicule */}
        <div className="min-w-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-card border border-line bg-canvas">
            {apercuActif ? (
              apercusAnimes[activeShot!.id] ? (
                <video
                  key={apercuActif}
                  src={apercuActif}
                  className="size-full object-cover"
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={apercuActif}
                  alt={`Aperçu de la scène ${activeShot!.order}`}
                  className="size-full object-cover"
                />
              )
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Film className="size-6 text-ink-3" aria-hidden="true" />
                <p className="max-w-md text-sm text-ink-2">
                  {activeShot
                    ? `Scène ${activeShot.order} : ${activeShot.narration || activeShot.prompt}`
                    : 'Aucune scène pour l’instant. Écrivez le storyboard ou ajoutez une scène à la main.'}
                </p>
              </div>
            )}
            {apercuActif && !apercusAnimes[activeShot!.id] && (
              <p className="absolute inset-x-0 bottom-0 bg-canvas/85 px-3 py-2 text-xs text-ink">
                {activeShot.narration || activeShot.prompt}
              </p>
            )}
          </div>

          {items.length > 0 && (
            <ul className="no-bar mt-3 flex gap-2 overflow-x-auto pb-1">
              {items.map((shot, index) => {
                const active = shot.id === activeShotId;
                return (
                  <li key={shot.id}>
                    <button
                      type="button"
                      onClick={() => setActiveShotId(shot.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-control border px-3 text-xs',
                        'transition-colors duration-(--t-fast)',
                        active
                          ? 'border-ink-3 bg-surface-2 text-ink'
                          : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                      )}
                    >
                      <span className="t-data font-bold">#{String(index + 1).padStart(2, '0')}</span>
                      <span className="t-data">{shot.durationS}s</span>
                      <span className="text-ink-3">{shot.type === 'video' ? 'animé' : 'fixe'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Panneau d'étapes */}
        <Card className="h-fit p-4">
          <PriceStrip
            credits={creditsEstimated}
            durationsMeasured={durationsMeasured}
            spokenSeconds={spokenSeconds}
            sceneCount={items.length}
            quality={video.quality}
          />

          <div className="mt-4 space-y-4 border-t border-line pt-4">
            {editable && items.length > 0 && <GenerateButton videoId={video.id} hasShots={true} />}
            {editable && videosApportees.length > 0 && (
              <ApportForm videoId={video.id} videos={videosApportees} hasShots={items.length > 0} />
            )}
            {editable &&
              items.length > 0 &&
              (durationsMeasured ? (
                <ValidateForm
                  videoId={video.id}
                  creditsEstimated={creditsEstimated}
                  balance={balance}
                  canAfford={canAfford}
                />
              ) : (
                <VoiceoverForm videoId={video.id} />
              ))}
            {producible && <VisualsForm videoId={video.id} hasAnimated={hasAnimated} />}
            {producible && hasAnimated && (
              <NovitaForm
                videoId={video.id}
                plans={shots.filter((shot) => shot.type === 'video' && !shot.assetUrl).length}
              />
            )}
            {reorderError && <Notice tone="erreur">{reorderError}</Notice>}
          </div>
        </Card>
      </div>

      {/* Les scènes, éditables une par une */}
      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-3">
              {items.map((shot, index) => (
                <SortableShotCard
                  key={shot.id}
                  shot={shot}
                  index={index}
                  editable={editable}
                  video={video}
                  assets={assets}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {editable && (
        <Card className="p-4 sm:p-5">
          <CardTitle className="mb-4">Ajouter une scène manuelle</CardTitle>
          <AddShotForm videoId={video.id} />
        </Card>
      )}
    </div>
  );
}

export function DeleteVideoButton({ videoId, projectId }: { videoId: number; projectId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(deleteVideoAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="danger" size="sm" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Suppression…
          </>
        ) : (
          <>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Supprimer ce brouillon
          </>
        )}
      </Button>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
    </form>
  );
}
