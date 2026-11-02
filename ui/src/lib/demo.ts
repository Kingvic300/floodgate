import type { Activity, QueueItem, VaultState } from "./vault";

export const DEMO_ADDRESS = "GDEMOVAULTOPERATORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
export const DEMO_VAULT = "demo";

const U = 10_000_000n; // 7 decimals
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
const R = [
  "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG",
  "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3",
  "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  "GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4A",
];

/** Sample data so the console can be explored without a wallet or a deployed vault. */
export function demoData(): { state: VaultState; queue: QueueItem[]; activity: Activity[] } {
  const now = Math.floor(Date.now() / 1000);
  const state: VaultState = {
    token: "CDEMOUSDC",
    symbol: "USDC",
    decimals: 7,
    config: { window_secs: 3600n, window_cap: 10_000n * U, large_threshold: 5_000n * U, delay_secs: 86_400n },
    paused: false,
    remaining: 3_820n * U,
    balance: 2_418_550n * U,
    ledgerTime: now,
    ledger: 5_523_534,
    fetchedAt: Date.now(),
  };
  const queue: QueueItem[] = [
    { id: 14n, to: R[0], amount: 48_000n * U, releaseAt: now + 19 * 3600, status: "locked", queuedAt: ago(300), txHash: "" },
    { id: 13n, to: R[1], amount: 7_500n * U, releaseAt: now + 2 * 3600 + 900, status: "locked", queuedAt: ago(1290), txHash: "" },
    { id: 12n, to: R[2], amount: 12_000n * U, releaseAt: now - 600, status: "ready", queuedAt: ago(1450), txHash: "" },
    { id: 11n, to: R[3], amount: 250_000n * U, releaseAt: now - 3600, status: "cancelled", queuedAt: ago(2900), txHash: "" },
    { id: 10n, to: R[0], amount: 6_000n * U, releaseAt: now - 9000, status: "paid", queuedAt: ago(3100), txHash: "" },
  ];
  const a = (id: string, kind: Activity["kind"], mins: number, extra: Partial<Activity>): Activity => ({
    id,
    kind,
    at: ago(mins),
    ledger: 0,
    txHash: "",
    ...extra,
  });
  const activity: Activity[] = [
    a("1", "sent", 4, { account: R[1], amount: 1_250n * U }),
    a("2", "sent", 11, { account: R[2], amount: 2_400n * U }),
    a("3", "deposited", 26, { account: R[3], amount: 150_000n * U }),
    a("4", "sent", 41, { account: R[0], amount: 2_530n * U }),
    a("5", "queued", 300, { releaseId: 14n, account: R[0], amount: 48_000n * U }),
    a("6", "queued", 1290, { releaseId: 13n, account: R[1], amount: 7_500n * U }),
    a("7", "queued", 1450, { releaseId: 12n, account: R[2], amount: 12_000n * U }),
    a("8", "cancelled", 2880, { releaseId: 11n }),
    a("9", "paused_changed", 2885, { paused: false }),
    a("10", "paused_changed", 2895, { paused: true }),
    a("11", "queued", 2900, { releaseId: 11n, account: R[3], amount: 250_000n * U }),
    a("12", "executed", 3000, { releaseId: 10n }),
  ];
  return { state, queue, activity };
}
