import { useState } from "react";
import { Icon } from "../components/Icon";
import { navigate } from "../lib/router";
import { PRESETS, explorerContract, short } from "../lib/stellar";
import { useVault } from "../lib/vault";
import { useWallet } from "../lib/wallet";
import { AddVault, Copy } from "./shared";

export function SettingsPage() {
  const { net, setNet, address, wallet, disconnect } = useWallet();
  const { vaults, activeId, setActive, removeVault } = useVault();
  const [rpc, setRpc] = useState(net.rpcUrl);

  return (
    <div className="page settings">
      <section className="card">
        <div className="panel-head">
          <h2>Vaults</h2>
        </div>
        {vaults.length === 0 ? (
          <p className="muted">No vaults yet.</p>
        ) : (
          <ul className="vault-rows">
            {vaults.map((v) => {
              const link = explorerContract(net, v.id);
              return (
                <li key={v.id} className={v.id === activeId ? "on" : ""}>
                  <div>
                    <strong>{v.label}</strong>
                    <span className="mono muted">
                      {short(v.id, 8)} <Copy text={v.id} label="Copy contract ID" />
                    </span>
                  </div>
                  <div className="row">
                    {link && (
                      <a className="btn small ghost" href={link} target="_blank" rel="noreferrer">
                        Explorer <Icon name="external" size={14} />
                      </a>
                    )}
                    {v.id !== activeId && (
                      <button className="btn small ghost" onClick={() => setActive(v.id)}>
                        Use
                      </button>
                    )}
                    <button className="btn small danger" onClick={() => removeVault(v.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <AddVault compact />
      </section>

      <section className="card">
        <div className="panel-head">
          <h2>Network</h2>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Network">
          {(["testnet", "mainnet"] as const).map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={net.network === n}
              className={net.network === n ? "on" : ""}
              onClick={() => {
                const next = n === "testnet" ? PRESETS.testnet : { ...PRESETS.mainnet, rpcUrl: net.network === "mainnet" ? net.rpcUrl : "" };
                setNet(next);
                setRpc(next.rpcUrl);
              }}
            >
              {n === "testnet" ? "Testnet" : "Mainnet"}
            </button>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setNet({ ...net, rpcUrl: rpc.trim() });
          }}
        >
          <label className="field">
            RPC URL
            <input value={rpc} onChange={(e) => setRpc(e.target.value)} placeholder="https://…" />
          </label>
          <button className="btn ghost">Save</button>
        </form>
        <p className="hint">Your wallet must be set to the same network.</p>
      </section>

      <section className="card">
        <div className="panel-head">
          <h2>Wallet</h2>
        </div>
        {address && (
          <p>
            {wallet?.name ?? "Wallet"} connected as <span className="mono">{short(address, 8)}</span> <Copy text={address} />
          </p>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            disconnect();
            navigate("/connect");
          }}
        >
          <Icon name="logout" size={16} /> Disconnect
        </button>
      </section>
    </div>
  );
}
