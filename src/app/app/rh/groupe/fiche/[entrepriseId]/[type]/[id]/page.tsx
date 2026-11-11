import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, CalendarRange, ClipboardList, IdCard, Lock } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { CarteFiche } from "@/components/fiche/fiche-ui";
import { lireFicheOuverte, peutModifierFichesOuvertes, peutVoirFichesOuvertes } from "@/lib/rh/fiches-ouvertes";
import { adressePhoto } from "@/lib/rh/photo-affichage";
import { LIBELLE_ROLE } from "@/lib/rh/fiche-affichage";
import { getT } from "@/lib/i18n/langue";
import { FormulaireFicheOuverte } from "../../../formulaire-fiche-ouverte";

export const dynamic = "force-dynamic";

/**
 * Fiche d'un collaborateur ou d'un stagiaire d'une AUTRE entreprise du groupe, ouverte par son Administrateur. Consultation et modification des
 * informations de la liste fermée ; jamais le salaire, les primes, les bulletins ni les fichiers RH. `lireFicheOuverte` revérifie l'autorisation
 * en base : une adresse devinée ou une autorisation retirée donne « introuvable ».
 */
export default async function PageFicheOuverte({ params }: { params: Promise<{ entrepriseId: string; type: string; id: string }> }) {
  const t = await getT();
  const { entrepriseId, type, id } = await params;
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peutVoirFichesOuvertes(u)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Cette page est réservée à l'Administrateur et aux Managers.")}</p>
      </div>
    );
  }
  const cible = type === "stagiaire" ? "STAGIAIRE" : type === "utilisateur" ? "UTILISATEUR" : null;
  if (!cible) notFound();
  const fiche = await lireFicheOuverte(u, entrepriseId, cible, id);
  if (!fiche) notFound();

  const peutModifier = peutModifierFichesOuvertes(u);
  const jourFr = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(d);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/rh/groupe" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <AvatarCollaborateur nom={fiche.nom} adresse={fiche.photoCle ? adressePhoto("utilisateur", fiche.id, fiche.photoCle) : null} taille="carte" version={fiche.photoCle ?? ""} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="info">
              <Building2 className="size-3" aria-hidden />
              {t("Fiche de {nom}", { nom: fiche.entrepriseNom })}
            </Badge>
            {fiche.role ? <Badge variant="brand">{t(LIBELLE_ROLE[fiche.role] ?? fiche.role)}</Badge> : <Badge variant="neutral">{t("Stagiaire")}</Badge>}
            {fiche.departement ? <span>{fiche.departement}</span> : null}
          </p>
        </div>
      </div>

      <CarteFiche icone={IdCard} titre={t("Informations")} aide={t("Modifiables : liste fermée. Jamais le salaire ni la rémunération.")} ton="bleu">
        <FormulaireFicheOuverte type={cible} entrepriseId={entrepriseId} id={id} valeurs={fiche.valeurs} peutModifier={peutModifier} />
        <p className="text-xs text-muted-foreground">
          {fiche.dateEmbauche ? t("Arrivée : {date}", { date: jourFr(fiche.dateEmbauche) }) : null}
          {fiche.dateDebut && fiche.dateFin ? t("Stage : du {debut} au {fin}", { debut: jourFr(fiche.dateDebut), fin: jourFr(fiche.dateFin) }) : null}
          {fiche.soldeConges != null ? ` · ${t("Solde de congés : {n} jour(s)", { n: fiche.soldeConges })}` : null}
        </p>
      </CarteFiche>

      {cible === "UTILISATEUR" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CarteFiche icone={CalendarRange} titre={t("Congés")} aide={t("Dates et statut seulement")} ton="neutre">
            {fiche.conges.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Aucune demande de congé.")}</p>
            ) : (
              <Card className="p-0">
                <div className="flex flex-col divide-y divide-border">
                  {fiche.conges.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span>
                        {jourFr(c.dateDebut)} → {jourFr(c.dateFin)} · {c.nombreJours} {t("jour(s)")}
                      </span>
                      <Badge variant={c.statut === "APPROUVEE" ? "success" : c.statut === "REFUSEE" ? "danger" : "warning"}>{c.statut}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </CarteFiche>
          <CarteFiche icone={ClipboardList} titre={t("Évaluations")} aide={t("Lecture seule")} ton="neutre">
            {fiche.evaluations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Aucune évaluation.")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {fiche.evaluations.map((e) => (
                  <div key={e.id} className="rounded-lg border px-3 py-2 text-sm">
                    <p className="font-medium">{e.periode}</p>
                    {e.commentaire ? <p className="text-muted-foreground">{e.commentaire}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      {e.evaluateurNom} — {jourFr(e.creeLe)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CarteFiche>
        </div>
      ) : null}
    </div>
  );
}
