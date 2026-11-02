#!/usr/bin/env bash
# Deploy a Floodgate vault to Stellar testnet or mainnet.
# Use scripts/deploy-testnet.sh or scripts/deploy-mainnet.sh.
#
# This script never reads or prints secret keys.
#
# Environment:
#   NETWORK           testnet | mainnet
#   STELLAR_RPC_URL   RPC URL. Defaults to SDF's testnet RPC. Required for mainnet.
#   SOURCE            stellar-cli identity that pays for and signs the deploy.
#                     On testnet it defaults to "floodgate-testnet", created and funded by friendbot.
#                     On mainnet create it yourself: stellar keys add <name>
#   ADMIN             Address that can change limits/roles and resume. Use a multisig on mainnet.
#   GUARDIAN          Address that can pause and cancel
#   OPERATOR          Address that can request releases
#                     On testnet all three default to the SOURCE address.
#   SEED=1            Testnet only: deposit and make sample releases so the console has data.
#   YES=1             Skip the confirmation prompt (testnet only).
#
# Optional (defaults shown):
#   TOKEN_ASSET=native        Classic asset for the vault token: "native" or "CODE:ISSUER"
#   TOKEN_ID=                 Or a token contract ID (C…). Overrides TOKEN_ASSET.
#   DECIMALS=7
#   WINDOW_SECS=3600          Accounting window, seconds
#   WINDOW_CAP=1000           Instant cap per window, whole tokens
#   LARGE_THRESHOLD=500       Releases this size or more always wait, whole tokens
#   DELAY_SECS=86400          Wait time for queued releases, seconds (900 on testnet)
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }
command -v stellar >/dev/null || die "stellar-cli is not installed. See DEPLOY.md."
command -v python3 >/dev/null || die "python3 is needed to convert amounts."

case "$NETWORK" in
  testnet)
    PASSPHRASE="Test SDF Network ; September 2015"
    STELLAR_RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
    EXPLORER="testnet"
    SOURCE="${SOURCE:-floodgate-testnet}"
    if ! stellar keys address "$SOURCE" >/dev/null 2>&1; then
      echo "Creating test identity $SOURCE and funding it with friendbot…"
      stellar keys generate "$SOURCE" --network testnet --fund
    fi
    ME="$(stellar keys address "$SOURCE")"
    ADMIN="${ADMIN:-$ME}"; GUARDIAN="${GUARDIAN:-$ME}"; OPERATOR="${OPERATOR:-$ME}"
    ;;
  mainnet)
    PASSPHRASE="Public Global Stellar Network ; September 2015"
    EXPLORER="public"
    : "${STELLAR_RPC_URL:?set STELLAR_RPC_URL to a mainnet RPC URL}"
    : "${SOURCE:?set SOURCE to your stellar-cli identity name}"
    : "${ADMIN:?set ADMIN}"; : "${GUARDIAN:?set GUARDIAN}"; : "${OPERATOR:?set OPERATOR}"
    ;;
  *) die "NETWORK must be testnet or mainnet" ;;
esac

TOKEN_ASSET="${TOKEN_ASSET:-native}"
DECIMALS="${DECIMALS:-7}"
WINDOW_SECS="${WINDOW_SECS:-3600}"
WINDOW_CAP="${WINDOW_CAP:-1000}"
LARGE_THRESHOLD="${LARGE_THRESHOLD:-500}"
# Testnet uses a short wait so queued releases unlock while you watch.
if [ "$NETWORK" = testnet ]; then DELAY_SECS="${DELAY_SECS:-900}"; else DELAY_SECS="${DELAY_SECS:-86400}"; fi

# The CLI's built-in testnet profile handles slow RPC responses better than raw flags.
if [ "$NETWORK" = testnet ] && [ "$STELLAR_RPC_URL" = "https://soroban-testnet.stellar.org" ]; then
  NET=(--network testnet)
else
  NET=(--rpc-url "$STELLAR_RPC_URL" --network-passphrase "$PASSPHRASE")
fi

units() { python3 -c "from decimal import Decimal as D; import sys; print(int(D(sys.argv[1]) * 10**int(sys.argv[2])))" "$1" "$DECIMALS"; }

if [ -n "${TOKEN_ID:-}" ]; then
  TOKEN="$TOKEN_ID"
else
  TOKEN="$(stellar contract id asset --asset "$TOKEN_ASSET" "${NET[@]}")"
fi

CONFIG=$(printf '{"window_secs":%s,"window_cap":"%s","large_threshold":"%s","delay_secs":%s}' \
  "$WINDOW_SECS" "$(units "$WINDOW_CAP")" "$(units "$LARGE_THRESHOLD")" "$DELAY_SECS")

cat <<SUMMARY

  Floodgate deploy on $NETWORK
  ----------------------------
  Signer identity : $SOURCE ($(stellar keys address "$SOURCE"))
  Admin           : $ADMIN
  Guardian        : $GUARDIAN
  Operator        : $OPERATOR
  Token           : $TOKEN ($TOKEN_ASSET)
  Window          : $WINDOW_SECS s
  Instant cap     : $WINDOW_CAP per window
  Queue from      : $LARGE_THRESHOLD
  Wait            : $DELAY_SECS s

SUMMARY
if [ "$NETWORK" = mainnet ]; then
  echo "  WARNING: Floodgate v0.1 has NOT been audited. Funds you deposit are at risk."
  echo "  This deploy spends real XLM from the signer account."
  echo
  read -r -p "Type DEPLOY to continue: " answer
  [ "$answer" = "DEPLOY" ] || die "cancelled"
elif [ "${YES:-}" != 1 ]; then
  read -r -p "Deploy to testnet? [y/N] " answer
  [ "$answer" = y ] || [ "$answer" = Y ] || die "cancelled"
fi

echo "Building wasm…"
(cd "$ROOT" && stellar contract build)
WASM="$ROOT/target/wasm32v1-none/release/soroban_floodgate.wasm"
[ -f "$WASM" ] || die "wasm not found at $WASM"

echo "Deploying…"
ID="$(stellar contract deploy --wasm "$WASM" --source "$SOURCE" "${NET[@]}" --alias "floodgate-vault-$NETWORK" \
  -- --admin "$ADMIN" --guardian "$GUARDIAN" --operator "$OPERATOR" --token "$TOKEN" --config "$CONFIG")"

echo
echo "Vault deployed: $ID"
echo "Explorer: https://stellar.expert/explorer/$EXPLORER/contract/$ID"

if [ "$NETWORK" = testnet ] && [ "${SEED:-}" = 1 ]; then
  echo "Seeding sample activity…"
  # Retry on RPC timeouts; slow connections often time out while waiting for the ledger.
  inv() {
    for _ in 1 2 3; do
      if out="$(stellar contract invoke --id "$ID" --source "$SOURCE" "${NET[@]}" -- "$@" 2>&1)"; then echo "$out" | tail -1; return 0; fi
      grep -q "timeout" <<<"$out" || { echo "$out" >&2; return 1; }
      sleep 4
    done
    echo "warning: $1 timed out three times; it may still have landed" >&2
  }
  ME="$(stellar keys address "$SOURCE")"
  inv deposit --from "$ME" --amount "$(units 2000)"
  for amt in 120 75 210; do inv release --to "$ME" --amount "$(units "$amt")"; done
  inv release --to "$ME" --amount "$(units 650)"   # over the single-release limit, so it waits
  inv release --to "$ME" --amount "$(units 900)"   # waits too
  inv cancel --id 1
fi

# Point the web app at this network and contract.
if [ "$NETWORK" = mainnet ]; then
  printf 'VITE_NETWORK=mainnet\nVITE_CONTRACT_ID=%s\n' "$ID" > "$ROOT/ui/.env.production"
  printf 'VITE_RPC_URL=%s\n' "$STELLAR_RPC_URL" > "$ROOT/ui/.env.production.local"
  echo "Wrote ui/.env.production (commit it) and ui/.env.production.local (RPC URL, not committed)."
else
  printf 'VITE_NETWORK=testnet\nVITE_CONTRACT_ID=%s\n' "$ID" > "$ROOT/ui/.env"
  echo "Wrote ui/.env (commit it). Run: cd ui && npm run dev"
fi
