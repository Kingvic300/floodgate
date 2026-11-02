import { useEffect, useState, type ReactNode } from "react";
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

/** Number keys 1–5 jump between pages when focus is not in a field. */
function useShortcuts() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName))) return;
      const i = Number(e.key) - 1;
      if (NAV[i]) navigate(NAV[i].to);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

export function Shell(props: { route: string; title: string; children: ReactNode }) {
  const { address, wallet, disconnect, net, demo } = useWallet();
  const { vaults, activeId, setActive, state, refresh, loading, queue } = useVault();
  const [menu, setMenu] = useState(false);
  useShortcuts();

  const capUsed = state ? Number(((state.config.window_cap - state.remaining) * 1000n) / (state.config.window_cap || 1n)) / 10 : 0;
  const waiting = queue.filter((q) => q.status === "locked" || q.status === "ready").length;

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-glow" aria-hidden="true" />
        <Brand to="/" />

        <nav className="side-nav" aria-label="Console">
          {NAV.map((n, i) => {
            const on = props.route === n.to;
            return (
              <Link key={n.to} to={n.to} className={on ? "side-link on" : "side-link"} aria-current={on ? "page" : undefined}>
                <span className="side-ico">
                  <Icon name={n.icon} size={17} />
                </span>
                <span className="side-label">{n.label}</span>
                {n.to === "/app/releases" && waiting > 0 ? <span className="side-badge">{waiting}</span> : <kbd>{i + 1}</kbd>}
              </Link>
            );
          })}
        </nav>

        <div className="side-card">
          <div className="side-card-row">
            <span className={state?.paused ? "pulse red" : "pulse"} aria-hidden="true" />
            <span className="side-card-title">{!state ? "Connecting…" : state.paused ? "Vault paused" : "Vault open"}</span>
            <span className={`net-chip ${net.network}`}>{net.network === "mainnet" ? "Mainnet" : net.network === "testnet" ? "Testnet" : "Custom"}</span>
          </div>
          {state && (
            <>
              <div className="side-meter" aria-label={`${capUsed}% of window cap used`}>
                <span style={{ width: `${Math.min(100, capUsed)}%` }} />
              </div>
              <div className="side-card-meta">
                <span>{capUsed}% of cap used</span>
                <span className="mono">#{state.ledger.toLocaleString("en-US")}</span>
              </div>
            </>
          )}
        </div>

        <div className="side-user">
          <span className="wallet-avatar" aria-hidden="true" style={{ background: avatar(address ?? "") }} />
          <div className="side-user-text">
            <span className="mono">{address ? short(address, 5) : "No wallet"}</span>
            <span>{demo ? "Demo session" : wallet?.name ?? "Wallet"}</span>
          </div>
          <button
            className="side-out"
            aria-label={demo ? "Leave demo" : "Disconnect"}
            title={demo ? "Leave demo" : "Disconnect"}
            onClick={() => {
              disconnect();
              navigate("/");
            }}
          >
            <Icon name="logout" size={16} />
          </button>
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
                  <p className="menu-head">{demo ? "Demo session" : `${wallet?.name ?? "Wallet"} on ${net.network}`}</p>
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

function avatar(a: string): string {
  let h = 0;
  for (const c of a) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 80% 65%))`;
}
