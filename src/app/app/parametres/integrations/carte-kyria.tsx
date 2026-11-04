import { getT } from "@/lib/i18n/langue";
import { NOM_CLE_KYRIA } from "@/lib/kyria/connexion";

type CleVue = { nom: string; revoqueeLe: string | null; dernierUsageLe: string | null };

/** L'état de la connexion avec Kyria : une clé « Kyria WhatsApp » active = connecté. La connexion se lance depuis le portail Kyria. */
export async function CarteKyria({ cles }: { cles: CleVue[] }) {
  const t = await getT();
  const active = cles.find((c) => c.nom === NOM_CLE_KYRIA && !c.revoqueeLe);

  return (
    <section className="flex flex-col gap-2 rounded-xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("Kyria WhatsApp")}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{active ? t("Connecté") : t("Non connecté")}</span>
      </div>
      {active ? (
        <p className="text-sm text-muted-foreground">
          {t("Les conversations WhatsApp de Kyria créent des prospects dans votre CRM.")}{" "}
          {active.dernierUsageLe
            ? t("Dernier prospect reçu le {date}.", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(active.dernierUsageLe)) })
            : t("Aucun prospect reçu pour le moment.")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("La connexion se fait depuis votre portail Kyria (bouton « Connecter mon Vertex One »).")}</p>
      )}
    </section>
  );
}
