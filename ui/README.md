# Floodgate Console

Web console for a deployed Floodgate vault. It shows how much can leave the vault right now, lists waiting releases, and lets the connected account deposit, release, pay out, cancel, pause and resume.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/
```

Open **Settings** and enter the vault contract ID, or set it at build time:

```sh
VITE_CONTRACT_ID=C... npm run build
```

## Requirements

- [Freighter](https://freighter.app) browser wallet, set to the same network as the console.
- A Stellar RPC URL. Testnet uses `https://soroban-testnet.stellar.org` by default. Mainnet needs your own RPC or a provider's.

## How it reads data

- Vault state comes from the contract's views (`config`, `paused`, `remaining`, `token`) through RPC simulation, so reading costs nothing and needs no wallet.
- The release queue comes from the `queued`, `executed` and `cancelled` events through RPC `getEvents`. RPC servers keep events for a limited time (about 7 days on SDF's testnet RPC), so older queue entries may not show.
- The contract has no role views yet, so the console does not know who the admin, guardian or operator is. The contract rejects calls from the wrong account, and the console shows that error.
