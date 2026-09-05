'use client';

import { useRef, useState, useTransition } from 'react';
import { FileVideo, ImageIcon, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClientAsset } from '@/lib/db/schema';
import { extraireLaBandeSon } from '@/lib/assets/audio';
import { transcribeAssetAction, uploadAssetAction } from '../actions';

/**
 * Le dépôt de fichiers du client.
 *
 * **Pourquoi ce composant mesure avant d'envoyer.** Le serveur a besoin des
 * dimensions d'une image et de la durée d'une vidéo pour cadrer le rendu, et
 * il ne peut pas les lire : décoder un JPEG demande `sharp`, lire un MP4
 * demande ffprobe, et ni l'un ni l'autre ne tient dans une fonction
 * serverless. Le navigateur, lui, les connaît déjà — une `<img>` a un
 * `naturalWidth`, une `<video>` a une `duration`.
 *
 * **Pourquoi un fichier à la fois.** Une présentation part de quinze captures,
 * et les envoyer d'un bloc ferait une requête de trente mégaoctets qui échoue
 * en entier si la douzième déplaît. Une par une, ce qui est passé est passé,
 * et la barre dit où on en est.
 *
 * **Et pourquoi il extrait aussi la bande son.** Une vidéo déposée se monte
 * avec des sous-titres calés au mot, ce qui demande de transcrire ce qui est
 * dit. Whisper prend de l'audio, pas un MP4 de cent mégaoctets — et sortir la
 * piste demande ffmpeg, absent d'une fonction serverless. Ce navigateur est le
 * seul endroit de la chaîne qui ait le fichier **et** un décodeur audio : il
 * envoie donc la piste en WAV mono 16 kHz juste après la vidéo.
 *
 * L'échec y est sans conséquence : la vidéo est déjà déposée, et un montage
 * sans transcript perd les sous-titres, pas le fichier.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

/** Le plafond du serveur, redit ici pour refuser avant de téléverser. */
const MAX_BYTES = 100 * 1024 * 1024;

type Mesures = { width?: number; height?: number; durationS?: number };

/**
 * Ce que le navigateur sait du fichier avant de l'envoyer.
 *
 * L'objet URL est révoqué dans tous les cas, y compris à l'échec : un fichier
 * illisible ne doit pas fuir une URL par dépôt raté. Un fichier que le
 * navigateur ne sait pas décoder ne bloque pas le dépôt — il part sans mesure,
 * et le serveur l'accepte avec des colonnes nulles.
 */
function mesurer(file: File): Promise<Mesures> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const fini = (mesures: Mesures) => {
      URL.revokeObjectURL(url);
      resolve(mesures);
    };

    if (file.type.startsWith('image/')) {
      const image = new Image();
      image.onload = () =>
        fini({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => fini({});
      image.src = url;
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      fini({
        width: video.videoWidth,
        height: video.videoHeight,
        durationS: Number.isFinite(video.duration) ? video.duration : undefined,
      });
    video.onerror = () => fini({});
    video.src = url;
  });
}

function poids(bytes: number): string {
  return bytes < 1e6
    ? `${Math.round(bytes / 1e3)} Ko`
    : `${(bytes / 1e6).toFixed(1)} Mo`;
}

export function AssetUploader({
  projectId,
  assets,
}: {
  projectId: number;
  assets: ClientAsset[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  /** L'étape en cours, quand elle dure : extraire une piste prend du temps. */
  const [step, setStep] = useState<string | null>(null);
  /**
   * Ce qui a manqué sans rien casser.
   *
   * Distinct de `error` exprès : une transcription ratée n'annule pas un
   * dépôt, et l'afficher en rouge ferait croire que le fichier est perdu.
   */
  const [note, setNote] = useState<string | null>(null);

  /**
   * Sort la bande son et l'envoie transcrire.
   *
   * **Rien ici ne peut faire échouer un dépôt.** La vidéo est déjà en R2 quand
   * on arrive : un conteneur indécodable, un refus du fournisseur ou un
   * navigateur sans `AudioContext` laissent simplement l'apport sans mots. Le
   * message le dit, et le reste de la file continue.
   */
  async function transcrire(assetId: number, file: File) {
    setStep('Extraction de la bande son…');
    const piste = await extraireLaBandeSon(file);
    if (!piste) {
      setStep(null);
      setNote(`${file.name} est déposé, mais sa piste n’a pas pu être lue.`);
      return;
    }

    setStep('Transcription…');
    const body = new FormData();
    body.set('projectId', String(projectId));
    body.set('assetId', String(assetId));
    body.set(
      'audio',
      new File([new Blob([piste.bytes as BlobPart])], 'piste.wav', {
        type: 'audio/wav',
      })
    );

    const state = await transcribeAssetAction({}, body);
    setStep(null);
    if (state && 'error' in state && state.error) {
      setNote(`${file.name} est déposé, mais non transcrit : ${state.error}`);
    }
  }

  async function envoyer(files: FileList) {
    setError(null);
    setNote(null);
    const liste = Array.from(files);
    setProgress({ done: 0, total: liste.length });

    for (const [index, file] of liste.entries()) {
      if (file.size > MAX_BYTES) {
        setError(
          `${file.name} pèse ${poids(file.size)} ; la limite est de ${MAX_BYTES / 1e6} Mo.`
        );
        break;
      }

      const mesures = await mesurer(file);
      const body = new FormData();
      body.set('projectId', String(projectId));
      body.set('file', file);
      if (mesures.width) body.set('width', String(mesures.width));
      if (mesures.height) body.set('height', String(mesures.height));
      if (mesures.durationS) body.set('durationS', String(mesures.durationS));

      // L'action rend soit `{ error }`, soit `{ success }` : on ne lit
      // l'erreur qu'après avoir vérifié qu'elle est là.
      const state = await uploadAssetAction({}, body);
      if (state && 'error' in state && state.error) {
        setError(state.error);
        break;
      }

      const assetId =
        state && 'assetId' in state ? (state.assetId as number) : null;
      if (assetId && file.type.startsWith('video/')) {
        await transcrire(assetId, file);
      }

      setProgress({ done: index + 1, total: liste.length });
    }

    setProgress(null);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files?.length) startTransition(() => void envoyer(files));
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {pending && step
            ? step
            : pending && progress
              ? `Envoi ${progress.done + 1}/${progress.total}…`
              : 'Ajouter des fichiers'}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Captures d’écran, photo de produit ou vidéo à habiller. JPEG, PNG,
          WebP, MP4, MOV ou WebM, {MAX_BYTES / 1e6} Mo au plus. Un plan servi
          par un de ces fichiers n’est pas facturé au générateur.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      {assets.length > 0 && (
        <ul className="divide-y rounded-md border">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              {asset.kind === 'video' ? (
                <FileVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">
                {asset.originalName ?? `Fichier ${asset.id}`}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {asset.width && asset.height
                  ? `${asset.width}×${asset.height} · `
                  : ''}
                {asset.durationS ? `${asset.durationS.toFixed(1)} s · ` : ''}
                {/*
                  Le nombre de mots plutôt qu'une coche : il dit d'un coup
                  d'œil si la piste a été comprise ou seulement entendue. Une
                  vidéo sans transcript se monte encore, sans sous-titres au
                  mot — c'est une information, pas une erreur.
                */}
                {asset.kind === 'video'
                  ? `${
                      Array.isArray(asset.words) && asset.words.length > 0
                        ? `${asset.words.length} mots`
                        : 'non transcrit'
                    } · `
                  : ''}
                {poids(asset.bytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
