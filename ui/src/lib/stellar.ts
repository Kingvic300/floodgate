import "./polyfill";
import {
  Account,
  Address,
  Asset,
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

export interface NetSettings {
  network: "testnet" | "mainnet" | "custom";
  rpcUrl: string;
  passphrase: string;
}

export const PRESETS: Record<"testnet" | "mainnet", NetSettings> = {
  testnet: { network: "testnet", rpcUrl: "https://soroban-testnet.stellar.org", passphrase: Networks.TESTNET },
  mainnet: { network: "mainnet", rpcUrl: "", passphrase: Networks.PUBLIC },
};

export { Address, nativeToScVal, scValToNative, xdr };

export type Signer = (txXdr: string) => Promise<string>;
export type Stage = "simulating" | "signing" | "submitting" | "confirming";

const servers = new Map<string, rpc.Server>();
export function server(url: string): rpc.Server {
  let s = servers.get(url);
  if (!s) {
    s = new rpc.Server(url, { allowHttp: url.startsWith("http://") });
    servers.set(url, s);
  }
  return s;
}

function build(source: Account, net: NetSettings, contractId: string, fn: string, args: xdr.ScVal[], timeout = 60) {
  return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: net.passphrase })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(timeout)
    .build();
}

/** Read-only call. Simulates with a throwaway source, so no wallet is needed. */
export async function read(net: NetSettings, contractId: string, fn: string, args: xdr.ScVal[] = []): Promise<unknown> {
  const tx = build(new Account(Keypair.random().publicKey(), "0"), net, contractId, fn, args, 30);
  const sim = await server(net.rpcUrl).simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new ContractCallError(sim.error);
  return sim.result ? scValToNative(sim.result.retval) : undefined;
}

/** Simulate from a real account without signing. */
export async function simulate(
  net: NetSettings,
  source: string,
  contractId: string,
  fn: string,
  args: xdr.ScVal[] = [],
): Promise<{ value: unknown; fee: string }> {
  const s = server(net.rpcUrl);
  const tx = build(await s.getAccount(source), net, contractId, fn, args, 30);
  const sim = await s.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new ContractCallError(sim.error);
  return { value: sim.result ? scValToNative(sim.result.retval) : undefined, fee: sim.minResourceFee };
}

export interface WriteResult {
  value: unknown;
  hash: string;
}

/** Simulate, sign with the connected wallet, submit and wait for the ledger. */
export async function write(
  net: NetSettings,
  source: string,
  sign: Signer,
  contractId: string,
  fn: string,
  args: xdr.ScVal[] = [],
  onStage?: (stage: Stage) => void,
): Promise<WriteResult> {
  const s = server(net.rpcUrl);
  onStage?.("simulating");
  const tx = build(await s.getAccount(source), net, contractId, fn, args, 180);

  let prepared;
  try {
    prepared = await s.prepareTransaction(tx);
  } catch (e) {
    throw new ContractCallError(e instanceof Error ? e.message : String(e));
  }

  onStage?.("signing");
  const signedXdr = await sign(prepared.toXDR());

  onStage?.("submitting");
  const sent = await s.sendTransaction(TransactionBuilder.fromXDR(signedXdr, net.passphrase));
  if (sent.status === "ERROR") {
    throw new ContractCallError(`The network rejected the transaction (result XDR: ${sent.errorResult?.toXDR("base64") ?? "none"}).`);
  }

  onStage?.("confirming");
  const done = await s.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new ContractCallError(`Transaction ${sent.hash} ended with status ${done.status}.`);
  }
  return { value: done.returnValue ? scValToNative(done.returnValue) : undefined, hash: sent.hash };
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

export function describeError(e: unknown, codes: Record<number, string> = {}): string {
  if (e instanceof ContractCallError && e.code !== undefined) {
    return codes[e.code] ?? `The contract returned error #${e.code}.`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/Account not found/i.test(msg)) return "This account does not exist on the network yet. Fund it first.";
  if (/declined|rejected by user|user rejected|denied/i.test(msg)) return "You declined the request in your wallet.";
  if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) return "Cannot reach the RPC server. Check the RPC URL in settings.";
  if (/Error\(Auth/.test(msg)) return "The connected account is not allowed to do this.";
  return msg.length > 280 ? msg.slice(0, 280) + "…" : msg;
}

// ---------- encoding helpers ----------

export const addr = (a: string): xdr.ScVal => Address.fromString(a.trim()).toScVal();
export const i128 = (v: bigint): xdr.ScVal => nativeToScVal(v, { type: "i128" });
export const u64 = (v: bigint | number): xdr.ScVal => nativeToScVal(BigInt(v), { type: "u64" });
export const sym = (s: string): xdr.ScVal => xdr.ScVal.scvSymbol(s);

export function isAddress(a: string): boolean {
  try {
    Address.fromString(a.trim());
    return true;
  } catch {
    return false;
  }
}

export function isContractId(a: string): boolean {
  return a.trim().startsWith("C") && isAddress(a);
}

export function nativeTokenId(net: NetSettings): string {
  return Asset.native().contractId(net.passphrase);
}

// ---------- formatting ----------

export function toUnits(human: string, decimals: number): bigint {
  const clean = human.trim().replace(/,/g, "");
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
  const frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const w = whole.toLocaleString("en-US");
  return (neg ? "-" : "") + (frac ? `${w}.${frac}` : w);
}

export function short(a: string, n = 4): string {
  return a.length > n * 2 + 3 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}

export function duration(secs: number): string {
  if (secs <= 0) return "now";
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return `${m} min`;
  return `${secs} s`;
}

export function timeAgo(date: Date | string | number): string {
  const secs = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86_400)} d ago`;
}

export function explorerTx(net: NetSettings, hash: string): string | undefined {
  if (net.network === "custom" || !hash) return undefined;
  return `https://stellar.expert/explorer/${net.network === "mainnet" ? "public" : "testnet"}/tx/${hash}`;
}

export function explorerContract(net: NetSettings, id: string): string | undefined {
  if (net.network === "custom" || !id.startsWith("C")) return undefined;
  return `https://stellar.expert/explorer/${net.network === "mainnet" ? "public" : "testnet"}/contract/${id}`;
}

// ---------- per-browser storage (conveniences only) ----------

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    /* storage unavailable */
  }
  return [];
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
