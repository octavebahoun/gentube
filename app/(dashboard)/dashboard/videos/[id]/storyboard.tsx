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
import { Loader2, Trash2, Play, Pause, FastForward, Rewind, Sparkles, Film, Mic, Music, Layers, Wand2, Sliders } from 'lucide-react';

import { GxButton } from '@/components/gx/gx-button';
import { GxCard, GxCardTitle, GxPerfCard } from '@/components/gx/gx-card';
import { GxBadge } from '@/components/gx/gx-badge-empty';
import { StudioTimelineTrack, AIAction } from '@/components/gx/gx-studio-ui';
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
import { type ActionState } from '@/components/storyboard/utils';

export function StoryboardEditor({
  video,
  shots,
  creditsEstimated,
  balance,
  canAfford,
  durationsMeasured,
  assets,
}: {
  video: Video;
  shots: Shot[];
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

  const montable =
    (video.status === 'validated' ||
      video.status === 'generating' ||
      video.status === 'rendered' ||
      video.status === 'failed') &&
    shots.length > 0 &&
    shots.every((shot) => Boolean(shot.audioUrl)) &&
    shots.every((shot) => Boolean(shot.assetUrl) || shot.status === 'ready');

  const [items, setItems] = useState(shots);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [activeShotId, setActiveShotId] = useState<number | string>(shots[0]?.id ?? '');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setItems(shots);
    if (shots.length > 0 && !activeShotId) {
      setActiveShotId(shots[0].id);
    }
  }, [shots]);

  const activeShot = items.find((s) => s.id === activeShotId) || items[0];

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
    <div className="space-y-6">
      {/* Top Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#292D35] bg-[#111419] p-4 text-[#F5F5F5]">
        <div className="flex items-center gap-3">
          <GxBadge tone={video.status === 'rendered' ? 'success' : 'orange'} live>
            {video.status.toUpperCase()}
          </GxBadge>
          <span className="font-display font-bold text-base">{video.title || 'Vidéo GenTube'}</span>
        </div>

        {/* Video Player Controls */}
        <div className="flex items-center gap-2 rounded-lg border border-[#292D35] bg-[#050608] px-3 py-1.5">
          <button className="text-[#A5A7AD] hover:text-[#FF3B30] transition" title="Reculer" aria-label="Reculer">
            <Rewind className="size-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? "Mettre en pause" : "Lire"}
            className="flex size-8 items-center justify-center rounded-full bg-[#FF3B30] text-white font-bold hover:bg-[#D0021B] hover:scale-105 transition"
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
          </button>
          <button className="text-[#A5A7AD] hover:text-[#FF3B30] transition" title="Avancer" aria-label="Avancer">
            <FastForward className="size-4" />
          </button>
          <span className="font-mono text-xs text-[#A5A7AD] ml-2">
            {spokenSeconds > 0 ? `00:00 / 00:${String(Math.round(spokenSeconds)).padStart(2, '0')}` : '00:00 / 00:00'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {editable && items.length === 0 && <GenerateButton videoId={video.id} hasShots={false} />}
          {montable && <RenderForm videoId={video.id} dejaRendu={video.status === 'rendered'} />}
        </div>
      </div>

      {/* Main Studio Viewport (Video Monitor + AI Inspector) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Center Monitor Viewport */}
        <GxPerfCard title="Monitor Studio" timecode={`${items.length} Scènes · Full HD`}>
          <div className="flex flex-col items-center justify-center min-h-[300px] bg-[#050608] rounded-xl border border-[#292D35] p-4">
            {activeShot?.assetUrl ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-[#292D35] bg-[#111419]">
                <img src={activeShot.assetUrl} alt="Visualisation scène" className="size-full object-cover" />
                <div className="absolute bottom-2 inset-x-2 bg-[#050608]/80 backdrop-blur-md p-2 rounded text-center text-xs text-[#F5F5F5] font-semibold">
                  "{activeShot.narration || activeShot.prompt}"
                </div>
              </div>
            ) : (
              <div className="text-center p-8 space-y-3">
                <Film className="size-10 text-[#FF3B30] mx-auto opacity-80" />
                <p className="text-sm text-[#A5A7AD]">
                  {activeShot ? `Scène #${activeShot.order} : ${activeShot.narration || activeShot.prompt}` : 'Aucun aperçu disponible. Génère ou sélectionne une scène.'}
                </p>
              </div>
            )}
          </div>
        </GxPerfCard>

        {/* Right AI Assistant & Controls Panel */}
        <div className="space-y-4">
          <AIAction
            label="AI Scene Generator"
            description="Génère ou modifie la scène active avec l'assistant IA."
          />

          <GxCard className="space-y-4">
            <PriceStrip
              credits={creditsEstimated}
              durationsMeasured={durationsMeasured}
              spokenSeconds={spokenSeconds}
              sceneCount={items.length}
              quality={video.quality}
            />

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
            {reorderError && <p className="text-xs text-[#FF4D5A] font-semibold">{reorderError}</p>}
          </GxCard>
        </div>
      </div>

      {/* Multi-Track Studio Timeline */}
      <GxCard className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#292D35] pb-2">
          <p className="t-label text-xs text-[#FF3B30]">Studio Timeline & Tracks</p>
          <span className="font-mono text-xs text-[#A5A7AD]">3 Tracks Active</span>
        </div>

        <StudioTimelineTrack
          label="Piste Vidéo"
          icon={<Film className="size-4" />}
          timecode={`${spokenSeconds.toFixed(1)}s`}
          clips={items.map((shot, idx) => ({
            id: shot.id,
            title: `Scène ${idx + 1}`,
            duration: `${shot.durationS}s`,
            type: shot.type,
          }))}
          activeClipId={activeShotId}
          onSelectClip={(id) => setActiveShotId(id)}
        />

        <StudioTimelineTrack
          label="Piste Voix Off"
          icon={<Mic className="size-4" />}
          timecode={`${spokenSeconds.toFixed(1)}s`}
          clips={items.map((shot, idx) => ({
            id: `voice-${shot.id}`,
            title: `Voix ${idx + 1}`,
            duration: `${shot.durationS}s`,
            type: 'audio',
          }))}
        />

        <StudioTimelineTrack
          label="Sous-titres"
          icon={<Layers className="size-4" />}
          timecode={`${spokenSeconds.toFixed(1)}s`}
          clips={items.map((shot, idx) => ({
            id: `caption-${shot.id}`,
            title: `Karaoké ${idx + 1}`,
            duration: `${shot.durationS}s`,
            type: 'caption',
          }))}
        />
      </GxCard>

      {/* Storyboard Shots List Editor */}
      {items.length === 0 ? (
        <GxCard className="py-12 text-center text-[#A5A7AD]">
          Aucune scène générée. Clique sur "Générer le storyboard" avec l'IA pour démarrer.
        </GxCard>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-4">
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
        <GxCard>
          <GxCardTitle className="mb-4">Ajouter une scène manuelle</GxCardTitle>
          <AddShotForm videoId={video.id} />
        </GxCard>
      )}
    </div>
  );
}

export function DeleteVideoButton({ videoId, projectId }: { videoId: number; projectId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(deleteVideoAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="projectId" value={projectId} />
      <GxButton type="submit" variant="ghost" size="sm" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Suppression…
          </>
        ) : (
          <>
            <Trash2 className="size-3.5 text-[#FF4D5A]" />
            Supprimer ce brouillon
          </>
        )}
      </GxButton>
      {state?.error && <p className="text-xs text-[#FF4D5A]">{state.error}</p>}
    </form>
  );
}
