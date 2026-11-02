import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PRESETS,
  type NetSettings,
  addr,
  connectWallet,
  describeError,
  fromUnits,
  i128,
  isAddress,
  loadSettings,
  read,
  saveSettings,
  scValToNative,
  server,
  short,
  sym,
  toUnits,
  u64,
  write,
} from "./stellar";
import { Gauge } from "./Gauge";

const STORE_KEY = "floodgate.settings";

const ERRORS: Record<number, string> = {
  1: "The vault is paused. Only the admin can resume it.",
  2: "The amount must be more than zero.",
  3: "Those limits are not valid. Every value must be above zero.",
  4: "No queued release has that number. It may already be paid or cancelled.",
  5: "This release is still locked. Try again after it unlocks.",
};

interface Config {
  window_secs: bigint;
  window_cap: bigint;
  large_threshold: bigint;
  delay_secs: bigint;
}

interface VaultState {
  token: string;
  symbol: string;
  decimals: number;
  config: Config;
  paused: boolean;
  remaining: bigint;
  balance: bigint;
  ledgerTime: number;
  fetchedAt: number;
}

type QueueStatus = "locked" | "ready" | "paid" | "cancelled" | "closed";

interface QueueItem {
  id: bigint;
  to: string;
  amount: bigint;
  releaseAt: number;
  status: QueueStatus;
}

const defaults: NetSettings = {
  ...PRESETS.testnet,
  contractId: (import.meta.env.VITE_CONTRACT_ID as string | undefined) ?? "",
};

export default function App() {
  const [net, setNet] = useState<NetSettings>(() => loadSettings(STORE_KEY, defaults));
  const [showSettings, setShowSettings] = useState(!net.contractId);
  const [wallet, setWallet] = useState<string>("");
  const [state, setState] = useState<VaultState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!net.contractId || !net.rpcUrl) return;
    setLoading(true);
    setLoadError("");
    try {
      const id = net.contractId;
      const [token, config, paused, remaining, ledger] = await Promise.all([
        read(net, id, "token") as Promise<string>,
        read(net, id, "config") as Promise<Config>,
        read(net, id, "paused") as Promise<boolean>,
        read(net, id, "remaining") as Promise<bigint>,
        server(net.rpcUrl).getLatestLedger(),
      ]);
      const [symbol, decimals, balance] = await Promise.all([
        read(net, token, "symbol").catch(() => "tokens") as Promise<string>,
        read(net, token, "decimals").catch(() => 7) as Promise<number>,
        read(net, token, "balance", [addr(id)]).catch(() => 0n) as Promise<bigint>,
      ]);
      setState({
        token,
        symbol,
        decimals: Number(decimals),
        config,
        paused,
        remaining: BigInt(remaining),
        balance: BigInt(balance),
        ledgerTime: Number(ledger.closeTime),
        fetchedAt: Date.now(),
      });
      setQueue(await loadQueue(net, ledger.sequence, Number(ledger.closeTime)));
    } catch (e) {
      setState(null);
      setLoadError(describeError(e, ERRORS));
    } finally {
      setLoading(false);
    }
  }, [net]);

  useEffect(() => {
    void load();
  }, [load]);

  const ledgerNow = state ? state.ledgerTime + Math.floor((now - state.fetchedAt) / 1000) : 0;

  return (
    <div className="shell">
      <header className="bar">
        <div className="brand">
          <span className="brand-name">Floodgate</span>
          {net.contractId && (
            <button className="link" onClick={() => setShowSettings(true)} title={net.contractId}>
              Vault {short(net.contractId)} on {networkName(net)}
            </button>
          )}
        </div>
        <div className="bar-actions">
          <button className="ghost" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          {wallet ? (
            <span className="wallet" title={wallet}>
              {short(wallet)}
            </span>
          ) : (
            <button
              className="primary"
              onClick={() =>
                connectWallet()
                  .then(setWallet)
                  .catch((e) => setLoadError(describeError(e, ERRORS)))
              }
            >
              Connect Freighter
            </button>
          )}
        </div>
      </header>

      {!net.contractId ? (
        <section className="empty">
          <h1>Point the console at a vault</h1>
          <p>Enter the contract ID of a deployed Floodgate vault. You can find it in the output of <code>stellar contract deploy</code>.</p>
          <button className="primary" onClick={() => setShowSettings(true)}>
            Open settings
          </button>
        </section>
      ) : loadError && !state ? (
        <section className="empty">
          <h1>Cannot read this vault</h1>
          <p>{loadError}</p>
          <div className="row">
            <button className="primary" onClick={() => void load()}>
              Try again
            </button>
            <button className="ghost" onClick={() => setShowSettings(true)}>
              Check settings
            </button>
          </div>
        </section>
      ) : !state ? (
        <section className="empty">
          <p className="muted">Reading vault…</p>
        </section>
      ) : (
        <>
          <Overview state={state} ledgerNow={ledgerNow} onRefresh={() => void load()} refreshing={loading} />
          <Queue
            items={queue}
            state={state}
            ledgerNow={ledgerNow}
            net={net}
            wallet={wallet}
            onDone={() => void load()}
          />
          <Actions state={state} net={net} wallet={wallet} onDone={() => void load()} />
        </>
      )}

      {showSettings && (
        <Settings
          value={net}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            saveSettings(STORE_KEY, s);
            setNet(s);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

function networkName(net: NetSettings): string {
  if (net.passphrase === PRESETS.testnet.passphrase) return "testnet";
  if (net.passphrase === PRESETS.mainnet.passphrase) return "mainnet";
  return "custom network";
}

async function loadQueue(net: NetSettings, latest: number, latestTime: number): Promise<QueueItem[]> {
  const filter = {
    type: "contract" as const,
    contractIds: [net.contractId],
    topics: [
      [sym("queued").toXDR("base64"), "*"],
      [sym("executed").toXDR("base64"), "*"],
      [sym("cancelled").toXDR("base64"), "*"],
    ],
  };
  const s = server(net.rpcUrl);
  let res;
  try {
    res = await s.getEvents({ filters: [filter], startLedger: Math.max(1, latest - 100_000), limit: 200 });
  } catch {
    // Older start ledgers fall outside this RPC's retention window. Retry with a short range.
    res = await s.getEvents({ filters: [filter], startLedger: Math.max(1, latest - 10_000), limit: 200 });
  }

  const items = new Map<string, QueueItem>();
  const ended = new Map<string, QueueStatus>();
  for (const ev of res.events) {
    const kind = scValToNative(ev.topic[0]) as string;
    const id = BigInt(scValToNative(ev.topic[1]) as bigint);
    if (kind === "queued") {
      const v = scValToNative(ev.value) as { to: string; amount: bigint; release_at: bigint };
      items.set(id.toString(), {
        id,
        to: v.to,
        amount: BigInt(v.amount),
        releaseAt: Number(v.release_at),
        status: "locked",
      });
    } else {
      ended.set(id.toString(), kind === "executed" ? "paid" : "cancelled");
    }
  }

  const list = [...items.values()];
  await Promise.all(
    list.map(async (item) => {
      const end = ended.get(item.id.toString());
      if (end) {
        item.status = end;
        return;
      }
      const live = await read(net, net.contractId, "queued", [u64(item.id)]).catch(() => undefined);
      if (!live) item.status = "closed";
      else item.status = latestTime >= item.releaseAt ? "ready" : "locked";
    }),
  );
  return list.sort((a, b) => Number(b.id - a.id));
}

function duration(secs: number): string {
  if (secs <= 0) return "now";
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  const s = secs % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

function Overview(props: { state: VaultState; ledgerNow: number; onRefresh: () => void; refreshing: boolean }) {
  const { state, ledgerNow } = props;
  const { config, decimals, symbol } = state;
  const fmt = (v: bigint) => fromUnits(v, decimals);
  const used = config.window_cap - state.remaining;
  const windowSecs = Number(config.window_secs);
  const resetsIn = windowSecs - (ledgerNow % windowSecs);

  return (
    <section className="overview">
      <Gauge cap={config.window_cap} used={used} threshold={config.large_threshold} paused={state.paused} />
      <div className="readout">
        <p className={state.paused ? "status paused" : "status open"}>{state.paused ? "Paused" : "Open"}</p>
        <p className="headline">
          {state.paused ? (
            <>Nothing can leave until the admin resumes the vault.</>
          ) : (
            <>
              <strong>
                {fmt(state.remaining)} {symbol}
              </strong>{" "}
              can leave now. The limit resets in {duration(resetsIn)}.
            </>
          )}
        </p>

        <dl className="limits">
          <div>
            <dt>Held in vault</dt>
            <dd>
              {fmt(state.balance)} {symbol}
            </dd>
          </div>
          <div>
            <dt>Instant limit per {duration(windowSecs)}</dt>
            <dd>
              {fmt(config.window_cap)} {symbol}
            </dd>
          </div>
          <div>
            <dt>Releases this size or larger wait</dt>
            <dd>
              {fmt(config.large_threshold)} {symbol}
            </dd>
          </div>
          <div>
            <dt>Waiting time</dt>
            <dd>{duration(Number(config.delay_secs))}</dd>
          </div>
        </dl>
        <button className="ghost small" onClick={props.onRefresh} disabled={props.refreshing}>
          {props.refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<QueueStatus, string> = {
  locked: "Locked",
  ready: "Ready to pay",
  paid: "Paid",
  cancelled: "Cancelled",
  closed: "Closed",
};

function Queue(props: {
  items: QueueItem[];
  state: VaultState;
  ledgerNow: number;
  net: NetSettings;
  wallet: string;
  onDone: () => void;
}) {
  const { items, state, ledgerNow } = props;
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: "execute" | "cancel", id: bigint) {
    if (!props.wallet) {
      setMsg({ ok: false, text: "Connect Freighter first." });
      return;
    }
    setBusy(`${fn}-${id}`);
    setMsg(null);
    try {
      await write(props.net, props.wallet, props.net.contractId, fn, [u64(id)]);
      setMsg({ ok: true, text: fn === "execute" ? `Release #${id} paid.` : `Release #${id} cancelled. The funds stay in the vault.` });
      props.onDone();
    } catch (e) {
      setMsg({ ok: false, text: describeError(e, ERRORS) });
    } finally {
      setBusy("");
    }
  }

  const pending = items.filter((i) => i.status === "locked" || i.status === "ready");

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Waiting releases</h2>
        <p className="muted">
          {pending.length === 0
            ? "Nothing is waiting. Large releases appear here while their timer runs."
            : `${pending.length} waiting. The guardian can cancel any of them before they are paid.`}
        </p>
      </div>
      {msg && <p className={msg.ok ? "note ok" : "note err"}>{msg.text}</p>}
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Recipient</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Unlocks</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const open = i.status === "locked" || i.status === "ready";
                const ready = open && ledgerNow >= i.releaseAt;
                return (
                  <tr key={i.id.toString()} className={open ? "" : "done"}>
                    <td>{i.id.toString()}</td>
                    <td className="addr" title={i.to}>
                      {short(i.to)}
                    </td>
                    <td className="num">
                      {fromUnits(i.amount, state.decimals)} {state.symbol}
                    </td>
                    <td>{open ? (ready ? "Unlocked" : `in ${duration(i.releaseAt - ledgerNow)}`) : "—"}</td>
                    <td>
                      <span className={`tag ${open ? (ready ? "ready" : "locked") : i.status}`}>
                        {open ? (ready ? STATUS_TEXT.ready : STATUS_TEXT.locked) : STATUS_TEXT[i.status]}
                      </span>
                    </td>
                    <td className="row-actions">
                      {open && (
                        <>
                          <button
                            className="small"
                            disabled={!ready || state.paused || !!busy}
                            onClick={() => void run("execute", i.id)}
                            title={state.paused ? "The vault is paused" : ready ? "" : "Still locked"}
                          >
                            {busy === `execute-${i.id}` ? "Paying…" : "Pay out"}
                          </button>
                          <button className="small danger" disabled={!!busy} onClick={() => void run("cancel", i.id)}>
                            {busy === `cancel-${i.id}` ? "Cancelling…" : "Cancel"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Actions(props: { state: VaultState; net: NetSettings; wallet: string; onDone: () => void }) {
  const { state, net, wallet } = props;
  const [depositAmt, setDepositAmt] = useState("");
  const [to, setTo] = useState("");
  const [releaseAmt, setReleaseAmt] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const preview = useMemo(() => {
    try {
      const v = toUnits(releaseAmt, state.decimals);
      if (v >= state.config.large_threshold) return "This amount is at or above the single-release limit, so it will wait.";
      if (v > state.remaining) return "This amount is over what can leave now, so it will wait.";
      return "This amount fits the current limit and will be paid at once.";
    } catch {
      return "";
    }
  }, [releaseAmt, state]);

  async function run(label: string, fn: string, args: () => ReturnType<typeof addr>[], ok: (r: unknown) => string) {
    if (!wallet) {
      setMsg({ ok: false, text: "Connect Freighter first." });
      return;
    }
    setMsg(null);
    let built;
    try {
      built = args();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return;
    }
    setBusy(label);
    try {
      const r = await write(net, wallet, net.contractId, fn, built, (stage) => setBusy(`${label}:${stage}`));
      setMsg({ ok: true, text: ok(r) });
      props.onDone();
    } catch (e) {
      setMsg({ ok: false, text: describeError(e, ERRORS) });
    } finally {
      setBusy("");
    }
  }

  const stageText = (label: string, idle: string) => {
    if (!busy.startsWith(label)) return idle;
    const stage = busy.split(":")[1];
    return stage === "signing" ? "Confirm in Freighter…" : stage === "confirming" ? "Waiting for ledger…" : "Working…";
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Move funds</h2>
        <p className="muted">Each action is signed by the connected account. The contract checks who may call it.</p>
      </div>
      {msg && <p className={msg.ok ? "note ok" : "note err"}>{msg.text}</p>}

      <div className="forms">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "deposit",
              "deposit",
              () => [addr(wallet), i128(toUnits(depositAmt, state.decimals))],
              () => `Deposited ${depositAmt} ${state.symbol}.`,
            );
          }}
        >
          <h3>Deposit</h3>
          <p className="muted">Anyone can add funds from their own account.</p>
          <label>
            Amount in {state.symbol}
            <input inputMode="decimal" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} placeholder="0.00" required />
          </label>
          <button className="primary" disabled={!!busy}>
            {stageText("deposit", "Deposit")}
          </button>
        </form>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "release",
              "release",
              () => {
                if (!isAddress(to)) throw new Error("Enter a valid Stellar address (G… or C…).");
                return [addr(to), i128(toUnits(releaseAmt, state.decimals))];
              },
              (r) => {
                const [kind, id] = (r as [string, bigint?]) ?? [];
                return kind === "Queued"
                  ? `Release #${id} is waiting. It unlocks in ${duration(Number(state.config.delay_secs))}.`
                  : `Paid ${releaseAmt} ${state.symbol}.`;
              },
            );
          }}
        >
          <h3>Release</h3>
          <p className="muted">Operator only. Small amounts pay now, large ones wait.</p>
          <label>
            Recipient
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="G… or C…" spellCheck={false} required />
          </label>
          <label>
            Amount in {state.symbol}
            <input inputMode="decimal" value={releaseAmt} onChange={(e) => setReleaseAmt(e.target.value)} placeholder="0.00" required />
          </label>
          {preview && <p className="hint">{preview}</p>}
          <button className="primary" disabled={!!busy || state.paused}>
            {stageText("release", "Release")}
          </button>
        </form>

        <div className="card">
          <h3>Emergency</h3>
          <p className="muted">The guardian can pause. Only the admin can resume.</p>
          {state.paused ? (
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => void run("unpause", "unpause", () => [], () => "The vault is open again.")}
            >
              {stageText("unpause", "Resume vault")}
            </button>
          ) : (
            <button
              className="danger"
              disabled={!!busy}
              onClick={() => void run("pause", "pause", () => [], () => "The vault is paused. No releases or payouts can run.")}
            >
              {stageText("pause", "Pause vault")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Settings(props: { value: NetSettings; onSave: (s: NetSettings) => void; onClose: () => void }) {
  const [s, setS] = useState(props.value);
  const preset = s.passphrase === PRESETS.testnet.passphrase ? "testnet" : s.passphrase === PRESETS.mainnet.passphrase ? "mainnet" : "custom";

  return (
    <div className="scrim" role="presentation" onClick={props.onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave({ ...s, contractId: s.contractId.trim(), rpcUrl: s.rpcUrl.trim() });
        }}
      >
        <h2 id="settings-title">Settings</h2>
        <label>
          Network
          <select
            value={preset}
            onChange={(e) => {
              const p = PRESETS[e.target.value];
              if (p) setS({ ...s, ...p });
            }}
          >
            <option value="testnet">Testnet</option>
            <option value="mainnet">Mainnet</option>
            {preset === "custom" && <option value="custom">Custom</option>}
          </select>
        </label>
        <label>
          RPC URL
          <input value={s.rpcUrl} onChange={(e) => setS({ ...s, rpcUrl: e.target.value })} placeholder="https://…" required />
          {preset === "mainnet" && <span className="hint">Mainnet has no public SDF RPC. Use your own or a provider's URL.</span>}
        </label>
        <label>
          Vault contract ID
          <input
            value={s.contractId}
            onChange={(e) => setS({ ...s, contractId: e.target.value })}
            placeholder="C…"
            spellCheck={false}
            required
          />
        </label>
        <div className="row end">
          <button type="button" className="ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}
