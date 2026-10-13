"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, FileText, ShieldCheck, Smartphone, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/contexte";
import { m } from "@/lib/i18n/catalogue";

const DUREE_DIAPO_S = 6;

/** Messages qui défilent sous le logo : ce que le produit fait réellement, jamais une promesse non tenue. */
const DIAPOS = [
  {
    icone: Smartphone,
    titre: m("La suite de gestion pensée pour les entreprises de services en Afrique."),
    texte: m("CRM, devis, facturation et paiement Mobile Money — sans les frais d'implémentation d'un grand logiciel international."),
  },
  {
    icone: FileText,
    titre: m("Faites payer vos clients par Mobile Money."),
    texte: m("Un lien de paiement dans chaque facture : MTN, Orange ou carte, avec une confirmation de paiement rattachée à la facture."),
  },
  {
    icone: ShieldCheck,
    titre: m("Vos données restent chez vous."),
    texte: m("Chaque entreprise est isolée des autres, et chacun de vos collaborateurs ne voit que ce que l'Administrateur lui ouvre."),
  },
] as const;

/** Cartes décoratives (aucune donnée réelle) qui flottent doucement pour donner vie au panneau. */
const CARTES = [
  { icone: CheckCircle2, titre: m("Facture payée"), detail: m("Paiement Mobile Money reçu"), classes: "left-0 top-2", inclinaison: "-3deg", delai: "0.2s" },
  { icone: UserPlus, titre: m("Nouveau lead"), detail: m("Demande reçue depuis votre site"), classes: "left-24 top-[5.25rem]", inclinaison: "2deg", delai: "0.45s" },
  { icone: CalendarCheck, titre: m("Rendez-vous confirmé"), detail: m("Demain à 10h00"), classes: "left-6 top-[9.75rem]", inclinaison: "-1.5deg", delai: "0.7s" },
] as const;

/**
 * Panneau de marque des pages de connexion et d'inscription : diaporama automatique (suspendu au survol), cartes
 * flottantes décoratives, fond en dégradé animé. Le logo et le pied restent dans le layout serveur.
 */
export function PanneauMarque() {
  const t = useT();
  const [actif, setActif] = useState(0);
  const [pause, setPause] = useState(false);
  const [reduit, setReduit] = useState(false);

  useEffect(() => {
    const requete = window.matchMedia("(prefers-reduced-motion: reduce)");
    const maj = () => setReduit(requete.matches);
    maj();
    requete.addEventListener("change", maj);
    return () => requete.removeEventListener("change", maj);
  }, []);

  useEffect(() => {
    if (pause || reduit) return;
    const minuteur = setTimeout(() => setActif((i) => (i + 1) % DIAPOS.length), DUREE_DIAPO_S * 1000);
    return () => clearTimeout(minuteur);
  }, [actif, pause, reduit]);

  const diapo = DIAPOS[actif];

  return (
    <div className="relative flex flex-1 flex-col justify-center gap-6" onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}>
      <div className="relative h-52 shrink-0" aria-hidden>
        {CARTES.map((c) => (
          <div key={c.titre} className={`animate-auth-apparition absolute ${c.classes}`} style={{ animationDelay: c.delai }}>
            <div
              className="animate-auth-carte-flotte flex w-64 items-center gap-3 rounded-2xl border border-white/20 bg-white/12 p-3.5 shadow-xl shadow-black/10 backdrop-blur-md"
              style={{ ["--auth-inclinaison" as string]: c.inclinaison, animationDelay: c.delai }}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/90 text-marque-bleu">
                <c.icone className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{t(c.titre)}</span>
                <span className="truncate text-xs text-marque-bleu-100/80">{t(c.detail)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        <div key={actif} className="animate-auth-diapo flex min-h-36 flex-col gap-2.5" aria-live="polite">
          <diapo.icone className="size-7 text-marque-orange" aria-hidden />
          <p className="text-2xl font-medium leading-snug">{t(diapo.titre)}</p>
          <p className="text-marque-bleu-100/90">{t(diapo.texte)}</p>
        </div>

        <div className="flex gap-2" role="tablist" aria-label={t("Messages")}>
          {DIAPOS.map((d, i) => (
            <button
              key={d.titre}
              type="button"
              role="tab"
              aria-selected={i === actif}
              aria-label={`${i + 1} / ${DIAPOS.length}`}
              onClick={() => setActif(i)}
              className="relative h-1.5 w-12 overflow-hidden rounded-full bg-white/25 transition-colors hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              {i === actif ? (
                <span
                  key={`${actif}-${pause}`}
                  className={`absolute inset-0 rounded-full bg-marque-orange ${pause || reduit ? "" : "animate-auth-progression-diapo"}`}
                  style={{ ["--auth-duree" as string]: `${DUREE_DIAPO_S}s` }}
                />
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
