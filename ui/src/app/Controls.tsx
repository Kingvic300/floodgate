import { useState } from "react";
import { Icon } from "../components/Icon";
import { addr, duration, fromUnits, isAddress, nativeToScVal, sym, toUnits, u64, xdr } from "../lib/stellar";
import { useVault, type Config } from "../lib/vault";
import { LoadError, Skeleton } from "./Overview";
import { AddVault, Notice, useAction } from "./shared";

const UNITS = [
  { label: "minutes", secs: 60 },
  { label: "hours", secs: 3_600 },
  { label: "days", secs: 86_400 },
];

function split(secs: number): { n: string; unit: number } {
  const u = [...UNITS].reverse().find((x) => secs % x.secs === 0) ?? UNITS[0];
  return { n: String(secs / u.secs), unit: u.secs };
}

function configScVal(c: Config): xdr.ScVal {
  // Struct fields are encoded as a map sorted by key.
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sym("delay_secs"), val: u64(c.delay_secs) }),
    new xdr.ScMapEntry({ key: sym("large_threshold"), val: nativeToScVal(c.large_threshold, { type: "i128" }) }),
    new xdr.ScMapEntry({ key: sym("window_cap"), val: nativeToScVal(c.window_cap, { type: "i128" }) }),
    new xdr.ScMapEntry({ key: sym("window_secs"), val: u64(c.window_secs) }),
  ]);
}

export function Controls() {
  const { state, activeId, error } = useVault();
  if (!activeId) return <AddVault />;
  if (error && !state) return <LoadError text={error} />;
  if (!state) return <Skeleton />;
  return (
    <div className="page controls">
      <Emergency />
      <Limits />
      <Roles />
    </div>
  );
}

function Emergency() {
  const { state } = useVault();
  const { run, busy, msg, label } = useAction();
  const paused = state!.paused;
  return (
    <section className={paused ? "card emergency paused" : "card emergency"}>
      <div className="hazard-bar" aria-hidden="true" />
      <div className="emergency-body">
        <div>
          <h2>{paused ? "The vault is paused" : "Emergency stop"}</h2>
          <p className="muted">
            {paused
              ? "No releases or payouts can run. Only the admin can resume."
              : "Pausing stops every release and payout at once. The guardian can pause. Only the admin can resume."}
          </p>
        </div>
        {paused ? (
          <button className="btn primary big" disabled={!!busy} onClick={() => void run("unpause", "unpause", () => [], () => "The vault is open again.")}>
            <Icon name="play" size={18} /> {label("unpause", "Resume vault")}
          </button>
        ) : (
          <button className="btn stop big" disabled={!!busy} onClick={() => void run("pause", "pause", () => [], () => "The vault is paused.")}>
            <Icon name="pause" size={18} /> {label("pause", "Pause vault")}
          </button>
        )}
      </div>
      <Notice msg={msg} />
    </section>
  );
}

function Limits() {
  const { state } = useVault();
  const s = state!;
  const { run, busy, msg, label } = useAction();
  const w = split(Number(s.config.window_secs));
  const d = split(Number(s.config.delay_secs));
  const [form, setForm] = useState({
    windowN: w.n,
    windowU: w.unit,
    cap: fromUnits(s.config.window_cap, s.decimals, s.decimals).replace(/,/g, ""),
    threshold: fromUnits(s.config.large_threshold, s.decimals, s.decimals).replace(/,/g, ""),
    delayN: d.n,
    delayU: d.unit,
  });

  function build(): Config {
    const ws = Math.round(Number(form.windowN) * form.windowU);
    const ds = Math.round(Number(form.delayN) * form.delayU);
    if (!(ws > 0) || !(ds > 0)) throw new Error("Window and waiting time must be above zero.");
    return {
      window_secs: BigInt(ws),
      delay_secs: BigInt(ds),
      window_cap: toUnits(form.cap, s.decimals),
      large_threshold: toUnits(form.threshold, s.decimals),
    };
  }

  return (
    <section className="card">
      <div className="panel-head">
        <h2>Limits</h2>
        <span className="role-tag">Admin only</span>
      </div>
      <form
        className="limits-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run("limits", "set_config", () => [configScVal(build())], () => "New limits saved.");
        }}
      >
        <label className="field">
          Window length
          <span className="pair">
            <input inputMode="numeric" value={form.windowN} onChange={(e) => setForm({ ...form, windowN: e.target.value })} />
            <select value={form.windowU} onChange={(e) => setForm({ ...form, windowU: Number(e.target.value) })}>
              {UNITS.map((u) => (
                <option key={u.secs} value={u.secs}>
                  {u.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="field">
          Instant cap per window
          <span className="input-unit">
            <input inputMode="decimal" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} />
            <span>{s.symbol}</span>
          </span>
        </label>
        <label className="field">
          Releases from this size wait
          <span className="input-unit">
            <input inputMode="decimal" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
            <span>{s.symbol}</span>
          </span>
        </label>
        <label className="field">
          Waiting time
          <span className="pair">
            <input inputMode="numeric" value={form.delayN} onChange={(e) => setForm({ ...form, delayN: e.target.value })} />
            <select value={form.delayU} onChange={(e) => setForm({ ...form, delayU: Number(e.target.value) })}>
              {UNITS.map((u) => (
                <option key={u.secs} value={u.secs}>
                  {u.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <p className="hint span-all">
          Now: {fromUnits(s.config.window_cap, s.decimals)} {s.symbol} per {duration(Number(s.config.window_secs))}, releases from{" "}
          {fromUnits(s.config.large_threshold, s.decimals)} {s.symbol} wait {duration(Number(s.config.delay_secs))}.
        </p>
        <button className="btn primary" disabled={!!busy}>
          {label("limits", "Save limits")}
        </button>
      </form>
      <Notice msg={msg} />
    </section>
  );
}

const ROLE_INFO = {
  set_operator: { title: "Operator", text: "Requests releases. Usually the contract or service that pays users." },
  set_guardian: { title: "Guardian", text: "Cancels waiting releases and pauses the vault." },
  set_admin: { title: "Admin", text: "Changes limits and roles and resumes the vault. Handing this over is final." },
} as const;

function Roles() {
  const { run, busy, msg, label } = useAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmAdmin, setConfirmAdmin] = useState(false);

  return (
    <section className="card">
      <div className="panel-head">
        <h2>Roles</h2>
        <span className="role-tag">Admin only</span>
      </div>
      <p className="muted">The contract keeps role addresses private, so they are not shown here. Assign a new address to replace one.</p>
      <div className="roles-grid">
        {(Object.keys(ROLE_INFO) as (keyof typeof ROLE_INFO)[]).map((fn) => {
          const info = ROLE_INFO[fn];
          const v = values[fn] ?? "";
          const isAdmin = fn === "set_admin";
          return (
            <form
              key={fn}
              className={isAdmin ? "role-card warn" : "role-card"}
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  fn,
                  fn,
                  () => {
                    if (!isAddress(v)) throw new Error(`Enter a valid address for the new ${info.title.toLowerCase()}.`);
                    if (isAdmin && !confirmAdmin) throw new Error("Tick the box to confirm the admin handover.");
                    return [addr(v)];
                  },
                  () => `${info.title} updated.`,
                );
              }}
            >
              <h3>{info.title}</h3>
              <p className="muted">{info.text}</p>
              <label className="field">
                New {info.title.toLowerCase()} address
                <input className="mono" value={v} onChange={(e) => setValues({ ...values, [fn]: e.target.value })} placeholder="G… or C…" spellCheck={false} />
              </label>
              {isAdmin && (
                <label className="check">
                  <input type="checkbox" checked={confirmAdmin} onChange={(e) => setConfirmAdmin(e.target.checked)} />I understand the
                  current admin loses control.
                </label>
              )}
              <button className={isAdmin ? "btn danger" : "btn ghost"} disabled={!!busy}>
                {label(fn, `Assign ${info.title.toLowerCase()}`)}
              </button>
            </form>
          );
        })}
      </div>
      <Notice msg={msg} />
    </section>
  );
}
