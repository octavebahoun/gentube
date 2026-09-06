import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FolderKanban, PlusCircle } from 'lucide-react';
import { GxButton } from '@/components/gx/gx-button';
import { GxBadge, GxEmpty } from '@/components/gx/gx-badge-empty';
import { GxTabLinks } from '@/components/gx/gx-tabs';
import { GxPage, GxPageHeader } from '@/components/gx/gx-page';
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
    <GxPage className="max-w-6xl">
      <GxPageHeader
        eyebrow="Projets"
        titre="Vos projets"
        intro="Un projet tient un style, une voix, une chaîne. Chaque vidéo part de là."
        action={
          <GxButton href="/dashboard/projects/new" size="sm">
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouveau projet
          </GxButton>
        }
      />

      <GxTabLinks
        className="mb-6"
        active={actif}
        tabs={ONGLETS.map((o) => ({
          href: o.value === 'tous' ? '/dashboard/projects?onglet=tous' : `/dashboard/projects?onglet=${o.value}`,
          label: o.label,
          count: filtres[o.value].length,
        }))}
      />

      {projects.length === 0 ? (
        <div className="plate">
          <GxEmpty
            icon={<FolderKanban aria-hidden="true" />}
            title="Aucun projet pour l'instant"
            hint="Créez votre premier projet : un style, une voix, et vous pouvez lancer une vidéo dans la foulée."
            action={<GxButton href="/dashboard/projects/new">Créer mon premier projet</GxButton>}
          />
        </div>
      ) : visibles.length === 0 ? (
        <div className="plate">
          <GxEmpty
            icon={<FolderKanban aria-hidden="true" />}
            title={actif === 'vides' ? 'Aucun projet vide' : 'Aucun projet avec vidéos'}
            hint={
              actif === 'vides'
                ? 'Tous vos projets ont déjà au moins une vidéo.'
                : 'Lancez une vidéo depuis un projet pour le voir apparaître ici.'
            }
            action={
              <GxButton href="/dashboard/projects?onglet=tous" variant="secondary">
                Voir tous les projets
              </GxButton>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3">
          {visibles.map((project) => (
            <li key={project.id}>
              <Link
                href={`/dashboard/projects/${project.id}`}
                aria-label={`Ouvrir le projet ${project.name}`}
                className="group plate relative flex flex-col gap-3 overflow-hidden p-5 transition-[border-color,transform] duration-(--t-fast) hover:-translate-y-0.5 hover:border-line-hi sm:flex-row sm:items-center sm:justify-between"
              >
                <span
                  aria-hidden="true"
                  className="mire absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 transition-transform duration-(--t-fast) group-hover:scale-y-100"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-bold">{project.name}</p>
                  <p className="mt-1 truncate text-sm text-paper-3">
                    {project.stylePrompt ?? 'Aucun style défini pour l’instant.'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <GxBadge tone="bleu" dot={false}>
                    {PIPELINE_LABEL[project.defaultPipeline]}
                  </GxBadge>
                  <span className="t-data text-xs text-paper-3">
                    {project.videoCount} vidéo{project.videoCount !== 1 ? 's' : ''}
                  </span>
                  <span className="t-data hidden text-xs text-paper-3 sm:inline">
                    {jour(project.updatedAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GxPage>
  );
}
