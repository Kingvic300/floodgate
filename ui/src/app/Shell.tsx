import { useState, type ReactNode } from "react";
import { Brand } from "../components/Brand";
import { Icon, type IconName } from "../components/Icon";
import { Link, navigate } from "../lib/router";
import { short } from "../lib/stellar";
import { useVault } from "../lib/vault";
import { useWallet } from "../lib/wallet";
import { Copy } from "./shared";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/app", label: "Overview", icon: "overview" },
  { to: "/app/releases", label: "Releases", icon: "releases" },
  { to: "/app/activity", label: "Activity", icon: "activity" },
  { to: "/app/controls", label: "Controls", icon: "controls" },
  { to: "/app/settings", label: "Settings", icon: "settings" },
];

export function Shell(props: { route: string; title: string; children: ReactNode }) {
  const { address, wallet, disconnect, net, demo } = useWallet();
  const { vaults, activeId, setActive, state, refresh, loading } = useVault();
  const [menu, setMenu] = useState(false);

  return (
    <div className="shell">
      <aside className="side">
        <Brand to="/" />
        <nav className="side-nav" aria-label="Console">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={props.route === n.to ? "side-link on" : "side-link"} aria-current={props.route === n.to ? "page" : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <span className={`net-pill ${net.network}`}>{net.network === "mainnet" ? "Mainnet" : net.network === "testnet" ? "Testnet" : "Custom"}</span>
          {state && (
            <span className={state.paused ? "side-status paused" : "side-status open"}>
              <span className="dot" aria-hidden="true" />
              {state.paused ? "Vault paused" : "Vault open"}
            </span>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <div className="top-left">
            <h1>{props.title}</h1>
            {vaults.length > 0 && (
              <label className="vault-pick">
                <span className="sr-only">Vault</span>
                <select value={activeId} onChange={(e) => setActive(e.target.value)}>
                  {vaults.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id.startsWith("C") ? `${v.label} (${short(v.id)})` : v.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="top-right">
            <button className="icon-btn" onClick={() => void refresh()} disabled={loading} aria-label="Refresh" title="Refresh">
              <Icon name="refresh" className={loading ? "spin" : ""} />
            </button>
            <div className="wallet-menu">
              <button className="wallet-chip" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="true">
                <span className="wallet-avatar" aria-hidden="true" style={{ background: avatar(address ?? "") }} />
                {address ? short(address) : "No wallet"}
              </button>
              {menu && address && (
                <div className="menu" role="menu">
                  <p className="menu-head">
                    {demo ? "Demo session" : `${wallet?.name ?? "Wallet"} on ${net.network}`}
                  </p>
                  <p className="menu-addr mono">
                    {short(address, 8)} <Copy text={address} label="Copy address" />
                  </p>
                  <button
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      disconnect();
                      navigate("/");
                    }}
                  >
                    <Icon name="logout" size={16} /> {demo ? "Leave demo" : "Disconnect"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {demo && (
          <div className="demo-bar">
            <span>
              <strong>Demo mode.</strong> You are exploring sample data. Nothing here touches the network.
            </span>
            <button
              className="btn small primary"
              onClick={() => {
                disconnect();
                navigate("/connect");
              }}
            >
              Connect a wallet
            </button>
          </div>
        )}
        <main className="content">{props.children}</main>
      </div>
    </div>
  );
}

/** Deterministic two-tone avatar from an address. */
function avatar(a: string): string {
  let h = 0;
  for (const c of a) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 50) % 360} 60% 60%))`;
}
