import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { GxPage, GxPageHeader, GxFil, GxSection } from '@/components/gx/gx-page';
import { NewProjectForm } from '../project-form';

export default async function NewProjectPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  return (
    <GxPage className="max-w-3xl">
      <GxFil parent="Projets" parentHref="/dashboard/projects" courant="Nouveau projet" />
      <GxPageHeader
        eyebrow="Projet"
        titre="Nouveau projet"
        intro="Un projet tient un style et une voix. Chaque vidéo lancée depuis ici les reprendra."
      />
      <GxSection titre="Configuration">
        <NewProjectForm />
      </GxSection>
    </GxPage>
  );
}
