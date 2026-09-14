import { ButtonLink } from '@/components/kit/button';

/* La page perdue : un timecode qui n'existe pas, et une sortie. */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-(--gutter)">
      <div className="w-full max-w-md text-center">
        <p className="t-data text-6xl font-bold text-ink-2">404</p>
        <h1 className="t-h2 mt-6">Cette page n’existe pas.</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          Le lien a peut-être changé, ou la vidéo que vous cherchiez a été supprimée.
          Vos projets, eux, sont toujours là.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/dashboard/projects">Voir mes projets</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Retour à l’accueil
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
