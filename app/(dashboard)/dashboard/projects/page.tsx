import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FolderKanban, PlusCircle } from 'lucide-react';
import { Button, ButtonLink } from '@/components/kit/button';
import { Badge, Empty } from '@/components/kit/badge';
import { TabLinks } from '@/components/kit/tabs';
import { Page, PageHeader } from '@/components/kit/page';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { listProjects } from '@/lib/projects';

const PIPELINE_LABEL: Record<string, string> = {
  image: 'Images fixes',
  video: 'Animé',
  mixed: 'Mixte',
};

/* Les onglets sont des URL : on peut les partager, y revenir, faire retour. */
const ONGLETS = [
  { value: 'tous', label: 'Tous' },
  { value: 'avec-videos', label: 'Avec vidéos' },
  { value: 'vides', label: 'Sans vidéo' },
] as const;

type Onglet = (typeof ONGLETS)[number]['value'];

function jour(date: Date) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const { onglet } = await searchParams;
  const actif: Onglet = ONGLETS.some((o) => o.value === onglet) ? (onglet as Onglet) : 'tous';

  const projects = await listProjects(tenantDb(user.tenantId));

  const filtres: Record<Onglet, typeof projects> = {
    tous: projects,
    'avec-videos': projects.filter((p) => p.videoCount > 0),
    vides: projects.filter((p) => p.videoCount === 0),
  };
  const visibles = filtres[actif];

  return (
    <Page>
      <PageHeader
        eyebrow="Projets"
        titre="Vos projets"
        intro="Un projet tient un style, une voix, une chaîne. Chaque vidéo part de là."
        action={
          <ButtonLink href="/dashboard/projects/new" size="sm">
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouveau projet
          </ButtonLink>
        }
      />

      <TabLinks
        className="mb-5"
        active={actif}
        tabs={ONGLETS.map((o) => ({
          href: `/dashboard/projects?onglet=${o.value}`,
          label: o.label,
          count: filtres[o.value].length,
        }))}
      />

      {projects.length === 0 ? (
        <Empty
          icon={<FolderKanban aria-hidden="true" />}
          title="Aucun projet pour l’instant"
          hint="Créez votre premier projet : un style, une voix, et vous pouvez lancer une vidéo dans la foulée."
          action={<ButtonLink href="/dashboard/projects/new">Créer mon premier projet</ButtonLink>}
        />
      ) : visibles.length === 0 ? (
        <Empty
          icon={<FolderKanban aria-hidden="true" />}
          title={actif === 'vides' ? 'Aucun projet vide' : 'Aucun projet avec vidéos'}
          hint={
            actif === 'vides'
              ? 'Tous vos projets ont déjà au moins une vidéo.'
              : 'Lancez une vidéo depuis un projet pour le voir apparaître ici.'
          }
          action={
            <ButtonLink href="/dashboard/projects?onglet=tous" variant="secondary">
              Voir tous les projets
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-2.5">
          {visibles.map((project) => (
            <li key={project.id}>
              <Link
                href={`/dashboard/projects/${project.id}`}
                aria-label={`Ouvrir le projet ${project.name}`}
                className="flex min-h-11 flex-col gap-3 rounded-card border border-line bg-surface p-4 transition-colors duration-(--t-fast) hover:border-line-strong sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{project.name}</p>
                  <p className="mt-1 truncate text-sm text-ink-2">
                    {project.stylePrompt ?? 'Aucun style défini pour l’instant.'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <Badge tone="neutral" dot={false}>
                    {PIPELINE_LABEL[project.defaultPipeline]}
                  </Badge>
                  <span className="t-data text-xs text-ink-3">
                    {project.videoCount} vidéo{project.videoCount !== 1 ? 's' : ''}
                  </span>
                  <span className="t-data hidden text-xs text-ink-3 sm:inline">
                    {jour(project.updatedAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
