#!/usr/bin/env bash
set -Eeuo pipefail
BRANCH='security/backend-hardening-2026-11-16'
MIGRATION='supabase/migrations/20261116000200_backend_security_hardening.sql'
DIR='tests/security/backend-hardening'
SQL="$DIR/backend-hardening-tests.sql"
GUARD="$DIR/assert-local-db-url.py"
fail(){ echo "ERREUR: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || fail "outil absent: $1"; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'clone Git Nexus-science requis'
cd "$ROOT"
REMOTE="$(git remote get-url origin 2>/dev/null || true)"
case "$REMOTE" in
  https://github.com/moses-kasonga/Nexus-science|https://github.com/moses-kasonga/Nexus-science.git|git@github.com:moses-kasonga/Nexus-science|git@github.com:moses-kasonga/Nexus-science.git|ssh://git@github.com/moses-kasonga/Nexus-science|ssh://git@github.com/moses-kasonga/Nexus-science.git) ;;
  *) fail 'origin ne correspond pas exactement au dépôt autorisé' ;;
esac
[[ "$(git branch --show-current)" == "$BRANCH" ]] || fail "branche attendue: $BRANCH"
[[ -f "$MIGRATION" && -f "$SQL" && -f "$GUARD" ]] || fail 'migration ou fichier de test absent'
[[ -f supabase/config.toml ]] || fail 'supabase/config.toml absent : arrêt, ne pas le recréer'
for x in supabase curl jq psql openssl python3; do need "$x"; done

# Status local seulement. Aucun link, project-ref, remote ou apply.
STATUS="$(supabase status -o env 2>/dev/null)" || fail 'stack Supabase locale non démarrée'
getv(){ printf '%s\n' "$STATUS" | sed -n "s/^$1=//p" | head -1 | sed -E 's/^"(.*)"$/\1/;s/^\x27(.*)\x27$/\1/'; }
API_URL="\${LOCAL_SUPABASE_URL:-$(getv API_URL)}"
DB_URL="\${LOCAL_SUPABASE_DB_URL:-$(getv DB_URL)}"
ANON_KEY="\${LOCAL_SUPABASE_ANON_KEY:-$(getv ANON_KEY)}"
[[ -n "$API_URL" && -n "$DB_URL" && -n "$ANON_KEY" ]] || fail 'URL/API key locale manquante'

# API : URL loopback only, puis épinglage sur l'IP peer réellement observée.
python3 - "$API_URL" <<'PY'
import ipaddress,socket,sys
from urllib.parse import urlsplit
try:
 u=urlsplit(sys.argv[1]); h=u.hostname
 if u.scheme!='http' or not h or u.username or u.password or u.query or u.fragment or u.path not in ('','/'): raise ValueError()
 if h.lower()=='localhost':
  a={x[4][0] for x in socket.getaddrinfo(h,u.port or 80,type=socket.SOCK_STREAM)}
  if not a or any(not ipaddress.ip_address(v.split('%',1)[0]).is_loopback for v in a): raise ValueError()
 elif not ipaddress.ip_address(h).is_loopback: raise ValueError()
except Exception:
 print('API_URL doit être localhost ou une IP loopback explicite.',file=sys.stderr); raise SystemExit(2)
PY

# Normaliser localhost en IP littérale ; aucune surcharge libpq ne peut modifier la cible.
DB_URL="$(python3 "$GUARD" "$DB_URL")" || fail 'URI PostgreSQL non locale ou ambiguë'
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGOPTIONS PGSSLMODE PGCHANNELBINDING PGTARGETSESSIONATTRS PGCONNECT_TIMEOUT PGAPPNAME PGCLIENTENCODING PGSYSCONFDIR PGREQUIREAUTH PGGSSENCMODE PGKRBSRVNAME PGREALM PGSSLROOTCERT PGSSLCERT PGSSLKEY
validate_db(){ python3 "$GUARD" "$DB_URL" >/dev/null || fail 'cible PostgreSQL refusée'; }
psql_local(){ validate_db; env -i PATH="$PATH" HOME="\${HOME:-/tmp}" LANG=C LC_ALL=C psql "$DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }

API_IP="$(env -i PATH="$PATH" HOME="\${HOME:-/tmp}" LANG=C LC_ALL=C curl -q --noproxy '*' --connect-timeout 5 --max-time 15 -fsS -o /dev/null -w '%{remote_ip}' "$API_URL/auth/v1/health")" || fail 'API/Auth locale indisponible'
API_URL="$(python3 - "$API_IP" "$API_URL" <<'PY'
import ipaddress,sys
from urllib.parse import urlsplit
ip=ipaddress.ip_address(sys.argv[1])
if not ip.is_loopback: raise SystemExit('API peer non loopback')
u=urlsplit(sys.argv[2]); h=f'[{ip.compressed}]' if ip.version==6 else ip.compressed
print(f'http://{h}:{u.port or 80}')
PY
)" || fail 'API peer non locale'

APPLIED="$(psql_local -Atqc "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261116000200'")" || fail 'historique local inaccessible'
[[ "$APPLIED" == 1 ]] || fail 'migration cible non enregistrée localement ; aucune application ne sera tentée'

SUFFIX="$(openssl rand -hex 6)"
EMAIL_PREFIX="nexus-hardening-$SUFFIX-"
PASSWORD="$(openssl rand -hex 24)Aa9!"
CREATED_IDS=()
LAST_ID=''
CLEANUP_FAILED=0
cleanup(){
 local id
 printf 'Nettoyage Auth local…\n' >&2
 for id in "\${CREATED_IDS[@]}"; do
  [[ "$id" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "ERREUR NETTOYAGE: UUID invalide $id" >&2; CLEANUP_FAILED=1; continue; }
  psql_local -c "DELETE FROM auth.users WHERE id = '$id'::uuid" >/dev/null || { echo "ERREUR NETTOYAGE: suppression impossible pour $id" >&2; CLEANUP_FAILED=1; }
 done
 psql_local -c "DELETE FROM auth.users WHERE email LIKE '$EMAIL_PREFIX%'" >/dev/null || { echo 'ERREUR NETTOYAGE: suppression de secours par email impossible' >&2; CLEANUP_FAILED=1; }
 if ((CLEANUP_FAILED)); then echo 'ÉCHEC: nettoyage incomplet ; vérifier uniquement la base locale.' >&2; return 1; fi
 echo 'Nettoyage local terminé.' >&2
}
on_exit(){ local rc="$1"; trap - EXIT; set +e; cleanup; (( $? == 0 )) || rc=1; exit "$rc"; }
trap 'on_exit $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

signup(){
 local label="$1" email="$2" body response id
 body="$(jq -n --arg e "$email" --arg p "$PASSWORD" '{email:$e,password:$p,data:{first_name:"Nexus",last_name:"Security Test"}}')"
 response="$(env -i PATH="$PATH" HOME="\${HOME:-/tmp}" LANG=C LC_ALL=C curl -q --noproxy '*' -fsS "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "$body")" || fail "signup local échoué: $label"
 id="$(printf '%s' "$response" | jq -r '.id // .user.id // empty')"
 [[ "$id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "UUID Auth invalide pour $label (nettoyage email de secours actif)"
 CREATED_IDS+=("$id")
 LAST_ID="$id"
}
signup student "$EMAIL_PREFIX"student@nexus.invalid; STUDENT_ID="$LAST_ID"
signup other "$EMAIL_PREFIX"other@nexus.invalid; OTHER_ID="$LAST_ID"
signup teacher "$EMAIL_PREFIX"teacher@nexus.invalid; TEACHER_ID="$LAST_ID"
signup admin "$EMAIL_PREFIX"admin@nexus.invalid; ADMIN_ID="$LAST_ID"
psql_local -v student_id="$STUDENT_ID" -v other_id="$OTHER_ID" -v teacher_id="$TEACHER_ID" -v admin_id="$ADMIN_ID" -f "$SQL"
