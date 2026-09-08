import * as React from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Play, Volume2, Wand2, RefreshCw } from 'lucide-react';
import { GxButton } from './gx-button';

export function AIAction({
  label,
  description,
  onClick,
  loading = false,
  className,
}: {
  label: string;
  description?: string;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-[#A855F7]/30 bg-[#A855F7]/5 p-4 glow-purple-subtle', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#A855F7]/20 text-[#A855F7]">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h4 className="font-display text-sm font-bold text-[#F5F5F5]">{label}</h4>
            {description && <p className="text-xs text-[#A5A7AD]">{description}</p>}
          </div>
        </div>
        <GxButton variant="ai" size="sm" onClick={onClick} disabled={loading}>
          {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
          Générer
        </GxButton>
      </div>
    </div>
  );
}

export function StudioTimelineTrack({
  label,
  icon,
  timecode,
  clips,
  activeClipId,
  onSelectClip,
}: {
  label: string;
  icon: React.ReactNode;
  timecode: string;
  clips: Array<{ id: string | number; title: string; duration: string; type?: 'video' | 'image' | 'audio' | 'caption' }>;
  activeClipId?: string | number;
  onSelectClip?: (id: string | number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#292D35] bg-[#111419] p-2.5">
      <div className="flex w-36 shrink-0 items-center gap-2 border-r border-[#292D35] pr-3 text-xs font-mono text-[#A5A7AD]">
        <span className="text-[#FF7A18]">{icon}</span>
        <span className="truncate font-semibold">{label}</span>
      </div>
      <div className="relative flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
        {clips.map((clip) => {
          const isActive = clip.id === activeClipId;
          return (
            <button
              key={clip.id}
              onClick={() => onSelectClip?.(clip.id)}
              className={cn(
                'group relative flex h-10 shrink-0 cursor-pointer items-center justify-between rounded-md border px-3 text-xs transition-all',
                isActive
                  ? 'border-[#FF7A18] bg-[#FF7A18]/20 text-[#F5F5F5] glow-orange-subtle'
                  : 'border-[#292D35] bg-[#171A20] text-[#A5A7AD] hover:border-[#3D434F] hover:text-[#F5F5F5]'
              )}
              style={{ minWidth: '120px' }}
            >
              <span className="truncate font-medium">{clip.title}</span>
              <span className="ml-2 font-mono text-[10px] opacity-70">{clip.duration}</span>
            </button>
          );
        })}
      </div>
      <div className="shrink-0 font-mono text-xs text-[#A5A7AD] px-2">{timecode}</div>
    </div>
  );
}
