-- Paiement en plusieurs fois (2026-10-25) : le client peut régler une facture par tranches (il choisit le montant de chaque tranche, jusqu'au
-- solde restant). Un réglage par entreprise, activé par défaut, désactivable par l'Administrateur : rien ne change pour les factures déjà
-- émises tant qu'on n'y touche pas, et l'entreprise qui ne veut pas de tranches l'éteint d'un clic.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "paiement_en_tranches" boolean DEFAULT true NOT NULL;
