import { useMemo, useState } from "react";
import { Gauge } from "../components/Gauge";
import { Icon, type IconName } from "../components/Icon";
import { Link } from "../lib/router";
import { addr, duration, fromUnits, i128, isAddress, toUnits } from "../lib/stellar";
import { ledgerNow, useVault, type VaultState } from "../lib/vault";
import { useWallet } from "../lib/wallet";
import { ActivityList } from "./ActivityList";
import { AddVault, Notice, useAction } from "./shared";

export function Overview() {
  const { state, activeId, error, activity, queue, now } = useVault();

  if (!activeId) return <AddVault />;
  if (error && !state) return <LoadError text={error} />;
  if (!state) return <Skeleton />;

  const t = ledgerNow(state, now);
  const { config, decimals, symbol } = state;
  const fmt = (v: bigint) => `${fromUnits(v, decimals)} ${symbol}`;
  const used = config.window_cap - state.remaining;
  const ws = Number(config.window_secs);
  const waiting = queue.filter((q) => q.status === "locked" || q.status === "ready");
  const waitingTotal = waiting.reduce((s, q) => s + q.amount, 0n);
  const next = waiting.filter((q) => q.releaseAt > t).sort((a, b) => a.releaseAt - b.releaseAt)[0];

  return (
    <div className="overview">
      <section className="ov-top">
        <div className={state.paused ? "card ov-gauge paused" : "card ov-gauge"}>
          <div className="card-head">
            <span className="card-label">Instant cap this window</span>
            <span className={state.paused ? "pill red" : "pill green"}>
              <span className="dot" /> {state.paused ? "Paused" : "Open"}
            </span>
          </div>
          <Gauge cap={config.window_cap} used={used} threshold={config.large_threshold} paused={state.paused} size={260} />
          <p className="ov-line">
            {state.paused ? (
              "Nothing can leave until the admin resumes the vault."
            ) : (
              <>
                <strong>{fmt(state.remaining)}</strong> can leave now. Resets in {duration(ws - (t % ws))}.
              </>
            )}
          </p>
        </div>
        <div className="kpi-grid">
          <Kpi icon="wallet" label="Held in vault" value={fmt(state.balance)} sub={`${symbol} token contract`} />
          <Kpi icon="releases" label="Paid out this window" value={fmt(used)} sub={`of ${fmt(config.window_cap)} per ${duration(ws)}`} />
          <Kpi
            icon="lock"
            label="Waiting releases"
            value={waiting.length ? String(waiting.length) : "None"}
            sub={waiting.length ? `${fmt(waitingTotal)} on hold` : "Nothing queued"}
            tone={waiting.length ? "amber" : undefined}
          />
          <Kpi
            icon="activity"
            label="Next unlock"
            value={next ? duration(next.releaseAt - t) : "—"}
            sub={next ? `Release #${next.id}` : "Nothing scheduled"}
          />
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <div className="panel-head">
            <h2>Recent activity</h2>
            <Link to="/app/activity" className="text-link">
              See all
            </Link>
          </div>
          <ActivityList items={activity} state={state} limit={6} />
        </section>
        <QuickActions state={state} />
      </div>

      <section className="card limits-panel">
        <div className="panel-head">
          <h2>Limits</h2>
          <Link to="/app/controls" className="text-link">
            Change
          </Link>
        </div>
        <dl className="limit-grid">
          <div>
            <dt>Window</dt>
            <dd>{duration(ws)}</dd>
          </div>
          <div>
            <dt>Instant cap per window</dt>
            <dd>{fmt(config.window_cap)}</dd>
          </div>
          <div>
            <dt>Releases from this size wait</dt>
            <dd>{fmt(config.large_threshold)}</dd>
          </div>
          <div>
            <dt>Waiting time</dt>
            <dd>{duration(Number(config.delay_secs))}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Kpi(props: { icon: IconName; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`card kpi ${props.tone ?? ""}`}>
      <span className="kpi-icon">
        <Icon name={props.icon} size={18} />
      </span>
      <span className="kpi-label">{props.label}</span>
      <span className="kpi-value">{props.value}</span>
      {props.sub && <span className="kpi-sub">{props.sub}</span>}
    </div>
  );
}

function QuickActions(props: { state: VaultState }) {
  const { state } = props;
  const { address } = useWallet();
  const { run, busy, msg, setMsg, label } = useAction();
  const [tab, setTab] = useState<"deposit" | "release">("deposit");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");

  const preview = useMemo(() => {
    if (tab !== "release") return "";
    try {
      const v = toUnits(amount, state.decimals);
      if (v >= state.config.large_threshold) return `At or above the single-release limit. It will wait ${duration(Number(state.config.delay_secs))}.`;
      if (v > state.remaining) return `Over what can leave now. It will wait ${duration(Number(state.config.delay_secs))}.`;
      return "Fits the current cap. It will be paid at once.";
    } catch {
      return "";
    }
  }, [tab, amount, state]);

  return (
    <section className="card">
      <div className="panel-head">
        <h2>Move funds</h2>
      </div>
      <div className="tabs" role="tablist">
        {(["deposit", "release"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "on" : ""}
            onClick={() => {
              setTab(t);
              setMsg(null);
            }}
          >
            {t === "deposit" ? "Deposit" : "Release"}
          </button>
        ))}
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (tab === "deposit") {
            void run("deposit", "deposit", () => [addr(address ?? ""), i128(toUnits(amount, state.decimals))], () => `Deposited ${amount} ${state.symbol}.`);
          } else {
            void run(
              "release",
              "release",
              () => {
                if (!isAddress(to)) throw new Error("Enter a valid Stellar address (G… or C…).");
                return [addr(to), i128(toUnits(amount, state.decimals))];
              },
              (r) => {
                const [kind, id] = (r.value as [string, bigint?]) ?? [];
                return kind === "Queued" ? `Release #${id} is waiting.` : `Paid ${amount} ${state.symbol}.`;
              },
            );
          }
        }}
      >
        <p className="muted">
          {tab === "deposit" ? "Anyone can add funds from the connected account." : "Operator only. Small amounts pay now, large ones wait."}
        </p>
        {tab === "release" && (
          <label className="field">
            Recipient
            <input className="mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="G… or C…" spellCheck={false} required />
          </label>
        )}
        <label className="field">
          Amount
          <span className="input-unit">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            <span>{state.symbol}</span>
          </span>
        </label>
        {preview && <p className="hint">{preview}</p>}
        <button className="btn primary" disabled={!!busy || (tab === "release" && state.paused)}>
          {label(tab, tab === "deposit" ? "Deposit" : "Release")}
        </button>
        <Notice msg={msg} />
      </form>
    </section>
  );
}

export function LoadError(props: { text: string }) {
  const { refresh } = useVault();
  return (
    <section className="empty-state">
      <h2>Cannot read this vault</h2>
      <p>{props.text}</p>
      <div className="row">
        <button className="btn primary" onClick={() => void refresh()}>
          Try again
        </button>
        <Link to="/app/settings" className="btn ghost">
          Check settings
        </Link>
      </div>
    </section>
  );
}

export function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading vault">
      <div className="sk-block tall" />
      <div className="sk-row">
        <div className="sk-block" />
        <div className="sk-block" />
      </div>
    </div>
  );
}
