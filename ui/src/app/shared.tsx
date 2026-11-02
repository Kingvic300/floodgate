import { useState } from "react";
import { Icon } from "../components/Icon";
import { ERRORS, useVault } from "../lib/vault";
import { useWallet } from "../lib/wallet";
import {
  describeError,
  explorerTx,
  isContractId,
  read,
  write,
  type Stage,
  type WriteResult,
  type xdr,
} from "../lib/stellar";

export interface Msg {
  ok: boolean;
  text: string;
  hash?: string;
}

/** Runs one signed contract call and tracks its stage for button labels. */
export function useAction() {
  const { net, address, signer, demo } = useWallet();
  const { activeId, refresh } = useVault();
  const [busy, setBusy] = useState("");
  const [stage, setStage] = useState<Stage | "">("");
  const [msg, setMsg] = useState<Msg | null>(null);

  async function run(label: string, fn: string, args: () => xdr.ScVal[], ok: (r: WriteResult) => string) {
    setMsg(null);
    if (demo) return setMsg({ ok: false, text: "This is the demo with sample data. Connect a wallet and add your own vault to send transactions." });
    if (!address) return setMsg({ ok: false, text: "Connect a wallet first." });
    if (!activeId) return setMsg({ ok: false, text: "Add a vault first." });
    let built: xdr.ScVal[];
    try {
      built = args();
    } catch (e) {
      return setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(label);
    try {
      const r = await write(net, address, signer, activeId, fn, built, setStage);
      setMsg({ ok: true, text: ok(r), hash: r.hash });
      void refresh();
    } catch (e) {
      setMsg({ ok: false, text: describeError(e, ERRORS) });
    } finally {
      setBusy("");
      setStage("");
    }
  }

  function label(name: string, idle: string): string {
    if (busy !== name) return idle;
    return stage === "signing"
      ? "Approve in wallet…"
      : stage === "confirming" || stage === "submitting"
        ? "Waiting for ledger…"
        : "Preparing…";
  }

  return { run, busy, msg, setMsg, label };
}

export function Notice(props: { msg: Msg | null; onClose?: () => void }) {
  const { net } = useWallet();
  if (!props.msg) return null;
  const link = props.msg.hash ? explorerTx(net, props.msg.hash) : undefined;
  return (
    <div className={props.msg.ok ? "note ok" : "note err"} role={props.msg.ok ? "status" : "alert"}>
      <Icon name={props.msg.ok ? "check" : "x"} size={18} />
      <span>{props.msg.text}</span>
      {link && (
        <a href={link} target="_blank" rel="noreferrer">
          View transaction <Icon name="external" size={14} />
        </a>
      )}
      {props.onClose && (
        <button className="icon-btn" onClick={props.onClose} aria-label="Dismiss">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

export function AddVault(props: { compact?: boolean }) {
  const { addVault } = useVault();
  const { net } = useWallet();
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit() {
    setErr("");
    if (!isContractId(id)) return setErr("Enter a contract ID that starts with C.");
    setChecking(true);
    try {
      await read(net, id.trim(), "config");
      addVault({ id: id.trim(), label: label.trim() || "My vault" });
      setId("");
      setLabel("");
    } catch {
      setErr(`No Floodgate vault answered at that ID on ${net.network}. Check the ID and the network.`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form
      className={props.compact ? "add-vault compact" : "add-vault"}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!props.compact && (
        <>
          <h2>Add a vault</h2>
          <p className="muted">
            Paste the contract ID from <code>stellar contract deploy</code>. The console reads the vault straight from the
            network.
          </p>
        </>
      )}
      <div className="add-vault-fields">
        <label className="field">
          Contract ID
          <input className="mono" value={id} onChange={(e) => setId(e.target.value)} placeholder="C…" spellCheck={false} />
        </label>
        <label className="field">
          Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bridge reserve" />
        </label>
        <button className="btn primary" disabled={checking}>
          {checking ? "Checking…" : "Add vault"}
        </button>
      </div>
      {err && <p className="note err">{err}</p>}
    </form>
  );
}

export function Copy(props: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-btn"
      aria-label={props.label ?? "Copy"}
      title={props.label ?? "Copy"}
      onClick={() => {
        void navigator.clipboard?.writeText(props.text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      <Icon name={done ? "check" : "copy"} size={16} />
    </button>
  );
}
