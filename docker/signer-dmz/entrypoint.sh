#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
export SIGNER_PORT="${SIGNER_PORT:-8081}"
export OIDC_ISSUER="${OIDC_ISSUER:-https://pymthouse.com/api/v1/oidc}"
export OIDC_AUDIENCE="${OIDC_AUDIENCE:-$OIDC_ISSUER}"
export JWKS_URI="${JWKS_URI:-https://pymthouse.com/api/v1/oidc/jwks}"
export JWT_PEM_PATH="${JWT_PEM_PATH:-/run/jwt/jwks.pem}"

if [ -n "${SIGNER_UPSTREAM:-}" ]; then
  export SIGNER_HTTP_ADDR="${SIGNER_UPSTREAM}"
else
  export SIGNER_HTTP_ADDR="http://127.0.0.1:${SIGNER_PORT}"
fi

export SIGNER_CLI_HTTP_ADDR="${SIGNER_CLI_HTTP_ADDR:-http://127.0.0.1:4935}"

mkdir -p /run/jwt
if ! python3 /opt/pymthouse/scripts/jwks_to_pem.py --url "$JWKS_URI" --out "$JWT_PEM_PATH"; then
  echo "entrypoint: JWKS sync failed" >&2
  exit 1
fi

(
  while true; do
    sleep "${JWKS_REFRESH_SECONDS:-900}"
    if python3 /opt/pymthouse/scripts/jwks_to_pem.py --url "$JWKS_URI" --out "${JWT_PEM_PATH}.next" 2>/dev/null; then
      if ! cmp -s "$JWT_PEM_PATH" "${JWT_PEM_PATH}.next"; then
        mv "${JWT_PEM_PATH}.next" "$JWT_PEM_PATH"
        apache2ctl graceful 2>/dev/null || true
      else
        rm -f "${JWT_PEM_PATH}.next"
      fi
    fi
  done
) &

if [ -z "${SIGNER_UPSTREAM:-}" ] && [ -x /usr/local/bin/livepeer ]; then
  if [ ! -f /data/.eth-password ]; then
    echo "" >/data/.eth-password
  fi
  ARGS="-remoteSigner -network=${SIGNER_NETWORK:-arbitrum-one-mainnet} -httpAddr=127.0.0.1:${SIGNER_PORT} -cliAddr=127.0.0.1:4935 -ethUrl=${ETH_RPC_URL:-https://arb1.arbitrum.io/rpc} -ethPassword=/data/.eth-password -datadir=/data -v=99"
  if [ -n "${SIGNER_ETH_ADDR:-}" ]; then
    ARGS="$ARGS -ethAcctAddr=${SIGNER_ETH_ADDR}"
  fi
  if [ "${SIGNER_REMOTE_DISCOVERY:-0}" = "1" ] || [ "${SIGNER_REMOTE_DISCOVERY:-0}" = "true" ]; then
    ARGS="$ARGS -remoteDiscovery=true"
    [ -n "${ORCH_WEBHOOK_URL:-}" ] && ARGS="$ARGS -orchWebhookUrl=${ORCH_WEBHOOK_URL}"
    [ -n "${LIVE_AI_CAP_REPORT_INTERVAL:-}" ] && ARGS="$ARGS -liveAICapReportInterval=${LIVE_AI_CAP_REPORT_INTERVAL}"
  fi
  /usr/local/bin/livepeer $ARGS &
  i=0
  while [ "$i" -lt 60 ]; do
    if curl -sf -X POST "http://127.0.0.1:${SIGNER_PORT}/sign-orchestrator-info" \
      -H "Content-Type: application/json" \
      -d "{}" >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 1
  done
fi

export APACHE_LOG_DIR="${APACHE_LOG_DIR:-/var/log/apache2}"
mkdir -p "$APACHE_LOG_DIR"

envsubst '${PORT} ${SIGNER_HTTP_ADDR} ${SIGNER_CLI_HTTP_ADDR} ${OIDC_ISSUER} ${OIDC_AUDIENCE} ${JWT_PEM_PATH}' < /etc/apache2/templates/ports.conf.in >/etc/apache2/ports.conf
envsubst '${PORT} ${SIGNER_HTTP_ADDR} ${SIGNER_CLI_HTTP_ADDR} ${OIDC_ISSUER} ${OIDC_AUDIENCE} ${JWT_PEM_PATH}' < /etc/apache2/templates/signer-dmz.conf.in >/etc/apache2/sites-available/signer-dmz.conf

a2dissite 000-default 2>/dev/null || true
a2ensite signer-dmz

exec apache2ctl -D FOREGROUND
