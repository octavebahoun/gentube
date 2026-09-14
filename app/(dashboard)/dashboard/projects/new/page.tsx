import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { Page, PageHeader, Breadcrumb, Section } from '@/components/kit/page';
import { NewProjectForm } from '../project-form';

export default async function NewProjectPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  return (
    <Page className="max-w-3xl">
      <Breadcrumb parent="Projets" parentHref="/dashboard/projects" courant="Nouveau projet" />
      <PageHeader
        eyebrow="Projet"
        titre="Nouveau projet"
        intro="Un projet tient un style et une voix. Chaque vidéo lancée depuis ici les reprendra."
      />
      <Section titre="Configuration">
        <NewProjectForm />
      </Section>
    </Page>
  );
}
