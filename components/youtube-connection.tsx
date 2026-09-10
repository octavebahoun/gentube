'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Youtube, Loader2, Link as LinkIcon, Unlink } from 'lucide-react';
import { GxButton } from '@/components/gx/gx-button';
import { GxNotice } from '@/components/gx/gx-page';

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

  const handleConnect = () => {
    window.location.href = '/api/youtube/authorize';
  };

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
      <GxNotice tone="erreur">
        Impossible de vérifier l'état de la connexion YouTube.
      </GxNotice>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#A5A7AD]">
        <Loader2 className="size-4 animate-spin" />
        Vérification…
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#A5A7AD]">
          Connectez votre chaîne YouTube pour publier vos vidéos directement.
        </p>
        <GxButton onClick={handleConnect}>
          <Youtube className="size-4" aria-hidden="true" />
          Connecter YouTube
        </GxButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-[#292D35] bg-[#111419] p-4">
        {data.channel?.thumbnailUrl && (
          <img
            src={data.channel.thumbnailUrl}
            alt=""
            className="size-10 rounded-full"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Youtube className="size-4 text-[#FF7A18]" aria-hidden="true" />
            <span className="font-display text-sm font-semibold text-[#F5F5F5]">
              {data.channel?.title || 'Chaîne connectée'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#A5A7AD]">
            Chaîne YouTube connectée
          </p>
        </div>
        <LinkIcon className="size-4 text-[#4ADE80]" aria-hidden="true" />
      </div>

      {disconnectError && <GxNotice tone="erreur">{disconnectError}</GxNotice>}

      <GxButton
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
      </GxButton>
    </div>
  );
}
