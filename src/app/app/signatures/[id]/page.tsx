import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { FileSignature, ShieldCheck, Clock, Globe, Monitor } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, demandeSignature } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { construireCertificatAudit } from "@/lib/signature/certificat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: "En attente", variante: "warning" },
  SIGNE: { libelle: "Signé", variante: "success" },
  REFUSE: { libelle: "Refusé", variante: "neutral" },
  EXPIRE: { libelle: "Expiré", variante: "neutral" },
};

export default async function PageCertificatSignature({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "SIGNATURE", "VOIR")) notFound();

  const certificat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "SIGNATURE_ELECTRONIQUE")) return null;

    const [ligne] = await tx.select({ creeParId: demandeSignature.creeParId }).from(demandeSignature).where(eq(demandeSignature.id, id));
    if (!ligne) return null;

    const ids = await idsVisibles(tx, utilisateurConnecte, "SIGNATURE");
    if (ids !== "TOUT" && !ids.includes(ligne.creeParId)) return null;

    return construireCertificatAudit(tx, id);
  });

  if (!certificat) notFound();

  const info = LIBELLE_STATUT[certificat.statut] ?? { libelle: certificat.statut, variante: "neutral" as const };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileSignature className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{certificat.nomDocument}</h1>
        </div>
        <Badge variant={info.variante}>{info.libelle}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Certificat d&apos;audit</CardTitle>
          <CardDescription>
            Demandé par {certificat.creeParNom} le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(certificat.creeLe)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
            <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Empreinte du document (SHA-256)</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{certificat.empreinteDocument}</p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {certificat.signataires.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {s.nom} — {s.telephone}
                    {s.email ? ` — ${s.email}` : ""}
                  </p>
                  <Badge variant={(LIBELLE_STATUT[s.statut] ?? { variante: "neutral" as const }).variante}>
                    {LIBELLE_STATUT[s.statut]?.libelle ?? s.statut}
                  </Badge>
                </div>
                {s.statut === "SIGNE" ? (
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3" aria-hidden />
                      Signé le {s.signeLe ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(s.signeLe) : "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Globe className="size-3" aria-hidden />
                      Adresse IP : {s.adresseIP ?? "non enregistrée"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Monitor className="size-3" aria-hidden />
                      Appareil : {s.navigateurUtilisateur ?? "non enregistré"}
                    </span>
                    <span>Consentement explicite recueilli : {s.consentementExplicite ? "oui" : "non"}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Ce certificat résume le faisceau de preuves qui donne sa valeur probatoire à cette signature électronique
            simple (code de vérification, consentement explicite, horodatage, adresse IP et appareil) — voir docs/palier-4-*,
            section 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
