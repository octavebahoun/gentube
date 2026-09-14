import { Page, PageHeader, Section } from '@/components/kit/page';

/* Le squelette garde la place exacte du contenu : pas de saut de mise en page. */
export default function ActivityPageSkeleton() {
  return (
    <Page className="max-w-3xl">
      <PageHeader eyebrow="Compte" titre="Activité récente" />
      <Section titre="Dernières actions">
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="pulse-wait flex items-center gap-4 rounded-control border border-line bg-surface-2 p-3"
            >
              <span className="size-10 shrink-0 rounded-control bg-line" />
              <span className="h-4 w-40 rounded bg-line" />
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}
