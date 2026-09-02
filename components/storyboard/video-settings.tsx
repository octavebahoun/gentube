'use client';

import { useActionState, useState } from 'react';
import { Loader2, Music, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

const CHAMP =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
  resolution,
  ratio,
  subtitleStyle,
  musicUrl,
  musics,
}: {
  videoId: number;
  resolution: string;
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
        <div className="space-y-1.5">
          <Label htmlFor="resolution">Résolution</Label>
          <select
            id="resolution"
            name="resolution"
            defaultValue={resolution}
            className={CHAMP}
          >
            <option value="480p">480p — 1 crédit la seconde</option>
            <option value="720p">720p — 3 crédits la seconde</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Le 720p coûte trois fois plus. C’est l’argent du client, il choisit.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ratio">Cadrage</Label>
          <select id="ratio" name="ratio" defaultValue={ratio} className={CHAMP}>
            <option value="16:9">Paysage 16:9</option>
            <option value="9:16">Vertical 9:16</option>
          </select>
          <p className="text-xs text-muted-foreground">
            En vertical, les sous-titres remontent pour passer au-dessus de
            l’interface de TikTok, Reels et Shorts.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subtitleStyle">Sous-titres</Label>
          <select
            id="subtitleStyle"
            name="subtitleStyle"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            className={CHAMP}
          >
            {Object.entries(SOUS_TITRES).map(([value, sous]) => (
              <option key={value} value={value}>
                {sous.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {SOUS_TITRES[style]?.aide}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="musicUrl" className="flex items-center gap-1.5">
          <Music className="h-3.5 w-3.5" />
          Musique de fond
        </Label>
        <select
          id="musicUrl"
          name="musicUrl"
          defaultValue={musicUrl ?? ''}
          className={CHAMP}
        >
          <option value="">Aucune</option>
          {musics.map((music) => (
            <option key={music.key} value={music.key}>
              {music.name}
              {music.mood ? ` — ${music.mood}` : ''}
            </option>
          ))}
        </select>
        {musics.length === 0 && (
          <p className="text-xs text-amber-400">
            Le catalogue est vide. Importez-le avec{' '}
            <code>pnpm tsx lib/sounds/import-catalog.ts</code>.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              <Settings2 />
              Enregistrer les réglages
            </>
          )}
        </Button>
        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
        {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      </div>
    </form>
  );
}
