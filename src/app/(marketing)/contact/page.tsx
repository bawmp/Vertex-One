import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormulaireContact } from "./formulaire-contact";

export const metadata: Metadata = {
  title: "Contact — Vertex One",
  description: "Une question sur Vertex One ? Écrivez-nous.",
};

export default function PageContact() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Parlons-en</h1>
        <p className="mt-4 text-muted-foreground">
          Une question avant de vous lancer, ou besoin d&apos;aide pour votre entreprise ? Écrivez-nous.
        </p>
      </div>

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>Envoyer un message</CardTitle>
          <CardDescription>Nous répondons généralement sous 24 à 48 heures.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireContact />
        </CardContent>
      </Card>
    </div>
  );
}
