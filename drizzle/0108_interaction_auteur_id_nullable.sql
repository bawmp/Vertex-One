-- interaction.auteur_id devient nullable (2026-09-29) : un email envoyé automatiquement (relance de facture,
-- confirmation après acceptation publique d'un devis) n'a pas d'utilisateur humain déclencheur — voir
-- journaliserEmailEnvoye(), src/lib/crm/journaliser-email.ts. Assouplissement, pas de resserrement : pas besoin
-- du patron expand/backfill/contract. Rejouable sans erreur.
ALTER TABLE "interaction" ALTER COLUMN "auteur_id" DROP NOT NULL;
