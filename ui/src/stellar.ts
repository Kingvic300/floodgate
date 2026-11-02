import "./polyfill";
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { requestAccess, signTransaction } from "@stellar/freighter-api";

export interface NetSettings {
  rpcUrl: string;
  passphrase: string;
  contractId: string;
}

export const PRESETS: Record<string, { rpcUrl: string; passphrase: string }> = {
  testnet: { rpcUrl: "https://soroban-testnet.stellar.org", passphrase: Networks.TESTNET },
  mainnet: { rpcUrl: "", passphrase: Networks.PUBLIC },
};

export { Address, nativeToScVal, scValToNative, xdr };

const servers = new Map<string, rpc.Server>();
export function server(url: string): rpc.Server {
  let s = servers.get(url);
  if (!s) {
    s = new rpc.Server(url, { allowHttp: url.startsWith("http://") });
    servers.set(url, s);
  }
  return s;
}

export async function connectWallet(): Promise<string> {
  const res = await requestAccess();
  if (res.error) throw new Error(`Freighter: ${res.error.message ?? String(res.error)}`);
  if (!res.address) throw new Error("Freighter returned no address. Unlock Freighter and try again.");
  return res.address;
}

/** Read-only call: simulate with a throwaway source account. */
export async function read(
  net: NetSettings,
  contractId: string,
  fn: string,
  args: xdr.ScVal[] = [],
): Promise<unknown> {
  const source = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: net.passphrase })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(30)
    .build();
  const sim = await server(net.rpcUrl).simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new ContractCallError(sim.error);
  return sim.result ? scValToNative(sim.result.retval) : undefined;
}

/** State-changing call: simulate, sign in Freighter, submit, wait. */
export async function write(
  net: NetSettings,
  sourceAddress: string,
  contractId: string,
  fn: string,
  args: xdr.ScVal[] = [],
  onStage?: (stage: "simulating" | "signing" | "submitting" | "confirming") => void,
): Promise<unknown> {
  const s = server(net.rpcUrl);
  onStage?.("simulating");
  const account = await s.getAccount(sourceAddress);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: net.passphrase })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(120)
    .build();

  let prepared;
  try {
    prepared = await s.prepareTransaction(tx);
  } catch (e) {
    throw new ContractCallError(e instanceof Error ? e.message : String(e));
  }

  onStage?.("signing");
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: net.passphrase,
    address: sourceAddress,
  });
  if (signed.error) throw new Error(`Freighter: ${signed.error.message ?? String(signed.error)}`);

  onStage?.("submitting");
  const final = TransactionBuilder.fromXDR(signed.signedTxXdr, net.passphrase);
  const sent = await s.sendTransaction(final);
  if (sent.status === "ERROR") {
    throw new ContractCallError(`The network rejected the transaction (result XDR: ${sent.errorResult?.toXDR("base64") ?? "none"}).`);
  }

  onStage?.("confirming");
  const done = await s.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new ContractCallError(`Transaction ${sent.hash} ended with status ${done.status}`);
  }
  return done.returnValue ? scValToNative(done.returnValue) : undefined;
}

/** Error carrying the raw RPC text plus the contract error code, if any. */
export class ContractCallError extends Error {
  code?: number;
  constructor(raw: string) {
    super(raw);
    const m = /Error\(Contract, #(\d+)\)/.exec(raw);
    if (m) this.code = Number(m[1]);
  }
}

export function describeError(e: unknown, codes: Record<number, string>): string {
  if (e instanceof ContractCallError && e.code !== undefined) {
    return codes[e.code] ?? `The contract returned error #${e.code}.`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/Account not found/i.test(msg)) return "This account does not exist on the network yet. Fund it first.";
  if (/User declined|rejected/i.test(msg)) return "You declined the request in Freighter.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Cannot reach the RPC server. Check the RPC URL in settings.";
  if (/Error\(Auth/.test(msg)) return "The connected account is not allowed to do this.";
  return msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
}

// ---- formatting helpers ----

export function toUnits(human: string, decimals: number): bigint {
  const clean = human.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error("Enter a positive number, like 25 or 0.5.");
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > decimals) throw new Error(`This token allows at most ${decimals} decimal places.`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

export function fromUnits(units: bigint, decimals: number, maxFrac = 2): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const w = whole.toLocaleString("en-US");
  return (neg ? "-" : "") + (frac ? `${w}.${frac}` : w);
}

export function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export function isAddress(a: string): boolean {
  try {
    Address.fromString(a.trim());
    return true;
  } catch {
    return false;
  }
}

export function addr(a: string): xdr.ScVal {
  return Address.fromString(a.trim()).toScVal();
}

export function i128(v: bigint): xdr.ScVal {
  return nativeToScVal(v, { type: "i128" });
}

export function u64(v: bigint | number): xdr.ScVal {
  return nativeToScVal(BigInt(v), { type: "u64" });
}

export function sym(s: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(s);
}

// ---- settings persistence (per-browser convenience only) ----

export function loadSettings(key: string, fallback: NetSettings): NetSettings {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function saveSettings(key: string, s: NetSettings): void {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
