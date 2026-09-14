'use client';

import { useActionState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FileVideo,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Video as VideoIcon,
} from 'lucide-react';

import { Button } from '@/components/kit/button';
import { Card } from '@/components/kit/card';
import { Select, Textarea } from '@/components/kit/field';
import { Notice } from '@/components/kit/page';
import { cn } from '@/lib/utils';
import { creditsForShot } from '@/lib/credits/pricing';
import type { ClientAsset, Shot, Video } from '@/lib/db/schema';
import { shotFormAction } from '@/app/(dashboard)/dashboard/videos/actions';
import { type ActionState, frenchCredits, seconds } from './utils';

/**
 * La provenance d'une durée distingue un devis d'un prix : en pointillés
 * tant que c'est lu dans le texte, plein dès que ça vient de l'audio.
 */
function DurationBadge({ shot }: { shot: Shot }) {
  const measured = shot.durationSource === 'measured';
  return (
    <span
      className={cn(
        't-data inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
        measured ? 'border-ok/40 bg-ok/10 text-ok' : 'border-dashed border-line text-ink-3'
      )}
    >
      {seconds(shot.durationS)} · {measured ? 'mesurée' : 'estimée'}
    </span>
  );
}

/** Coût de la scène, calculé sur la source unique de vérité des prix. */
function ShotCredits({ shot, video }: { shot: Shot; video: Video }) {
  const credits = creditsForShot(shot.durationS, shot.type, video.quality);
  return (
    <span className="t-data inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-ink-2">
      {frenchCredits(credits)} crédits
    </span>
  );
}

function TypeChoice({
  defaultValue,
  idPrefix,
  disabled,
}: {
  defaultValue: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex gap-2">
      <legend className="sr-only">Type de plan</legend>
      {[
        { value: 'image', label: 'Image fixe', Icon: ImageIcon },
        { value: 'video', label: 'Plan animé', Icon: VideoIcon },
      ].map(({ value, label, Icon }) => (
        <label
          key={value}
          className={cn(
            'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs text-ink-2',
            'transition-colors duration-(--t-fast) hover:border-line-strong',
            'has-checked:border-ink-3 has-checked:bg-surface-2 has-checked:text-ink',
            disabled && 'cursor-not-allowed opacity-45'
          )}
        >
          <input
            type="radio"
            name="type"
            value={value}
            defaultChecked={defaultValue === value}
            className="size-3.5 accent-ink"
          />
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * L'aperçu de la scène, quand il existe.
 *
 * Les clés R2 ne sont pas des URLs : sans route de signature, aucun visuel
 * n'est affichable. La page signe donc les aperçus et les passe ici — le cadre
 * reste pointillé tant que la scène n'a rien.
 *
 * **Il dit aussi d'où vient le visuel.** « Fichier du client » sur un fichier
 * que la personne a elle-même déposé : c'est exactement la distinction qui
 * décide s'il sera facturé — un plan servi par un apport ne repasse chez aucun
 * fournisseur.
 */
function VisualFrame({
  shot,
  apercu,
  anime,
}: {
  shot: Shot;
  apercu?: string | null;
  anime?: boolean;
}) {
  const depose = Boolean(shot.sourceAssetId);

  if (apercu) {
    return (
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-control border border-line-strong bg-surface-2 lg:w-44">
        {anime ? (
          <video
            src={`${apercu}#t=0.1`}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
            aria-label={`Aperçu de la scène ${shot.order}`}
          />
        ) : (
          <img
            src={apercu}
            alt={`Aperçu de la scène ${shot.order}`}
            loading="lazy"
            className="size-full object-cover"
          />
        )}
        {depose && (
          <span className="absolute bottom-1 left-1 rounded-full bg-canvas/85 px-1.5 py-0.5 text-[0.625rem] text-ink">
            Fichier du client
          </span>
        )}
      </div>
    );
  }

  const Icone = depose && shot.type === 'video' ? FileVideo : ImageIcon;
  return (
    <div className="flex aspect-video w-full shrink-0 items-center justify-center gap-2 rounded-control border border-dashed border-line lg:w-44">
      <Icone className="size-4 text-ink-3" aria-hidden="true" />
      <span className="text-xs text-ink-3">Pas encore de visuel</span>
    </div>
  );
}

/**
 * Le choix du fichier déposé qui sert ce plan.
 *
 * **C'est le geste qui définit trois des quatre cas d'usage** — des captures
 * d'écran à commenter, une photo de produit à animer, une vidéo tournée à
 * habiller. Lier, c'est écrire dans `sourceImageUrl` et `assetUrl`, les deux
 * colonnes que les étapes payantes regardent avant de générer : après ça, le
 * plan ne repasse chez aucun fournisseur.
 *
 * **Il poste dans le formulaire de la carte, avec son propre `intent`.** HTML
 * interdit les formulaires imbriqués, et la carte en a déjà un ; c'est la même
 * grammaire que « Enregistrer » et « Supprimer ». `bind` ne lit que
 * `assetId` : lier ne doit pas enregistrer au passage un prompt en cours
 * d'écriture.
 */
function AssetPicker({
  shot,
  assets,
  disabled,
}: {
  shot: Shot;
  assets: ClientAsset[];
  disabled?: boolean;
}) {
  const lie = assets.find((asset) => asset.id === shot.sourceAssetId);

  return (
    <div className="space-y-2 rounded-control border border-dashed border-line p-3">
      <label htmlFor={`asset-${shot.id}`} className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <Paperclip className="size-3.5" aria-hidden="true" />
        Servir cette scène avec un fichier déposé
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id={`asset-${shot.id}`}
          name="assetId"
          defaultValue={shot.sourceAssetId ? String(shot.sourceAssetId) : ''}
          disabled={disabled}
          className="min-w-0 flex-1"
        >
          <option value="">Aucun — générer le visuel</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.kind === 'video' ? '[Vidéo] ' : '[Image] '}
              {asset.originalName ?? `Fichier ${asset.id}`}
              {asset.durationS ? ` · ${asset.durationS.toFixed(1)} s` : ''}
            </option>
          ))}
        </Select>
        <Button type="submit" name="intent" value="bind" variant="secondary" size="sm" disabled={disabled}>
          Attacher
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-ink-3">
        {lie
          ? `Servie par « ${lie.originalName ?? `Fichier ${lie.id}`} » : ` +
            'aucun visuel ne sera généré pour cette scène.'
          : 'Une vidéo remplace la scène entière, avec sa bande son. Une image ' +
            'devient la scène, ou sert de départ au plan animé.'}
      </p>
    </div>
  );
}

/**
 * Une scène, un formulaire. Enregistrer et supprimer postent ici et se
 * distinguent par l'`intent` du bouton — HTML interdit les formulaires
 * imbriqués. La durée s'affiche, elle ne se saisit jamais.
 */
export function SortableShotCard({
  shot,
  index,
  editable,
  video,
  assets = [],
  apercu,
  apercuAnime,
}: {
  shot: Shot;
  index: number;
  editable: boolean;
  video: Video;
  /** Les fichiers déposés sur le projet. Vide hors brouillon. */
  assets?: ClientAsset[];
  /** L'aperçu signé de la scène, s'il existe. Voir lib/storage/lecture. */
  apercu?: string | null;
  /** Si cet aperçu est un clip : un `.mp4` dans un `<img>` n'affiche rien. */
  apercuAnime?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(shotFormAction, {});
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shot.id,
    disabled: !editable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : undefined}
    >
      <Card className="p-4 sm:p-5">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="videoId" value={shot.videoId} />
          <input type="hidden" name="shotId" value={shot.id} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {editable ? (
                <button
                  type="button"
                  className="cursor-grab touch-none rounded-control p-1.5 text-ink-3 outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:cursor-grabbing"
                  aria-label={`Déplacer la scène ${index + 1}`}
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical className="size-4" aria-hidden="true" />
                </button>
              ) : null}
              <span className="t-data text-sm font-bold text-ink-2">
                #{String(index + 1).padStart(2, '0')}
              </span>
              <TypeChoice defaultValue={shot.type} idPrefix={`shot-${shot.id}`} disabled={!editable} />
              <DurationBadge shot={shot} />
              <ShotCredits shot={shot} video={video} />
            </div>

            {editable && (
              <Button
                type="submit"
                name="intent"
                value="delete"
                variant="ghost"
                size="sm"
                disabled={isPending}
                aria-label={`Supprimer la scène ${index + 1}`}
              >
                <Trash2 className="size-4 text-bad" aria-hidden="true" />
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <VisualFrame shot={shot} apercu={apercu} anime={apercuAnime} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <label htmlFor={`narration-${shot.id}`} className="text-sm font-medium text-ink">
                  Narration
                </label>
                <Textarea
                  id={`narration-${shot.id}`}
                  name="narration"
                  defaultValue={shot.narration ?? ''}
                  maxLength={2000}
                  disabled={!editable}
                  className="min-h-20"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`prompt-${shot.id}`} className="text-sm font-medium text-ink">
                  Prompt visuel
                </label>
                <Textarea
                  id={`prompt-${shot.id}`}
                  name="prompt"
                  defaultValue={shot.prompt}
                  maxLength={1000}
                  disabled={!editable}
                  className="min-h-20"
                />
              </div>
              {/*
                Caché quand rien n'a été déposé : un sélecteur vide n'aurait
                rien à dire, et il occuperait la place sur le chemin normal
                d'une vidéo entièrement générée.
              */}
              {editable && assets.length > 0 && (
                <AssetPicker shot={shot} assets={assets} disabled={isPending} />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {editable && (
              <Button type="submit" name="intent" value="save" variant="secondary" size="sm" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Enregistrement…
                  </>
                ) : (
                  'Enregistrer la scène'
                )}
              </Button>
            )}
            {state?.error && <Notice tone="erreur">{state.error}</Notice>}
            {state?.success && <Notice tone="ok">{state.success}</Notice>}
          </div>
        </form>
      </Card>
    </li>
  );
}
