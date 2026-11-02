# Floodgate web app

Marketing site and console for Floodgate vaults, in one static React app.

## Pages

- **Landing (`#/`)**: what Floodgate does, how a release moves through the gate, features, developer quick start and FAQ.
- **Connect (`#/connect`)**: sign in with Freighter, LOBSTR or Albedo, on testnet or mainnet.
- **Console (`#/app/…`)**:
  - **Overview**: instant-cap gauge, vault balance, waiting releases, next unlock, recent activity, and deposit or release.
  - **Releases**: the time-locked queue with filters, unlock progress, pay out and cancel.
  - **Activity**: every vault event, grouped by day, with explorer links.
  - **Controls**: pause and resume, change limits, assign roles.
  - **Settings**: saved vaults, network and RPC, wallet.
- **Demo mode**: "Explore the live demo" opens the console with sample data. It needs no wallet and sends nothing to the network.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/
```

Add a vault from the console, or set a default at build time:

```sh
VITE_CONTRACT_ID=C... npm run build
```

## Notes

- Vault state is read through RPC simulation, so reading is free and needs no signature.
- The queue and activity come from contract events through RPC `getEvents`. RPC servers keep events for a limited time (about 7 days on SDF's testnet RPC).
- Mainnet needs your own RPC URL. SDF runs no public mainnet RPC.
- LOBSTR and Albedo support is wired through their official packages but has not been tested against a live vault yet.
