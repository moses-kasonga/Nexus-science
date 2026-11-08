# Nexus science

Plateforme d'apprentissage en ligne : cours de sciences par sessions datées, enseignants, élèves, et l'assistant MOÏSE (à intégrer).

## État actuel (branche `feature/site-nexus`)

- **Accueil** : cours publiés et leurs sessions (à venir, en cours, terminée), lisibles sans compte.
- **Page d'un cours** : description, sessions, leçons réservées aux inscrits (les règles de sécurité de la base décident).
- **Inscription et connexion** par Supabase Auth ; page **Mon compte** avec le rôle (élève, enseignant, administrateur).
- Pas encore faits : espace enseignant, espace administrateur, inscription d'un élève à un cours, MOÏSE intégré.

## Base de données

Le dossier `supabase/migrations` contient l'état de départ de la base (tables, règles de sécurité RLS, fonctions), extrait du projet Supabase de Nexus le 2026-11-08. Aucune donnée, aucun secret.

## Lancer le site

```bash
cp .env.example .env     # les deux clés sont publiques par conception
npm install
npm run dev              # http://localhost:5173
npm run build            # production
npm run typecheck        # vérification des types
```

Variables : `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. Ne jamais mettre ici la clé « service role » : elle donnerait un accès total à la base.

## Déploiement

Projet Vercel séparé de MOÏSE, framework Vite. Ajouter les deux variables ci-dessus (Production et Preview).
