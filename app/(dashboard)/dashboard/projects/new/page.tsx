import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser } from '@/lib/db/queries';
import { NewProjectForm } from '../project-form';

export default async function NewProjectPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/dashboard/projects"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Projects
      </Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium">New project</h1>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <NewProjectForm />
        </CardContent>
      </Card>
    </section>
  );
}
