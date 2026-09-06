"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Phone, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Contact = { id: string; nom: string; telephone: string; email: string | null; compteNom: string | null };

export function RechercheContacts({ contacts }: { contacts: Contact[] }) {
  const [recherche, setRecherche] = useState("");
  const terme = recherche.trim().toLowerCase();
  const filtres = terme
    ? contacts.filter((c) => [c.nom, c.compteNom, c.telephone, c.email].some((champ) => champ?.toLowerCase().includes(terme)))
    : contacts;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un contact…" className="pl-8" aria-label="Rechercher un contact" />
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {filtres.map((c) => (
            <Link key={c.id} href={`/app/contacts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
              <span className="min-w-0 truncate font-medium">{c.nom}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {c.compteNom ? (
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3" aria-hidden />
                    {c.compteNom}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Phone className="size-3" aria-hidden />
                  {c.telephone}
                </span>
              </span>
            </Link>
          ))}
          {filtres.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground">{terme ? "Aucun contact ne correspond à cette recherche." : "Aucun contact pour le moment."}</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
