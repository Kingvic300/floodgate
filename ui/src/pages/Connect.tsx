import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { navigate } from "../lib/router";
import { PRESETS, describeError } from "../lib/stellar";
import { WALLETS, useWallet, type WalletId } from "../lib/wallet";

/** Wallet sign-in. Shared shape across projects; brand content comes in as props. */
export function Connect(props: { brand: ReactNode; title: string; lede: string; points: string[]; next?: string }) {
  const { connect, net, setNet, address } = useWallet();
  const [found, setFound] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<WalletId | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void Promise.all(WALLETS.map(async (w) => [w.id, await w.detect()] as const)).then((pairs) => {
      if (live) setFound(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (address) navigate(props.next ?? "/app");
  }, [address, props.next]);

  async function go(id: WalletId) {
    setBusy(id);
    setError("");
    try {
      await connect(id);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="connect">
      <aside className="connect-side">
        {props.brand}
        <div className="connect-copy">
          <h1>{props.title}</h1>
          <p>{props.lede}</p>
          <ul>
            {props.points.map((p) => (
              <li key={p}>
                <Icon name="check" size={18} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="connect-main">
        <div className="connect-card">
          <h2>Connect a wallet</h2>
          <p className="muted">Choose the wallet that holds your Stellar account.</p>

          <div className="segmented" role="radiogroup" aria-label="Network">
            {(["testnet", "mainnet"] as const).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={net.network === n}
                className={net.network === n ? "on" : ""}
                onClick={() =>
                  setNet(n === "testnet" ? PRESETS.testnet : { ...PRESETS.mainnet, rpcUrl: net.network === "mainnet" ? net.rpcUrl : "" })
                }
              >
                {n === "testnet" ? "Testnet" : "Mainnet"}
              </button>
            ))}
          </div>
          {net.network === "mainnet" && (
            <label className="field">
              Mainnet RPC URL
              <input
                value={net.rpcUrl}
                placeholder="https://your-rpc-provider…"
                onChange={(e) => setNet({ ...net, rpcUrl: e.target.value.trim() })}
              />
              <span className="hint">SDF runs no public mainnet RPC. Use your own node or a provider.</span>
            </label>
          )}

          <ul className="wallet-list">
            {WALLETS.map((w) => {
              const ok = found[w.id];
              return (
                <li key={w.id}>
                  <button
                    className="wallet-option"
                    onClick={() => void go(w.id)}
                    disabled={!!busy || ok === false || (net.network === "mainnet" && !net.rpcUrl)}
                  >
                    <span className={`wallet-logo ${w.id}`} aria-hidden="true">
                      {w.name.charAt(0)}
                    </span>
                    <span className="wallet-text">
                      <strong>{w.name}</strong>
                      <span>{w.blurb}</span>
                    </span>
                    <span className="wallet-state">
                      {busy === w.id ? "Waiting for wallet…" : ok === undefined ? "Checking…" : ok ? w.kind : "Not installed"}
                    </span>
                  </button>
                  {ok === false && (
                    <a className="install" href={w.url} target="_blank" rel="noreferrer">
                      Install {w.name} <Icon name="external" size={14} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>

          {error && (
            <p className="note err" role="alert">
              {error}
            </p>
          )}
          <p className="fine">
            Connecting shares only your public address. Every transaction asks your wallet for approval first.
          </p>
        </div>
      </main>
    </div>
  );
}
