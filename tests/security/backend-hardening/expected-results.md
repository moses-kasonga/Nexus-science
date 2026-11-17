# Résultats attendus — backend hardening NEXUS SCIENCE

| ID | Contrôle | Résultat attendu | Nature / limite |
|---|---|---|---|
| AUTH-01 | Signup Auth | utilisateur créé par API locale | runner ; aucune identité distante |
| AUTH-02 | Profil automatique | même UUID, rôle \`student\` ; trigger actif et \`handle_new_user()\` SECURITY DEFINER | catalogue + signup local |
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
| ACL-01/02/03 | INSERT anon/authenticated/PUBLIC | aucun droit table/colonne | ACL |
| ACL-04 | service_role | droits effectifs affichés | informatif seulement |
| SEC-01 | \`publish_homepage_content()\` | SECURITY DEFINER et \`search_path=''\` | \`pg_proc.prosecdef/proconfig\` |
| SEC-02 | \`prevent_role_change()\` | SECURITY DEFINER et \`search_path=''\` | catalogue |
| SEC-03 | \`private.teaches_student(uuid)\` | SECURITY DEFINER et \`search_path=''\` | catalogue |
| SEC-04 | \`handle_new_user()\` | SECURITY DEFINER, \`search_path=''\`, trigger Auth actif | catalogue + signup |
| SEC-05 | \`current_user_is_admin()\` | SECURITY DEFINER | fonction utilisée par policy admin |

## Interprétation

- \`PASS\` : assertion exécutée et satisfaite.
- \`FAIL\` : assertion exécutée et non satisfaite.
- \`MANUEL\` : contrôle externe au catalogue SQL, notamment exposition PostgREST.
- \`NON EXÉCUTÉ\` : prérequis absent ou runner arrêté.

La migration n'est pas validée si une assertion obligatoire échoue ou reste non exécutée. La vérification d'exposition de \`private\` reste obligatoire même si les assertions SQL passent.
