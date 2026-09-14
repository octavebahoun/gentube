'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Youtube, Loader2, Link as LinkIcon, Unlink } from 'lucide-react';
import { Button, ButtonLink } from '@/components/kit/button';
import { Notice } from '@/components/kit/page';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type YoutubeStatus = {
  connected: boolean;
  channel?: {
    id: string;
    title: string;
    thumbnailUrl?: string;
  };
};

export function YoutubeConnection() {
  const { data, error, mutate } = useSWR<YoutubeStatus>('/api/youtube/status', fetcher);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    
    try {
      const res = await fetch('/api/youtube/disconnect', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Échec de la déconnexion');
      }
      await mutate();
    } catch (err) {
      setDisconnectError('Impossible de déconnecter YouTube. Réessayez.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (error) {
    return (
      <Notice tone="erreur">
        Impossible de vérifier l'état de la connexion YouTube.
      </Notice>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Loader2 className="pulse-wait size-4 text-ink-3" aria-hidden="true" />
        Vérification…
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          Connectez votre chaîne YouTube pour publier vos vidéos directement.
        </p>
        <ButtonLink href="/api/youtube/authorize" variant="secondary">
          <Youtube className="size-4" aria-hidden="true" />
          Connecter YouTube
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-4">
        {data.channel?.thumbnailUrl && (
          <img
            src={data.channel.thumbnailUrl}
            alt=""
            className="size-10 rounded-full border border-line"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Youtube className="size-4 text-ink-2" aria-hidden="true" />
            <span className="text-sm font-semibold text-ink">
              {data.channel?.title || 'Chaîne connectée'}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-2">
            Chaîne YouTube connectée
          </p>
        </div>
        <LinkIcon className="size-4 text-ok" aria-hidden="true" />
      </div>

      {disconnectError && <Notice tone="erreur">{disconnectError}</Notice>}

      <Button
        variant="secondary"
        onClick={handleDisconnect}
        disabled={isDisconnecting}
      >
        {isDisconnecting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Déconnexion…
          </>
        ) : (
          <>
            <Unlink className="size-4" aria-hidden="true" />
            Déconnecter YouTube
          </>
        )}
      </Button>
    </div>
  );
}
