# NEXUS SCIENCE — Matrice de tests backend security

Branche : `security/backend-hardening-2026-11-16`
Migration proposée : `20261116000200_backend_security_hardening.sql`
Supabase : `zggyzsnracscupaigjcs`

**Règle absolue :** exécuter les tests fonctionnels uniquement sur une branche Supabase jetable, jamais sur Production. Utiliser des identités de test dédiées et des fixtures jetables. Les tests d'écriture doivent être annulés ou nettoyés dans la base jetable.

| ID | Test | Contexte | Étapes | Résultat attendu | Résultat actuel |
|---|---|---|---|---|---|
| AUTH-01 | Signup email/password | utilisateur jetable | Créer un compte via Auth signup | utilisateur Auth créé ; trigger crée profil avec rôle student | NON EXÉCUTÉ |
| AUTH-02 | Profil automatique | compte créé par AUTH-01 | Lire profil via session utilisateur | une ligne profiles avec même UID et role student | NON EXÉCUTÉ |
| INS-01 | INSERT direct anon | rôle anon | INSERT d'un UUID jetable dans profiles | 42501 permission denied | SIMULATION transactionnelle : REFUS OBSERVÉ |
| INS-02 | INSERT direct authenticated | rôle authenticated | INSERT d'un UUID jetable dans profiles | 42501 permission denied | SIMULATION transactionnelle : REFUS OBSERVÉ |
| RLS-01 | Lecture propre profil | étudiant réel jetable | SELECT profiles filtré sur auth.uid | une ligne propre | NON EXÉCUTÉ après migration |
| RLS-02 | Lecture autre profil | étudiant | SELECT profil d'un autre compte | zéro ligne | NON EXÉCUTÉ après migration |
| RLS-03 | Lecture élève affecté | enseignant + étudiant affecté | SELECT profil de l'élève | une ligne | NON EXÉCUTÉ |
| RLS-04 | Lecture élève non affecté | enseignant + étudiant non affecté | SELECT profil | zéro ligne | NON EXÉCUTÉ |
| API-01 | RPC helper public | token authenticated | POST /rest/v1/rpc/teaches_student | endpoint absent / fonction non trouvée | NON EXÉCUTÉ |
| API-02 | RLS private helper | enseignant | SELECT profiles via vraie session | profil élève affecté visible, non-affecté invisible | NON EXÉCUTÉ |
| HOME-01 | Publication admin | administrateur + draft jetable | Appeler publish_homepage_content | publication singleton, published_by=auth.uid, timestamp renseigné | NON EXÉCUTÉ |
| HOME-02 | Publication non-admin | étudiant ou enseignant | Appeler RPC publication | 42501 / accès réservé | NON EXÉCUTÉ |
| ROLE-01 | Trigger refuse rôle | étudiant/enseignant | UPDATE role dans transaction jetable | exception Modification du rôle non autorisée | NON EXÉCUTÉ après migration |
| ROLE-02 | Trigger autorise admin | admin | UPDATE contrôlé d'une fixture dans transaction rollback | pas d'exception du trigger | NON EXÉCUTÉ |
| ACL-01 | ACL effective anon | anon | has_table_privilege + has_any_column_privilege | false / false | SIMULATION post-REVOKE : PASS |
| ACL-02 | ACL effective authenticated | authenticated | has_table_privilege + has_any_column_privilege | false / false | SIMULATION post-REVOKE : PASS |

## Résultats exécutés lors de la revue (sans migration)

- ACL PUBLIC : aucun INSERT table ou colonne détecté.
- Appartenances héritées anon/authenticated : aucune.
- Simulation de REVOKE dans une transaction : les droits table et colonnes effectifs deviennent false pour les deux rôles.
- Tentative INSERT sous SET LOCAL ROLE anon : erreur 42501, permission denied for table profiles.
- Tentative INSERT sous SET LOCAL ROLE authenticated : erreur 42501, permission denied for table profiles.
- Les transactions ont été annulées ; aucun profil n'a été créé.
- Le projet actif ne possède pas encore de schéma private ; la nouvelle policy ne peut pas être testée sans migration.
- Les paramètres PGRST d'exposition n'étaient pas lisibles depuis la session SQL ; confirmation Dashboard nécessaire.

## Critères d'acceptation

- AUTH-01/02, INS-01/02, RLS-01 à 04, API-01/02, HOME-01/02 et ROLE-01/02 passent sur la base jetable.
- Le trigger `profiles_prevent_role_change` pointe toujours sur `public.prevent_role_change()`.
- Les fonctions de publication et de trigger ont `search_path=''`.
- `private` est absent des schémas exposés Data API.
- Le RPC public `public.teaches_student(uuid)` n'existe plus ; la policy utilise `private.teaches_student(uuid)`.
- Les grants INSERT restent révoqués pour anon/authenticated et restent disponibles au propriétaire/service_role pour les flux serveur.
- Aucun test n'est considéré comme réussi en production sur la seule base de simulations de privilèges.
