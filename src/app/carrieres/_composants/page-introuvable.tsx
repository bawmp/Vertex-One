import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { FondAnime } from "./fond-anime";

export function PageIntrouvable({ message, lien }: { message: string; lien?: { href: string; libelle: string } }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden p-6 text-center">
      <FondAnime />
      <div className="carrieres-monter flex max-w-md flex-col items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CompassIcon className="size-8" aria-hidden />
        </span>
        <p className="text-lg text-stone-600">{message}</p>
        {lien ? (
          <Link href={lien.href} className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:shadow-lg">
            {lien.libelle}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
