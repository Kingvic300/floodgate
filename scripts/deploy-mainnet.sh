#!/usr/bin/env bash
# Deploy a Floodgate vault to Stellar mainnet.
#
# You sign with your own key. This script never reads or prints secret keys.
#
# Required environment:
#   STELLAR_RPC_URL   Mainnet RPC URL from a provider (SDF runs no public mainnet RPC)
#   SOURCE            stellar-cli identity that pays for and signs the deploy
#                     (create it with: stellar keys add <name>)
#   ADMIN             Address that can change limits/roles and resume. Use a multisig.
#   GUARDIAN          Address that can pause and cancel
#   OPERATOR          Address that can request releases
#
# Optional (defaults shown):
#   TOKEN_ASSET=native        Classic asset for the vault token: "native" or "CODE:ISSUER"
#   TOKEN_ID=                 Or a token contract ID (C…). Overrides TOKEN_ASSET.
#   DECIMALS=7
#   WINDOW_SECS=3600          Accounting window, seconds
#   WINDOW_CAP=1000           Instant cap per window, whole tokens
#   LARGE_THRESHOLD=500       Releases this size or more always wait, whole tokens
#   DELAY_SECS=86400          Wait time for queued releases, seconds
set -euo pipefail

PASSPHRASE="Public Global Stellar Network ; September 2015"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }
command -v stellar >/dev/null || die "stellar-cli is not installed. See README > Build and test."
command -v python3 >/dev/null || die "python3 is needed to convert amounts."

: "${STELLAR_RPC_URL:?set STELLAR_RPC_URL to a mainnet RPC URL}"
: "${SOURCE:?set SOURCE to your stellar-cli identity name}"
: "${ADMIN:?set ADMIN}"
GUARDIAN="${GUARDIAN:-}"
[ -n "$GUARDIAN" ] || die "set GUARDIAN"
: "${OPERATOR:?set OPERATOR}"

TOKEN_ASSET="${TOKEN_ASSET:-native}"
DECIMALS="${DECIMALS:-7}"
WINDOW_SECS="${WINDOW_SECS:-3600}"
WINDOW_CAP="${WINDOW_CAP:-1000}"
LARGE_THRESHOLD="${LARGE_THRESHOLD:-500}"
DELAY_SECS="${DELAY_SECS:-86400}"

NET=(--rpc-url "$STELLAR_RPC_URL" --network-passphrase "$PASSPHRASE")

units() { python3 -c "from decimal import Decimal as D; import sys; print(int(D(sys.argv[1]) * 10**int(sys.argv[2])))" "$1" "$DECIMALS"; }

if [ -n "${TOKEN_ID:-}" ]; then
  TOKEN="$TOKEN_ID"
else
  TOKEN="$(stellar contract id asset --asset "$TOKEN_ASSET" "${NET[@]}")"
fi

CONFIG=$(printf '{"window_secs":%s,"window_cap":"%s","large_threshold":"%s","delay_secs":%s}' \
  "$WINDOW_SECS" "$(units "$WINDOW_CAP")" "$(units "$LARGE_THRESHOLD")" "$DELAY_SECS")

cat <<SUMMARY

  Floodgate MAINNET deploy
  ------------------------
  Signer identity : $SOURCE ($(stellar keys address "$SOURCE"))
  Admin           : $ADMIN
  Guardian        : $GUARDIAN
  Operator        : $OPERATOR
  Token           : $TOKEN ($TOKEN_ASSET)
  Window          : $WINDOW_SECS s
  Instant cap     : $WINDOW_CAP per window
  Queue from      : $LARGE_THRESHOLD
  Wait            : $DELAY_SECS s

  WARNING: Floodgate v0.1 has NOT been audited. Funds you deposit are at risk.
  This deploy spends real XLM from the signer account.

SUMMARY
read -r -p "Type DEPLOY to continue: " answer
[ "$answer" = "DEPLOY" ] || die "cancelled"

echo "Building wasm…"
(cd "$ROOT" && stellar contract build)
WASM="$ROOT/target/wasm32v1-none/release/soroban_floodgate.wasm"
[ -f "$WASM" ] || die "wasm not found at $WASM"

echo "Deploying…"
ID="$(stellar contract deploy --wasm "$WASM" --source "$SOURCE" "${NET[@]}" --alias floodgate \
  -- --admin "$ADMIN" --guardian "$GUARDIAN" --operator "$OPERATOR" --token "$TOKEN" --config "$CONFIG")"

echo
echo "Vault deployed: $ID"
echo "Explorer: https://stellar.expert/explorer/public/contract/$ID"

# Point the web app at mainnet and this vault.
cat > "$ROOT/ui/.env.production" <<ENV
VITE_NETWORK=mainnet
VITE_CONTRACT_ID=$ID
ENV
printf 'VITE_RPC_URL=%s\n' "$STELLAR_RPC_URL" > "$ROOT/ui/.env.production.local"
echo "Wrote ui/.env.production (commit it) and ui/.env.production.local (RPC URL, not committed)."
