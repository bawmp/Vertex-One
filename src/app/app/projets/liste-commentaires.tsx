import { Card, CardContent } from "@/components/ui/card";
import { getT } from "@/lib/i18n/langue";

export async function ListeCommentaires({
  commentaires,
  auteursParId,
}: {
  commentaires: { id: string; auteurId: string; contenu: string; creeLe: Date }[];
  auteursParId: Record<string, string | undefined>;
}) {
  const t = await getT();
  if (commentaires.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Aucun commentaire pour le moment.")}</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {commentaires.map((c) => (
          <div key={c.id} className="flex flex-col gap-0.5 px-4 py-3 first:pt-4 last:pb-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{auteursParId[c.auteurId] ?? t("Utilisateur")}</p>
              <p className="shrink-0 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(c.creeLe)}
              </p>
            </div>
            <p className="text-sm">{c.contenu}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
