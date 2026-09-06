import { GxPage, GxPageHeader, GxSection } from '@/components/gx/gx-page';

/* Le squelette garde la place exacte du contenu : pas de saut de mise en page. */
export default function ActivityPageSkeleton() {
  return (
    <GxPage className="max-w-3xl">
      <GxPageHeader eyebrow="Compte" titre="Activité récente" />
      <GxSection titre="Dernières actions">
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="scan flex items-center gap-4 rounded-lg bg-ink-2 p-3">
              <span className="size-10 shrink-0 rounded-lg bg-ink-3" />
              <span className="h-4 w-40 rounded-lg bg-ink-3" />
            </div>
          ))}
        </div>
      </GxSection>
    </GxPage>
  );
}
