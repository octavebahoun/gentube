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
import { Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Shot, Video } from '@/lib/db/schema';
import { deleteVideoAction, reorderShotsAction } from '../actions';
import { PriceStrip } from '@/components/storyboard/price-strip';
import { SortableShotCard } from '@/components/storyboard/shot-card';
import {
  AddShotForm,
  GenerateButton,
  ValidateForm,
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
}: {
  video: Video;
  shots: Shot[];
  creditsEstimated: number;
  balance: number;
  canAfford: boolean;
  durationsMeasured: boolean;
}) {
  const editable = video.status === 'draft';
  const spokenSeconds = shots.reduce((t, s) => t + s.durationS, 0);

  const [items, setItems] = useState(shots);
  const [reorderError, setReorderError] = useState<string | null>(null);
  useEffect(() => setItems(shots), [shots]);

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
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Storyboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PriceStrip
            credits={creditsEstimated}
            durationsMeasured={durationsMeasured}
            spokenSeconds={spokenSeconds}
            sceneCount={items.length}
            resolution={video.resolution}
          />
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
          {!editable && (
            <p className="text-sm text-muted-foreground">
              Cette vidéo est {video.status} — {video.creditsConsumed} crédits ont été débités. Le
              storyboard est en lecture seule à partir d&apos;ici.
            </p>
          )}
          {reorderError && <p className="text-sm text-red-500">{reorderError}</p>}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucune scène. Faites écrire un premier jet, puis reprenez à la main ce que vous voulez.
          </CardContent>
        </Card>
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
                <SortableShotCard key={shot.id} shot={shot} index={index} editable={editable} video={video} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une scène</CardTitle>
          </CardHeader>
          <CardContent>
            <AddShotForm videoId={video.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Suppression d'un brouillon. Refusée par le serveur dès que quelque chose a été facturé. */
export function DeleteVideoButton({ videoId, projectId }: { videoId: number; projectId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(deleteVideoAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            Suppression…
          </>
        ) : (
          <>
            <Trash2 />
            Supprimer ce brouillon
          </>
        )}
      </Button>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
