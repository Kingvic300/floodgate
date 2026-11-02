import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as freighter from "@stellar/freighter-api";
import * as lobstr from "@lobstrco/signer-extension-api";
import albedo from "@albedo-link/intent";
import { Networks } from "@stellar/stellar-sdk";
import { PRESETS, type NetSettings, type Signer, loadJSON, saveJSON } from "./stellar";
import { DEMO_ADDRESS } from "./demo";

export type WalletId = "freighter" | "lobstr" | "albedo";

export interface WalletOption {
  id: WalletId;
  name: string;
  blurb: string;
  kind: "Browser extension" | "Web wallet";
  url: string;
  detect: () => Promise<boolean>;
  connect: (net: NetSettings) => Promise<string>;
  sign: (txXdr: string, net: NetSettings, address: string) => Promise<string>;
}

function albedoNetwork(net: NetSettings): string {
  if (net.passphrase === Networks.TESTNET) return "testnet";
  if (net.passphrase === Networks.PUBLIC) return "public";
  return net.passphrase;
}

export const WALLETS: WalletOption[] = [
  {
    id: "freighter",
    name: "Freighter",
    blurb: "Stellar's own browser wallet, made by SDF.",
    kind: "Browser extension",
    url: "https://freighter.app",
    detect: async () => {
      try {
        return (await freighter.isConnected()).isConnected;
      } catch {
        return false;
      }
    },
    connect: async () => {
      const res = await freighter.requestAccess();
      if (res.error) throw new Error(res.error.message ?? "Freighter refused access.");
      if (!res.address) throw new Error("Freighter returned no address. Unlock Freighter and try again.");
      return res.address;
    },
    sign: async (txXdr, net, address) => {
      const res = await freighter.signTransaction(txXdr, { networkPassphrase: net.passphrase, address });
      if (res.error) throw new Error(res.error.message ?? "Freighter did not sign.");
      return res.signedTxXdr;
    },
  },
  {
    id: "lobstr",
    name: "LOBSTR",
    blurb: "The LOBSTR signer extension, linked to the LOBSTR app.",
    kind: "Browser extension",
    url: "https://lobstr.co",
    detect: async () => {
      try {
        return await lobstr.isConnected();
      } catch {
        return false;
      }
    },
    connect: async () => {
      const key = await lobstr.getPublicKey();
      if (!key) throw new Error("LOBSTR returned no address.");
      return key;
    },
    sign: async (txXdr) => lobstr.signTransaction(txXdr),
  },
  {
    id: "albedo",
    name: "Albedo",
    blurb: "Signs in a pop-up window. Nothing to install.",
    kind: "Web wallet",
    url: "https://albedo.link",
    detect: async () => true,
    connect: async () => (await albedo.publicKey({})).pubkey,
    sign: async (txXdr, net, address) =>
      (await albedo.tx({ xdr: txXdr, pubkey: address, network: albedoNetwork(net) })).signed_envelope_xdr,
  },
];

/** Network the app starts on. Production builds made by the deploy script set VITE_NETWORK=mainnet. */
const DEFAULT_NET: NetSettings =
  import.meta.env.VITE_NETWORK === "mainnet"
    ? { ...PRESETS.mainnet, rpcUrl: (import.meta.env.VITE_RPC_URL as string | undefined) ?? "" }
    : PRESETS.testnet;

interface Session {
  walletId?: WalletId;
  address?: string;
  demo?: boolean;
  net: NetSettings;
}

interface WalletContextValue {
  demo: boolean;
  enterDemo: () => void;
  address?: string;
  wallet?: WalletOption;
  net: NetSettings;
  setNet: (n: NetSettings) => void;
  connect: (id: WalletId) => Promise<string>;
  disconnect: () => void;
  signer: Signer;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider(props: { storageKey: string; children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => loadJSON<Session>(props.storageKey, { net: DEFAULT_NET }));

  useEffect(() => saveJSON(props.storageKey, session), [props.storageKey, session]);

  const wallet = WALLETS.find((w) => w.id === session.walletId);

  const connect = useCallback(
    async (id: WalletId) => {
      const w = WALLETS.find((x) => x.id === id)!;
      const address = await w.connect(session.net);
      setSession((s) => ({ net: s.net, walletId: id, address }));
      return address;
    },
    [session.net],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      address: session.address,
      demo: !!session.demo,
      enterDemo: () => setSession((s) => ({ net: s.net, demo: true, address: DEMO_ADDRESS })),
      wallet,
      net: session.net,
      setNet: (net) => setSession((s) => ({ ...s, net })),
      connect,
      disconnect: () => setSession((s) => ({ net: s.net })),
      signer: async (txXdr) => {
        if (session.demo) throw new Error("This is the demo. Connect a wallet to send transactions.");
        if (!wallet || !session.address) throw new Error("Connect a wallet first.");
        return wallet.sign(txXdr, session.net, session.address);
      },
    }),
    [session, wallet, connect],
  );

  return <WalletContext.Provider value={value}>{props.children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
