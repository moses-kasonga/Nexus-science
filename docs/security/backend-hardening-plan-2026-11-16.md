# NEXUS SCIENCE — Plan de sécurisation backend

**Statut :** préparation uniquement — aucune migration exécutée.
**Dépôt :** `moses-kasonga/Nexus-science`
**Branche :** `security/backend-hardening-2026-11-16`
**Supabase :** `zggyzsnracscupaigjcs`
**Production, main et projets MOÏSE :** hors périmètre, non modifiés.

## 1. Synthèse

| Élément avant | Proposition | Résultat attendu |
|---|---|---|
| `publish_homepage_content()` utilise `search_path=public` | `search_path=''`, références qualifiées | Réduire le risque de masquage d'objets, sans changer la publication |
| `prevent_role_change()` utilise `search_path=public` | `search_path=''` | Durcir le trigger sans changer sa logique |
| `public.teaches_student(uuid)` est exposée comme RPC | Déplacer en `private.teaches_student(uuid)` et faire appeler la fonction par la policy | Conserver la RLS et retirer le RPC public, si `private` n'est pas exposé à PostgREST |
| `anon` et `authenticated` possèdent INSERT sur `profiles` | Révoquer INSERT au niveau table et colonnes | Bloquer les insertions directes via API tout en gardant le trigger Auth |
| Protection mots de passe compromis désactivée | Aucun changement Auth dans cette branche | Fonction indisponible sur l'offre Free actuelle |

## 2. Fichiers présents sur la branche

- `supabase/migrations/20261116000200_backend_security_hardening.sql` — migration proposée, non exécutée.
- `docs/security/backend-hardening-plan-2026-11-16.md` — rapport technique et conditions de validation.
- `docs/security/backend-hardening-test-matrix.md` — matrice des tests prévus et de leur état.

Ces trois fichiers sont les seuls livrables de sécurisation ajoutés dans le diff final de cette branche. Aucun fichier TypeScript de l'application ni aucune migration Feedback existante n'a été modifié.

## 3. Conception SQL et dépendances

### 3.1 `publish_homepage_content()`

La migration conserve la signature, `SECURITY DEFINER`, le contrôle `public.is_admin()`, la recherche du brouillon singleton, l'erreur si le brouillon manque, l'UPSERT de publication, `auth.uid()`, l'horodatage et les droits EXECUTE existants (PUBLIC révoqué, authenticated accordé).

Le chemin de recherche devient vide. Les objets sont explicitement qualifiés : `public.is_admin()`, `public.homepage_content_drafts`, `public.homepage_content_published`, `auth.uid()`, `pg_catalog.now()`.

Le dépôt contient l'appel applicatif `supabase.rpc("publish_homepage_content")` dans `src/lib/homepage.ts`. La signature RPC n'est pas modifiée.

### 3.2 `prevent_role_change()`

La fonction garde son corps logique, sa signature, son mode SECURITY DEFINER et le trigger `profiles_prevent_role_change`. `CREATE OR REPLACE FUNCTION` conserve l'OID de la fonction et donc son attachement au trigger.

### 3.3 `teaches_student(uuid)`

L'inspection des dépendances PostgreSQL a trouvé comme dépendance de la fonction publique la policy `profiles_select_my_students`. La recherche dans le dépôt n'a trouvé aucun appel direct à ce RPC depuis le frontend.

La migration crée `private.teaches_student(uuid)`, garde le même prédicat basé sur `public.enrollments`, `public.course_teachers` et `auth.uid()`, accorde USAGE sur le schéma et EXECUTE sur la fonction à `authenticated` pour l'évaluation de la policy, remplace la policy, puis supprime l'ancienne fonction publique.

**Précondition impérative avant application :** confirmer dans Supabase Dashboard → Integrations → Data API que le schéma `private` n'est PAS dans la liste des schémas exposés. Cette liste n'est pas versionnée dans le dépôt et n'a pas pu être lue par les métadonnées projet disponibles. Si `private` est exposé, ne pas appliquer cette migration avant de l'en retirer.

Le droit EXECUTE pour `authenticated` est nécessaire à l'évaluation RLS. Il ne masque pas la fonction à lui seul : c'est l'absence du schéma dans la liste PostgREST exposée qui empêche l'accès RPC direct. Cette mesure ne bloque pas un utilisateur disposant d'un accès SQL direct à PostgreSQL ; les utilisateurs applicatifs ne doivent pas disposer de tels identifiants.

### 3.4 INSERT sur `public.profiles`

Les vérifications du catalogue Supabase ont établi :
- `public.handle_new_user()` est SECURITY DEFINER, propriétaire de `postgres`.
- Le trigger `on_auth_user_created` l'appelle après insertion dans `auth.users`.
- Cette fonction insère dans `public.profiles` et impose explicitement `role='student'`.
- En tant que fonction SECURITY DEFINER appartenant à postgres, elle utilise les privilèges de son propriétaire et ne dépend pas des privilèges INSERT de `anon` ou `authenticated`.
- La recherche des fonctions PostgreSQL n'a trouvé aucune autre fonction publique qui insère dans `public.profiles`.
- La recherche du dépôt n'a trouvé aucun appel frontend `supabase.from('profiles').insert/upsert`.
- `approve_teacher_application()` met à jour un profil existant ; elle ne crée pas de profil.

La migration révoque les droits INSERT au niveau table ET au niveau colonnes de `anon` et `authenticated`. Les droits de `postgres` et `service_role` ne sont pas touchés.

Limite : les scripts externes, tâches manuelles ou services non présents dans ce dépôt ne peuvent pas être exclus par la recherche. Il faut confirmer qu'aucun flux externe ne fait d'INSERT direct avant application.

## 4. Protection des mots de passe compromis

L'organisation propriétaire du projet est actuellement sur l'offre **Free**. La documentation Supabase actuelle précise que la protection contre les mots de passe divulgués est disponible à partir de **Pro**.

La fonctionnalité s'appuie sur l'API Pwned Passwords de Have I Been Pwned pour refuser les mots de passe connus comme compromis. Lorsqu'elle est activée, elle affecte les nouveaux mots de passe définis lors :
- de l'inscription avec mot de passe ;
- d'un changement de mot de passe ;
- d'une récupération/réinitialisation qui définit un nouveau mot de passe.

Les mots de passe existants ne sont pas automatiquement remplacés ou réinitialisés par l'activation. Les utilisateurs peuvent continuer à se connecter avec leur mot de passe actuel ; un nouveau mot de passe compromis sera refusé lorsqu'ils en choisiront un autre.

Aucun réglage Auth ni plan d'abonnement n'est modifié dans cette branche. Si l'organisation passe ultérieurement à Pro, l'activation devra être réalisée séparément dans Auth settings, après test des parcours inscription, changement et récupération.

Documentation : https://supabase.com/docs/guides/auth/password-security

## 5. Risques de régression

| Changement | Risque | Mitigation |
|---|---|---|
| Search path du publisher | Faible | Tester publication admin et refus non-admin ; conserver signature et droits |
| Search path du trigger | Faible | Vérifier que le trigger reste attaché et que les deux comportements de rôle restent identiques |
| Déplacement de `teaches_student` | Moyen | Vérifier que private n'est pas exposé ; tester USAGE/EXECUTE et lecture RLS réelle |
| Révocation INSERT profils | Faible à moyen | Tester l'inscription Auth et vérifier les services externes éventuels |
| Protection mots de passe compromis | Moyen, changement Auth futur | Prévoir messages de refus et tester les parcours de mot de passe |

La migration est transactionnelle. Si une instruction échoue avant COMMIT, la transaction est annulée. Un rollback post-déploiement devra être une migration distincte, revue et testée ; ne pas effectuer de rollback manuel en production.

## 6. Tests prévus — environnement de développement jetable uniquement

1. Confirmer que `private` n'est pas exposé dans la Data API.
2. Appliquer la migration uniquement sur une branche Supabase de développement jetable.
3. Vérifier que les trois fonctions utilisent `search_path=''`.
4. Vérifier que `profiles_prevent_role_change` référence toujours `public.prevent_role_change()`.
5. En tant qu'étudiant : lire son profil, refuser les autres profils et refuser UPDATE du rôle.
6. En tant qu'enseignant : lire son profil et ceux de ses élèves affectés ; refuser un élève non affecté.
7. Vérifier que `/rest/v1/rpc/teaches_student` n'est plus disponible, et que la policy RLS continue d'appeler la fonction privée.
8. En tant que non-admin : vérifier que la publication est refusée.
9. En tant qu'admin : publier un brouillon singleton jetable et vérifier contenu, UID du publieur et horodatage.
10. Créer un utilisateur Auth jetable : vérifier que le trigger crée son profil avec le rôle student après révocation INSERT.
11. Vérifier que les INSERT directs par anon et authenticated échouent.
12. Vérifier que les processus serveur postgres/service_role attendus restent fonctionnels.
13. Relancer les advisors Supabase et les tests de fumée applicatifs.

### Résultats actuels

Les vérifications statiques de catalogue, migrations et code source ont été effectuées. Aucune migration n'a été appliquée à Production ni à une branche de base de données de développement. Aucun test comportemental après migration n'a donc été exécuté. Tous les tests ci-dessus restent **NON EXÉCUTÉS**.

## 7. Comparatif avant / après

| Surface | Avant | Après proposé |
|---|---|---|
| Publication accueil | search_path public | search_path vide, objets qualifiés |
| Protection rôle | search_path public | search_path vide, trigger inchangé |
| Helper relation enseignant-élève | RPC dans public | helper privé utilisé par RLS |
| Policy profils élèves | appelle public.teaches_student | appelle private.teaches_student, même prédicat |
| INSERT profils | grants anon/authenticated, pas de policy INSERT | grants retirés ; trigger Auth conserve son privilège postgres |
| Protection mots de passe divulgués | désactivée, plan Free | inchangée ; nécessite Pro ou supérieur |

## 8. Conditions avant déploiement ultérieur

1. Confirmer l'absence de `private` dans les schémas exposés de la Data API.
2. Confirmer l'absence de service externe qui insère directement dans `public.profiles`.
3. Exécuter toute la matrice de tests sur une branche Supabase jetable.
4. Faire relire le diff SQL et les résultats de test.
5. Obtenir une autorisation explicite distincte avant toute application à Supabase Production ou fusion de PR.


## 9. Revue complémentaire du 16 novembre — ACL INSERT et versions

### 9.1 Privilèges INSERT : vérification ACL complète

Inspection de `pg_class.relacl`, des ACL de colonnes, de `aclexplode`, de `has_table_privilege`, de `has_any_column_privilege`, et de `pg_auth_members` :

- Le grantee `PUBLIC` (OID 0) ne possède aucun privilège INSERT sur la table `public.profiles`.
- Aucun privilège INSERT n'est accordé à PUBLIC au niveau des colonnes.
- `anon` et `authenticated` ont chacun INSERT au niveau table, hérité sur toutes les colonnes, ce qui explique le droit effectif d'insertion sur `first_name`, `last_name`, `avatar_url`, `bio` et `preferred_language`.
- Aucune appartenance à un rôle supplémentaire n'a été trouvée pour `anon` ou `authenticated`. Les deux rôles ont `rolinherit=true`, mais aucun membership n'ajoute de privilège hérité.
- Aucun grant option n'est présent dans l'ACL relevée.

Conclusion : les deux REVOKE de la migration sont suffisants pour les privilèges actuels : le REVOKE table enlève le grant large, le REVOKE par colonnes retire toute éventuelle délégation colonne distincte. Aucun REVOKE PUBLIC supplémentaire n'est justifié, puisque PUBLIC ne possède actuellement aucun INSERT. Ne pas élargir la migration inutilement.

Simulation transactionnelle effectuée (BEGIN / REVOKE / SET LOCAL ROLE / tentative INSERT / rollback implicite après refus) :
- rôle anon : `42501 permission denied for table profiles`.
- rôle authenticated : `42501 permission denied for table profiles`.

Une simulation distincte des seuls privilèges après REVOKE a aussi retourné false pour table INSERT et any-column INSERT sur les deux rôles. Aucun INSERT n'a abouti et aucune donnée n'a été persistée.

### 9.2 Schéma private et Data API

Le projet actif ne possède pas encore de schéma `private`, ni de fonction `private.teaches_student(uuid)`. L'ancienne fonction `public.teaches_student(uuid)` existe toujours. Il est donc impossible de tester la nouvelle policy sur la base active sans appliquer la migration, ce qui est expressément interdit.

Les paramètres runtime `pgrst.db_schemas` et `pgrst.db_extra_search_path` n'étaient pas lisibles par la connexion SQL utilisée. La liste des schémas exposés doit donc être confirmée dans Dashboard → Integrations → Data API. Supabase documente que le schéma `private` n'est pas accessible par l'API lorsqu'il n'est pas ajouté aux schémas exposés : https://supabase.com/docs/guides/api/securing-your-api.

Droits proposés dans la migration :
- retirer USAGE de PUBLIC/anon/authenticated puis réaccorder USAGE à authenticated ;
- fonction privée SECURITY DEFINER, chemin vide, références qualifiées ;
- EXECUTE retiré de PUBLIC et anon, accordé à authenticated car le moteur RLS évalue la policy sous le rôle de l'appelant ;
- la fonction reste non appelable par RPC seulement si `private` n'est pas exposé à PostgREST.

Aucun droit EXECUTE requis pour la policy ne doit être révoqué. Ne pas appliquer si l'exposition Data API de `private` n'est pas vérifiée.

### 9.3 Unicité des versions de migration

Inventaire des branches GitHub visibles au moment de la revue : main, branches feature/*, fix/*, integration/*, prep/*, security/*, temp/* et test/* (17 branches au total). Les arbres GitHub retournés n'étaient pas tronqués.

Le préfixe `20261116000100` est déjà utilisé sur `feature/feedback-independent-history` par `20261116000100_feedback_message_deletions.sql`. La migration de sécurisation a donc été renommée sur cette branche uniquement en `20261116000200_backend_security_hardening.sql`. Le préfixe `20261116000200` n'apparaît dans aucune des 17 branches inspectées.

Autre collision préexistante, indépendante de cette migration : `20261113000100` est utilisé par des migrations Feedback différentes dans `feature/student-admin-feedback` et `prep/feedback-function-4bf14de` (et une variante Feedback dans `feature/feedback-independent-history`). Cette collision doit être résolue lors de l'intégration de ces branches, sans modifier leurs migrations dans le cadre de cette revue.

### 9.4 Matrice de tests complémentaire

Les tentatives INSERT ci-dessus sont les seuls tests comportementaux exécutés, et elles ont été faites en transaction annulée. Les tests post-migration ci-dessous restent à exécuter sur une branche Supabase jetable :

| Test | Identité / préparation | Résultat attendu | État |
|---|---|---|---|
| Inscription Auth | utilisateur jetable via Auth signup | Auth user créé, trigger crée un profil `student` | NON EXÉCUTÉ |
| INSERT direct | anon | erreur permission denied / 42501 | SIMULATION EXÉCUTÉE : refus observé |
| INSERT direct | authenticated | erreur permission denied / 42501 | SIMULATION EXÉCUTÉE : refus observé |
| Lecture profil propre | étudiant | son profil visible | NON EXÉCUTÉ après migration |
| Lecture autre profil | étudiant | profil non autorisé invisible | NON EXÉCUTÉ après migration |
| Lecture élèves affectés | enseignant | élèves affectés visibles via private helper | NON EXÉCUTÉ |
| Lecture élève non affecté | enseignant | profil invisible | NON EXÉCUTÉ |
| Publication accueil | administrateur + brouillon jetable | singleton publié, UID et timestamp renseignés | NON EXÉCUTÉ |
| Publication accueil | non-administrateur | erreur 42501 | NON EXÉCUTÉ |
| Trigger rôle | étudiant/enseignant, tentative UPDATE role dans transaction | exception, aucune modification | NON EXÉCUTÉ après migration |
| Trigger rôle | administrateur, tentative autorisée contrôlée sur fixture jetable | comportement admin conservé | NON EXÉCUTÉ |
| RPC helper | authenticated via REST | endpoint public absent si private non exposé | NON EXÉCUTÉ |
| Policy RLS privée | enseignant via vraie session Auth | la policy invoque private.teaches_student et conserve le périmètre | NON EXÉCUTÉ |

Aucun compte réel n'a été créé, modifié ou utilisé pour ces tests complémentaires. Aucune migration n'a été appliquée.

### 9.5 Fichiers corrigés dans cette revue

- Migration renommée : `supabase/migrations/20261116000200_backend_security_hardening.sql`.
- La première version de la migration, portant le préfixe `20261116000100`, a été retirée de cette branche uniquement pour éviter le conflit de version. Aucune migration Feedback existante n'a été modifiée ni supprimée.
- Cette revue documentaire complète les conditions de validation et les tests.



## 10. Vérification manuelle de l'exposition Data API — procédure exacte

L'information n'a pas pu être lue depuis les métadonnées projet ni depuis les paramètres PostgreSQL accessibles dans cette revue. Aucune modification de configuration n'a été tentée.

1. Ouvrir le projet exact dans Supabase Dashboard : https://supabase.com/dashboard/project/zggyzsnracscupaigjcs/integrations/data_api/overview
2. Vérifier le nom du projet et le project ref dans le Dashboard : `zggyzsnracscupaigjcs`.
3. Dans la page **Integrations → Data API**, repérer la section / le champ **Exposed schemas** (schémas exposés).
4. Lire toute la liste affichée, sans cliquer sur Save / Apply.
5. Confirmer que `private` n'y figure pas. Les schémas applicatifs publics usuels peuvent y figurer ; c'est la présence de `private` qui bloque la stratégie d'isolement proposée.
6. Si `private` figure dans la liste, arrêter la validation : ne pas appliquer la migration et demander une autorisation séparée pour modifier cette configuration.
7. Si `private` est absent, noter la date et une capture de la liste pour le dossier de validation, sans exposer les clés API.

Le paramètre à contrôler est la liste des schémas exposés par la Data API / PostgREST, pas le simple privilège SQL USAGE. Accorder USAGE à `authenticated` pour permettre l'évaluation RLS n'expose pas à lui seul le schéma via PostgREST. La non-exposition de `private` est la barrière qui empêche le routage RPC direct par la Data API.

Après application sur un environnement de test uniquement, un contrôle complémentaire pourra tenter l'appel REST à `/rest/v1/rpc/teaches_student` avec un jeton de test. Ce contrôle HTTP n'est pas à exécuter sur Production dans le cadre de cette mission.

Référence officielle : https://supabase.com/docs/guides/api/securing-your-api (section Data API / exposed schemas et exemples de schémas internes).

## 11. Dépendances INSERT — limites de l'audit du dépôt

La conclusion « aucun autre INSERT direct trouvé » est limitée aux éléments effectivement inspectés :
- les fichiers suivis par Git dans le dépôt `moses-kasonga/Nexus-science`, sur la branche de sécurisation ;
- les références applicatives recherchées pour `profiles` avec les opérations `insert` / `upsert` ;
- les fonctions PostgreSQL et triggers inspectés dans le projet Supabase ciblé ;
- les privilèges effectifs du catalogue au moment de l'audit.

Une recherche Git ne peut pas inventorier les systèmes qui ne sont pas versionnés dans ce dépôt, les secrets et variables d'environnement, les jobs configurés dans des consoles tierces, ni les scripts exécutés depuis des postes ou serveurs externes. L'absence d'appel trouvé dans le code n'est donc pas une preuve qu'aucun système externe n'écrit dans la table.

Avant toute révocation en production, faire confirmer manuellement les éléments suivants, sans communiquer ni copier les secrets :
- **Vercel** : fonctions serverless / API routes / Server Actions, jobs Cron, scripts de build ou d'administration, variables d'environnement et intégrations du projet Vercel relié à NEXUS. Identifier les opérations qui écrivent dans `public.profiles` et le rôle/credential utilisé.
- **Supabase Edge Functions** : inventaire de toutes les fonctions déployées dans le projet exact, y compris celles dont le code n'est pas présent dans le dépôt ; rechercher les appels `.from('profiles').insert()`, `.upsert()`, SQL direct et RPC qui insèrent.
- **Automatisations externes** : n8n, Make, Zapier, webhooks, outils d'administration, formulaires tiers, tâches planifiées ou scripts ETL/import qui pourraient écrire dans `profiles`. Il s'agit de catégories à vérifier, pas d'intégrations dont l'existence est affirmée.
- **Accès PostgreSQL directs** : scripts Python/Node/psql, outils BI, consoles SQL, tâches de maintenance ou imports utilisant un rôle de base de données.
- **CI/CD et opérations manuelles** : GitHub Actions, runners, scripts locaux d'administration et procédures d'import.

Pour chaque flux trouvé, noter : propriétaire du système, fréquence, table/colonnes écrites, mécanisme d'authentification et rôle PostgreSQL effectif. Les flux utilisant `service_role` ou `postgres` ne sont pas bloqués par les REVOKE visant uniquement `anon` et `authenticated`; ils doivent néanmoins être inventoriés et protégés côté serveur. Le trigger `handle_new_user()` reste un flux distinct : SECURITY DEFINER détenu par postgres, insertion du profil avec rôle student.

Aucun autre privilège n'est révoqué ou proposé dans cette revue.

## 12. Préparation d'un environnement Supabase jetable

### État observé

- Projet : `zggyzsnracscupaigjcs`, statut `ACTIVE_HEALTHY`.
- Organisation propriétaire : `Nexus-science`, offre `Free`.
- Estimation de création d'une branche : **0,01344 USD par heure** au tarif de compute Micro retourné par Supabase pour cette organisation. Ce montant est un point de départ de compute, pas une garantie du coût total ; les autres usages de la branche peuvent s'ajouter. Les usages de branches Preview sont facturés et ne sont pas couverts par le Spend Cap selon la documentation Supabase.
- La liste des branches renvoie actuellement une entrée nommée `main`, marquée `MIGRATIONS_FAILED`, `with_data=false`, et un statut de projet preview `ACTIVE_HEALTHY`. Cette entrée n'est pas considérée comme un environnement de test propre et ne doit pas être réutilisée sans diagnostic distinct.
- Aucune nouvelle branche n'a été créée. Aucun coût n'a été engagé par une création de branche.

### Prérequis avant création ultérieure

1. Obtenir une autorisation distincte pour créer une branche et accepter son coût horaire.
2. Confirmer les permissions de propriétaire/administrateur sur l'organisation Supabase `Nexus-science`.
3. Vérifier le branchement GitHub de Supabase et s'assurer que la source est bien `moses-kasonga/Nexus-science` et la branche Git `security/backend-hardening-2026-11-16`, jamais un dépôt/projet MOÏSE.
4. Vérifier que la branche sera data-less : aucun utilisateur, profil, secret, fichier Storage ou donnée Production ne doit être cloné.
5. Préparer des identités et fixtures jetables uniquement dans l'environnement de test. Ne pas réutiliser les comptes réels.
6. Vérifier la configuration Auth, les fournisseurs email/OAuth et les secrets requis pour les tests ; ne pas recopier de secrets Production.
7. Vérifier l'historique des migrations de l'environnement neuf avant d'appliquer la migration de sécurisation.

### Procédure prévue — non exécutée

1. Dans Supabase Dashboard, sélectionner le projet `zggyzsnracscupaigjcs`, ouvrir **Branches**, puis préparer une branche de développement dédiée, par exemple `qa-backend-hardening-2026-11-16`.
2. S'assurer que cette branche est isolée, data-less et possède son propre project ref, URL API et clés propres à cette branche.
3. Vérifier le statut de santé des services Database, Auth, API et Storage.
4. Dans un clone local du dépôt, checkout `security/backend-hardening-2026-11-16`. Vérifier `git status` et `git branch --show-current` avant toute commande Supabase.
5. Lier la CLI uniquement au project ref de la branche jetable, jamais au project ref de Production :
   `supabase link --project-ref <BRANCH_PROJECT_REF>`.
6. Comparer l'historique avec `supabase migration list --linked`. Vérifier que la migration `20261116000200` est en attente et que les migrations antérieures sont cohérentes.
7. Exécuter d'abord `supabase db push --dry-run` et lire toute la liste des migrations qui seraient appliquées. Si une migration inattendue apparaît, arrêter.
8. Après autorisation distincte de test, appliquer uniquement sur le project ref jetable, puis exécuter la matrice `docs/security/backend-hardening-test-matrix.md`.
9. Ne jamais utiliser `supabase db reset --linked` sans vérifier le project ref : cette commande est destructive pour la base liée.
10. Après validation, conserver les résultats de test et supprimer la branche jetable uniquement après autorisation, si elle n'est plus nécessaire.

Documentation officielle :
- Branching : https://supabase.com/docs/guides/deployment/branching
- Working with branches : https://supabase.com/docs/guides/deployment/branching/working-with-branches
- Coûts des branches : https://supabase.com/docs/guides/platform/manage-your-usage/branching
- CLI `db push` et option `--dry-run` : https://supabase.com/docs/reference/cli/supabase-db-push
- Comparaison de l'historique : https://supabase.com/docs/reference/cli/supabase-migration-list

### Décision

L'offre actuelle est Free, mais Supabase retourne une estimation horaire de compute pour la branche. La faisabilité technique est donc établie, sous réserve de l'autorisation de coût et des permissions. La création est volontairement reportée. Ne pas utiliser l'entrée existante `main` en état `MIGRATIONS_FAILED` comme environnement de validation.

## 13. Contrôle documentaire final

- Nom canonique de la migration : `supabase/migrations/20261116000200_backend_security_hardening.sql`.
- Le préfixe `20261116000200` est unique dans l'inventaire des branches Git inspectées lors de la revue précédente.
- L'ancien nom de fichier a été remplacé dans ce rapport ; l'ancien fichier n'est pas présent dans l'arbre de la branche.
- Les trois fichiers livrés sont listés à la section 2.
- Aucun réglage Data API n'a été modifié.
- Aucune branche Supabase n'a été créée.
- Aucune migration n'a été appliquée, ni sur Production ni sur un environnement de développement.
