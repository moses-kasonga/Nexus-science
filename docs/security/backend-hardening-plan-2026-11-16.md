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

## 2. Fichiers de la branche

- `supabase/migrations/20261116000100_backend_security_hardening.sql` — migration proposée, non exécutée.
- `docs/security/backend-hardening-plan-2026-11-16.md` — cette note de préparation.

Aucun fichier TypeScript de l'application et aucune migration existante ne sont modifiés.

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
- Le fichier `20261116000100_backend_security_hardening.sql` a été retiré de cette branche seulement pour éviter le conflit de version. Aucune migration Feedback existante n'a été modifiée ni supprimée.
- Cette revue documentaire complète les conditions de validation et les tests.

