# NEXUS SCIENCE — tests locaux de sécurisation backend

- Dépôt : `moses-kasonga/Nexus-science`
- Branche : `security/backend-hardening-2026-11-16`
- Migration contrôlée : `supabase/migrations/20261116000200_backend_security_hardening.sql`
- Emplacement à copier tel quel : `tests/security/backend-hardening/`

## État de préparation

Le runner est strictement **post-reconstruction** : il ne démarre pas Supabase, ne réinitialise pas PostgreSQL et n'applique aucune migration. Il exige que la migration cible soit déjà enregistrée dans l'historique de la base locale.

L'inspection du dépôt a révélé que `supabase/config.toml` est absent. Le baseline `20261108000000_baseline_schema.sql` indique qu'il reconstitue l'état du schéma et ne représente pas l'historique complet des migrations d'origine. **Ne pas inventer le config, ne pas convertir le baseline en historique, ne pas sauter ou modifier une migration antérieure qui échoue.** Le runner s'arrête si `supabase/config.toml` manque.

## Fichiers

- `tests/security/backend-hardening/run-tests.sh` : runner Bash, signup Auth local et nettoyage trap.
- `tests/security/backend-hardening/backend-hardening-tests.sql` : assertions SQL transactionnelles, terminées par `ROLLBACK`.
- `tests/security/backend-hardening/assert-local-db-url.py` : parseur fail-closed et normalisation d'URI PostgreSQL.
- `tests/security/backend-hardening/expected-results.md` : couverture et résultats attendus.

## Prérequis

Bash, Git, Supabase CLI, Docker opérationnel, `curl`, `jq`, `psql`, `openssl`, `python3`, configuration locale Supabase autoritative et historique complet des migrations. La stack locale doit avoir été reconstruite par le processus normal sur une base jetable. Aucun secret `service_role` n'est utilisé.

## Commandes

Depuis la racine du dépôt, après copie de l'archive en conservant sa structure :

```bash
git branch --show-current
bash -n tests/security/backend-hardening/run-tests.sh
python3 -m py_compile tests/security/backend-hardening/assert-local-db-url.py
```

La reconstruction de la base locale (opération destructive pour les données locales) est distincte du runner. Seulement après validation indépendante de la configuration et de l'historique :

```bash
supabase start
supabase status
supabase db reset
```

Si une migration historique échoue, arrêter et diagnostiquer. Ne pas la sauter, la renommer, réordonner ou modifier son contenu.

Après reconstruction complète et application naturelle de la migration cible :

```bash
bash tests/security/backend-hardening/run-tests.sh
```

Le runner ne contient aucune commande d'application de migration : pas de `supabase db push`, `supabase migration up`, `supabase link`, `--linked`, `--remote`, `--project-ref`, déploiement Edge Function ou Vercel. Il ne fait qu'un `supabase status -o env` local, vérifie l'historique, crée des utilisateurs Auth par l'API locale, puis exécute le SQL.

## Garde-fous réseau et PostgreSQL

Le parseur n'accepte que `postgres://` ou `postgresql://`, avec utilisateur, base et hôte explicites. Seuls `localhost` et les IP littérales loopback sont acceptés. Les paramètres query (notamment `host`, `hostaddr`, `service`) et fragments sont refusés ; les hôtes qui contiennent simplement le texte `localhost` sont rejetés. `localhost` est résolu puis remplacé par une IP loopback littérale, afin que libpq n'effectue pas une seconde résolution.

Chaque invocation `psql` est lancée dans `env -i` : les variables libpq et fichiers de service ne peuvent pas surcharger l'hôte. L'API doit aussi être loopback ; son IP peer réelle est contrôlée et les requêtes Auth sont ensuite épinglées à cette IP. Les proxys et fichiers de configuration curl sont désactivés.

Les seuls remplacements de variables permis sont `LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_DB_URL` et `LOCAL_SUPABASE_ANON_KEY`, tous soumis aux contrôles de destination. Ne jamais fournir de secrets Production.

## Nettoyage Auth

La fonction `signup` est appelée dans le shell principal, sans substitution de commande : chaque UUID est ajouté directement à `CREATED_IDS`. Le trap `EXIT` supprime chaque UUID, puis effectue un nettoyage de secours sur le préfixe email aléatoire propre à l'exécution (utile si Auth a créé un compte mais que la réponse HTTP a été interrompue avant la lecture de l'UUID).

Le nettoyage est exécuté après une erreur de signup, un échec SQL ou une interruption INT/TERM. Chaque échec est explicitement signalé et force un code de sortie non nul. Toutes les suppressions passent par le même garde-fou PostgreSQL loopback et ciblent uniquement `auth.users` de la base locale. Si le nettoyage échoue, vérifier manuellement uniquement la base locale jetable.

## Couverture et limites

Les assertions couvrent les colonnes et tables visibles dans les migrations du dépôt : `profiles`, `courses`, `course_teachers`, `enrollments`, `homepage_content_drafts`, `homepage_content_published`. Elles couvrent signup/profile, INSERT interdit, RLS étudiant/enseignant/admin, UPDATE des colonnes permises, helper privé, trigger de rôle, publication, ACL, `SECURITY DEFINER` et `search_path=''`.

La configuration des schémas exposés PostgREST peut rester `MANUEL` si `pgrst.db_schemas` n'est pas lisible en SQL. Il faut confirmer dans la configuration locale/API que `private` est absent des Exposed schemas et vérifier le RPC via l'API locale. Cette suite ne prouve pas les flux frontend ou externes.

**Aucun test n'est réputé réussi avant exécution explicite sur une stack locale jetable reconstruite depuis l'historique complet.**
