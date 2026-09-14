'use client';

import { useActionState, useState } from 'react';
import { Loader2, Music, Settings2 } from 'lucide-react';

import { Button } from '@/components/kit/button';
import { Field, Select } from '@/components/kit/field';
import { Notice } from '@/components/kit/page';
import { videoSettingsAction } from '@/app/(dashboard)/dashboard/videos/actions';
import { type ActionState } from './utils';

/**
 * Les réglages de rendu d'une vidéo.
 *
 * Trois colonnes existaient depuis l'origine — résolution, style de
 * sous-titres, musique — et aucune n'était réglable ailleurs que dans le code.
 * Une promesse tenue par la base et démentie par l'interface.
 *
 * Des `select` natifs plutôt que des composants : ils traversent le `FormData`
 * d'une action serveur sans champ caché ni état client, et c'est tout ce qu'un
 * formulaire de réglages demande.
 */

export type MusicChoice = { key: string; name: string; mood: string | null };

/**
 * L'explication vit sous le champ, pas dans l'option.
 *
 * Une option de `select` ne s'élargit pas à son contenu : « Karaoké — chaque
 * mot s'allume à son tour » sortait tronqué dans une colonne de moitié de
 * carte. Le nom seul tient partout, et l'aide s'affiche en dessous.
 */
const SOUS_TITRES: Record<string, { label: string; aide: string }> = {
  karaoke: { label: 'Karaoké', aide: 'chaque mot s’allume à son tour' },
  fondant: { label: 'Fondant', aide: 'les mots montent et se révèlent' },
  cinematic: { label: 'Cinéma', aide: 'la phrase entière, sans emphase' },
  highlight: { label: 'Surligné', aide: 'un bandeau balaie le mot actif — le style des shorts' },
  pill: { label: 'Pastilles', aide: 'chaque mot dans sa capsule sombre' },
  wipe: { label: 'Balayage', aide: 'le mot se découvre de gauche à droite' },
  neon: { label: 'Néon', aide: 'lueur froide, accent chaud sur les mots forts' },
  gradient: { label: 'Dégradé', aide: 'le texte découpé dans un dégradé' },
  blend: { label: 'Inversé', aide: 'le texte s’inverse sur ce qu’il couvre, sans voile' },
};

export function VideoSettings({
  videoId,
  quality,
  ratio,
  subtitleStyle,
  musicUrl,
  musics,
}: {
  videoId: number;
  quality: string;
  ratio: string;
  subtitleStyle: string;
  musicUrl: string | null;
  musics: MusicChoice[];
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    videoSettingsAction,
    {}
  );
  const [style, setStyle] = useState(subtitleStyle);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="videoId" value={videoId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Qualité"
          htmlFor="quality"
          hint="Les deux sont en 1080p. Le Cinéma coûte trois fois et demie plus cher : c’est l’argent du client, il choisit."
        >
          <Select id="quality" name="quality" defaultValue={quality}>
            <option value="draft">Full HD — 2 crédits la seconde</option>
            <option value="standard">Cinéma — 7 crédits la seconde</option>
          </Select>
        </Field>

        <Field
          label="Cadrage"
          htmlFor="ratio"
          hint="En vertical, les sous-titres remontent pour passer au-dessus de l’interface de TikTok, Reels et Shorts."
        >
          <Select id="ratio" name="ratio" defaultValue={ratio}>
            <option value="16:9">Paysage 16:9</option>
            <option value="9:16">Vertical 9:16</option>
          </Select>
        </Field>

        <Field label="Sous-titres" htmlFor="subtitleStyle" hint={SOUS_TITRES[style]?.aide}>
          <Select
            id="subtitleStyle"
            name="subtitleStyle"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            {Object.entries(SOUS_TITRES).map(([value, sous]) => (
              <option key={value} value={value}>
                {sous.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Musique de fond"
        htmlFor="musicUrl"
        hint={musics.length === 0 ? undefined : 'Le catalogue est partagé par tous les projets.'}
      >
        <Select id="musicUrl" name="musicUrl" defaultValue={musicUrl ?? ''}>
          <option value="">Aucune</option>
          {musics.map((music) => (
            <option key={music.key} value={music.key}>
              {music.name}
              {music.mood ? ` — ${music.mood}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {musics.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Music className="size-3.5" aria-hidden="true" />
          Le catalogue est vide. Importez-le avec{' '}
          <code className="font-mono">pnpm tsx lib/sounds/import-catalog.ts</code>.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Enregistrement…
            </>
          ) : (
            <>
              <Settings2 className="size-4" aria-hidden="true" />
              Enregistrer les réglages
            </>
          )}
        </Button>
        {state?.error && <Notice tone="erreur">{state.error}</Notice>}
        {state?.success && <Notice tone="ok">{state.success}</Notice>}
      </div>
    </form>
  );
}
