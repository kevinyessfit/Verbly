#!/usr/bin/env bash
# Tests manuels des Edge Functions Verbly.
#
#   cp .env.test.local.example .env.test.local   # puis remplis-le
#   export TOKEN=$(./scripts/test-functions.sh token)
#   ./scripts/test-functions.sh gen ./capture.png
#   ./scripts/test-functions.sh gen ./capture.png joueur
#   ./scripts/test-functions.sh quota ./capture.png       # boucle jusqu'au 402
#   ./scripts/test-functions.sh pay month 97000000        # renvoie une reference
#   ./scripts/test-functions.sh confirm <reference>       # crédite le pass
#   ./scripts/test-functions.sh confirm-bad <reference>   # doit renvoyer 401
#
# Chaque commande imprime le corps de la réponse puis le code HTTP.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env.test.local ]; then set -a; . ./.env.test.local; set +a; fi

: "${SUPABASE_URL:?SUPABASE_URL manquant (https://<ref>.supabase.co)}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY manquant}"

FUNCTIONS="$SUPABASE_URL/functions/v1"

b64() { base64 -w0 "$1" 2>/dev/null || base64 "$1" | tr -d '\n'; }

post() {
  # post <fonction> <valeur du header Authorization> <corps json>
  curl -sS -o /dev/stderr -w '\nHTTP %{http_code}\n' \
    -X POST "$FUNCTIONS/$1" \
    -H "Authorization: $2" \
    -H "Content-Type: application/json" \
    -d "$3"
}

# Échange email/mot de passe contre un JWT. Le compte doit exister dans le
# projet Supabase (Auth > Users > Add user).
get_token() {
  curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_USER_EMAIL:?}\",\"password\":\"${TEST_USER_PASSWORD:?}\"}" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}

need_token() {
  if [ -z "${TOKEN:-}" ]; then
    echo 'TOKEN vide. Lance: export TOKEN=$(./scripts/test-functions.sh token)' >&2
    exit 1
  fi
}

call_gen() {
  local img="$1" style="${2:-charmeur}" mime="image/png"
  need_token
  [ -f "$img" ] || { echo "image introuvable: $img" >&2; exit 1; }
  case "$img" in *.jpg|*.jpeg) mime="image/jpeg" ;; esac

  {
    printf '{"image":"'
    b64 "$img"
    printf '","mimeType":"%s","style":"%s"}' "$mime" "$style"
  } | curl -sS -o /dev/stderr -w '\nHTTP %{http_code}\n' \
        -X POST "$FUNCTIONS/generate-replies" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        --data-binary @-
}

case "${1:-}" in
  token)
    get_token
    ;;
  gen)
    call_gen "${2:?chemin de la capture requis}" "${3:-charmeur}"
    ;;
  quota)
    # 3 générations gratuites : la 4e doit répondre 402 {"paywall":true}
    for i in 1 2 3 4; do
      echo "--- appel $i ---" >&2
      call_gen "${2:?chemin de la capture requis}"
    done
    ;;
  pay)
    need_token
    post create-payment "Bearer $TOKEN" \
      "{\"pass\":\"${2:-month}\",\"phone\":\"${3:-97000000}\"}"
    ;;
  confirm)
    post payment-webhook "${PAYMENT_WEBHOOK_SECRET:?}" \
      "{\"reference\":\"${2:?reference requise}\",\"status\":\"succeeded\",\"channel\":\"MTN\"}"
    ;;
  confirm-bad)
    post payment-webhook "mauvais-secret" \
      "{\"reference\":\"${2:?reference requise}\",\"status\":\"succeeded\"}"
    ;;
  *)
    sed -n '2,14p' "$0"
    exit 1
    ;;
esac
