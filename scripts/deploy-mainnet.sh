#!/usr/bin/env bash
# Deploy Floodgate to Stellar mainnet. See deploy.sh for options.
NETWORK=mainnet exec "$(dirname "$0")/deploy.sh" "$@"
