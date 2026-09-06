import Link from 'next/link';

/* La page perdue : un timecode qui n'existe pas, et une sortie. */
export default function NotFound() {
  return (
    <main className="grain relative flex min-h-[100dvh] items-center justify-center bg-ink px-6">
      <div className="w-full max-w-md text-center">
        <div aria-hidden="true" className="mire mx-auto h-[3px] w-32" />
        <p className="t-data mt-8 text-6xl font-bold text-marque">404</p>
        <h1 className="t-h2 mt-6">Cette page n’existe pas.</h1>
        <p className="mt-4 text-sm leading-relaxed text-paper-3">
          Le lien a peut-être changé, ou la vidéo que vous cherchiez a été supprimée.
          Vos projets, eux, sont toujours là.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard/projects"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-pill bg-jaune px-6 font-display text-sm font-bold text-ink transition-transform duration-(--t-fast) hover:-translate-y-0.5"
          >
            Voir mes projets
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-pill border border-line-hi px-6 font-display text-sm font-semibold text-paper transition-colors duration-(--t-fast) hover:border-cyan"
          >
            Retour à l’accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
