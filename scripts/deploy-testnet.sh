#!/usr/bin/env bash
# Deploy Floodgate to Stellar testnet. See deploy.sh for options.
NETWORK=testnet exec "$(dirname "$0")/deploy.sh" "$@"
