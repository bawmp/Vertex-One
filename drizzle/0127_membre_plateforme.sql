-- Équipe de la console interne plateforme (2026-10-26) : collaborateurs ajoutés par le propriétaire pour gérer Vertex One avec lui. Table de niveau
-- plateforme (sans entreprise_id ni RLS, comme « groupe ») : seulement l'email de collègues déjà titulaires d'un compte. Une révocation garde la ligne.
CREATE TABLE IF NOT EXISTS "membre_plateforme" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "ajoute_par_email" text NOT NULL,
  "ajoute_le" timestamp DEFAULT now() NOT NULL,
  "revoque_le" timestamp,
  "revoque_par_email" text,
  CONSTRAINT "membre_plateforme_email_unique" UNIQUE("email")
);
