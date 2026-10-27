import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, ClipboardCheck, Lock } from "lucide-react";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { chargerFiche, droitSurFiche, gerantsPossibles, isoDuJour, jourDepuisIso, partenairesPossibles } from "@/lib/rh/presences";
import { FicheInteractive } from "./fiche-interactive";
import { ReglagesFiche } from "./reglages-fiche";

export const dynamic = "force-dynamic";

function Message({ icone, texte }: { icone?: boolean; texte: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {icone ? <Lock className="size-8 text-muted-foreground" aria-hidden /> : null}
      <p className="max-w-md text-muted-foreground">{texte}</p>
    </div>
  );
}

/** Fiche de présence journalière : l'Administrateur et le gérant désigné font l'appel ; les autres Managers et les Employés n'y ont pas accès. */
export default async function PagePresences({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const [e] = await db.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
  if (!e || !disponible(e, "RH")) return <Message icone texte="Les Ressources Humaines sont disponibles à partir du forfait Business." />;

  const droit = await droitSurFiche(utilisateurConnecte);
  if (!droit) {
    const gerant = e.gerantPresencesId ? (await gerantsPossibles(e.id)).find((g) => g.id === e.gerantPresencesId) : null;
    return <Message icone texte={gerant ? `La fiche de présence est tenue par ${gerant.nom}. Demandez à l'Administrateur si vous devez en prendre la charge.` : "La fiche de présence est tenue par l'Administrateur et par le gérant qu'il désigne."} />;
  }

  const aujourdhui = isoDuJour(new Date());
  const dateIso = date && jourDepuisIso(date) ? date : aujourdhui;
  const fiche = await chargerFiche(utilisateurConnecte, dateIso);
  if (!fiche) return <Message icone texte="Fiche introuvable." />;

  const admin = droit === "ADMIN";
  const reglages = admin ? { candidats: await gerantsPossibles(e.id), groupe: await partenairesPossibles(e.id) } : null;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Ressources humaines
      </Link>
      <div className="flex items-center gap-2.5">
        <ClipboardCheck className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Fiche de présence</h1>
      </div>

      {reglages ? <ReglagesFiche gerantId={e.gerantPresencesId} candidats={reglages.candidats} groupe={reglages.groupe.groupe} partageActif={reglages.groupe.partageActif} partenaires={reglages.groupe.autres} /> : null}

      <FicheInteractive
        fiche={{
          date: fiche.date,
          droit: fiche.droit,
          gerantNom: fiche.gerant?.nom ?? null,
          valideePar: fiche.validee?.parNom ?? null,
          valideeLe: fiche.validee ? fiche.validee.le.toISOString() : null,
          modifiable: fiche.modifiable,
          sections: fiche.sections,
        }}
      />
    </div>
  );
}
