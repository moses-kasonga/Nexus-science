# Résultats attendus — backend hardening NEXUS SCIENCE

| ID | Contrôle | Résultat attendu | Nature / limite |
|---|---|---|---|
| AUTH-01 | Signup Auth | utilisateur créé par API locale | runner ; aucune identité distante |
| AUTH-02 | Profil automatique | même UUID, rôle \`student\` ; trigger actif | catalogue + signup local |
| INS-01/02 | INSERT anon/authenticated | refus \`42501\` | rôles SQL locaux |
| RLS-01/02 | profil propre / autre profil | une ligne / zéro ligne | claims simulés dans transaction |
| RLS-03/04 | enseignant : élève affecté / non affecté | une ligne / zéro ligne | fixtures cours et inscriptions |
| RLS-05 | administrateur lit profils | quatre profils fixtures visibles | policy \`profiles_select_admin\` |
| RLS-06 | UPDATE \`first_name\`, \`avatar_url\` | changements autorisés sur profil propre | ACL et policy |
| API-01 | ancien helper public | \`public.teaches_student(uuid)\` absent | catalogue |
| API-02 | helper privé | \`private.teaches_student(uuid)\` présent et référencé par policy | catalogue + RLS |
| API-03 | exposition PostgREST | \`private\` absent des Exposed schemas | manuel si setting SQL illisible ; test HTTP local requis |
| API-04 | grants private | authenticated USAGE/EXECUTE ; anon et PUBLIC sans accès | ACL |
| HOME-01/02 | publication admin / non-admin | admin publié ; non-admin refusé \`42501\` | transaction rollback |
| ROLE-01/02 | trigger changement rôle | étudiant refusé ; admin autorisé | grant UPDATE(role) temporaire, rollback |
| ACL-01 | INSERT effectif anon | aucun droit table/colonne, y compris via PUBLIC | privilèges effectifs |
| ACL-02 | INSERT effectif authenticated | aucun droit table/colonne, y compris via PUBLIC | privilèges effectifs |
| ACL-03 | INSERT explicitement accordé à PUBLIC | ACL table/colonnes rapportée ; informatif, non révoqué par la migration cible | catalogues ACL |
| ACL-04 | service_role | droits effectifs affichés | informatif seulement |
| SEC-01 | \`publish_homepage_content()\` | SECURITY DEFINER et \`search_path=''\` | \`pg_proc.prosecdef/proconfig\` |
| SEC-02 | \`prevent_role_change()\` | SECURITY DEFINER et \`search_path=''\` | catalogue |
| SEC-03 | \`private.teaches_student(uuid)\` | SECURITY DEFINER et \`search_path=''\` | catalogue |
| SEC-04 | \`handle_new_user()\` | SECURITY DEFINER et \`search_path=''\` | catalogue |
| SEC-05 | trigger Auth \`on_auth_user_created\` | trigger unique, actif, attaché à \`handle_new_user()\` | \`pg_trigger\` |
| SEC-06 | \`current_user_is_admin()\` | fonction présente, SECURITY DEFINER et \`search_path=''\` | \`pg_proc\` : existence, \`prosecdef\`, \`proconfig\` |
| SEC-07 | trigger \`profiles_prevent_role_change\` | trigger unique et actif sur \`profiles\` | \`pg_trigger\` |
| SEC-08 | \`profiles.preferred_language\` | colonne présente, type \`text\`, NOT NULL, DEFAULT \`'fr'\`, CHECK exactement \`fr/en/pt/es\` validé | \`pg_attribute\`, \`pg_attrdef\`, \`pg_constraint\` |

## Privilèges INSERT

La migration cible révoque explicitement INSERT de \`anon\` et \`authenticated\`, au niveau table et au niveau des colonnes listées. Elle ne contient pas de \`REVOKE ... FROM PUBLIC\`.

- ACL-01 et ACL-02 vérifient les privilèges **effectifs** des rôles API, y compris un éventuel droit hérité de PUBLIC : un INSERT effectif reste un échec.
- ACL-03 observe les ACL explicites de PUBLIC à titre informatif ; il ne prétend pas que la migration les a révoquées.
- ACL-04 rapporte les privilèges effectifs de \`service_role\` sans en faire une assertion de refus.

## Interprétation

- \`PASS\` : assertion exécutée et satisfaite.
- \`FAIL\` : assertion exécutée et non satisfaite.
- \`MANUEL\` : contrôle externe au catalogue SQL, notamment exposition PostgREST.
- \`INFO\` : état rapporté sans affirmer qu'il est garanti par la migration.
- \`NON EXÉCUTÉ\` : prérequis absent ou runner arrêté.

La migration n'est pas validée si une assertion obligatoire échoue ou reste non exécutée. La vérification d'exposition de \`private\` reste obligatoire même si les assertions SQL passent.
