"use client";

import { useTransition, useState } from "react";
import { Send, Mail, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { envoyerCampagne } from "@/lib/actions/campagne";

type Campagne = { id: string; nom: string; canal: string; statut: string; envoyeeLe: Date | null };

export function ListeCampagnes({ campagnes, peutEnvoyer }: { campagnes: Campagne[]; peutEnvoyer: boolean }) {
  const [enCours, demarrer] = useTransition();
  const [messages, setMessages] = useState<Record<string, string>>({});

  if (campagnes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune campagne pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {campagnes.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 font-medium">
                {c.canal === "EMAIL" ? <Mail className="size-3.5 text-muted-foreground" aria-hidden /> : <MessageCircle className="size-3.5 text-muted-foreground" aria-hidden />}
                {c.nom}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={c.statut === "ENVOYEE" ? "success" : "neutral"}>{c.statut === "ENVOYEE" ? "Envoyée" : "Brouillon"}</Badge>
                {c.statut === "BROUILLON" && peutEnvoyer ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={enCours}
                    onClick={() =>
                      demarrer(async () => {
                        const resultat = await envoyerCampagne(c.id);
                        setMessages((m) => ({ ...m, [c.id]: resultat?.erreur ?? resultat?.succes ?? "" }));
                      })
                    }
                  >
                    {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
                    Envoyer
                  </Button>
                ) : null}
              </div>
            </div>
            {messages[c.id] ? <p className="text-xs text-muted-foreground">{messages[c.id]}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
