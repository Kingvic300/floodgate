# Deploying Floodgate to mainnet

Floodgate v0.1 is **not audited**. A vault on mainnet holds real funds. Start with small caps and amounts, and plan an audit through the SCF Audit Bank before holding anything significant.

## 1. Install stellar-cli

```sh
sudo apt install -y libudev-dev libdbus-1-dev pkg-config build-essential
cargo install --locked stellar-cli
stellar --version
```

Or install the `.deb` package from the [stellar-cli releases](https://github.com/stellar/stellar-cli/releases).

## 2. Add your signing key

```sh
stellar keys add deployer
```

Enter your secret key or seed phrase when prompted. It stays in stellar-cli's key store on your machine. The account must hold enough XLM for the deploy fees and the minimum reserve.

## 3. Get a mainnet RPC URL

SDF runs no public mainnet RPC. Pick a provider from the [Stellar RPC providers list](https://developers.stellar.org/docs/data/rpc/rpc-providers) and copy your endpoint URL.

## 4. Deploy

```sh
export STELLAR_RPC_URL="https://your-provider-endpoint"
export SOURCE=deployer
export ADMIN=G...        # a multisig is strongly recommended
export GUARDIAN=G...     # watcher bot or security council
export OPERATOR=G...     # the account or contract that pays users

# Vault token and limits (defaults shown)
export TOKEN_ASSET=native          # or CODE:ISSUER for a classic asset, or set TOKEN_ID=C...
export WINDOW_SECS=3600            # 1 hour
export WINDOW_CAP=1000             # whole tokens per window paid instantly
export LARGE_THRESHOLD=500         # releases this size or larger always wait
export DELAY_SECS=86400            # 24 hour wait

./scripts/deploy-mainnet.sh
```

The script shows a summary and asks you to type `DEPLOY`. It then builds the wasm, deploys with your key, and prints the vault contract ID.

## 5. Build the web app for mainnet

The script writes `ui/.env.production` (network and vault ID, safe to commit) and `ui/.env.production.local` (your RPC URL, not committed).

```sh
cd ui
npm install
npm run build      # static site in ui/dist, defaults to mainnet and your vault
```

Host `ui/dist` on any static host, such as GitHub Pages, Netlify or Vercel. Note that the RPC URL is visible to anyone who opens the site, so use a provider key you are willing to expose, or put the RPC behind your own proxy.
