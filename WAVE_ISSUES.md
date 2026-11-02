# Wave issue backlog

Draft issues for the Stellar Wave program on Drips. Copy each one into a GitHub issue with the labels `wave` plus its size. Each issue should take one contributor about one week or less.

## Trivial

1. **Add a `version()` view** that returns the contract version string. Include a test.
2. **Add doc comments to every public type** in `lib.rs` (`Config`, `Window`, `QueuedRelease`, `Release`, `Error`).
3. **Test: `set_config` rejects each invalid field.** One test per field (`window_secs = 0`, `window_cap <= 0`, `large_threshold <= 0`, `delay_secs = 0`).
4. **Test: `deposit` rejects zero and negative amounts.**
5. **Test: non-admin cannot call `unpause`.** Use `mock_auths` with a specific address instead of `mock_all_auths`.
6. **Test: `remaining()` after a window boundary** equals the full cap.
7. **Add a `next_id()` view** so clients can predict queue ids.
8. **Write `docs/deploy-testnet.md`.** Show `stellar contract deploy` with constructor args on testnet.

## Medium

9. **Sliding window.** Replace the fixed window with a sliding or two-bucket window, so at most one cap can leave in any `window_secs` period. Include boundary tests.
10. **Per-recipient cap.** Optional extra limit on how much one address can receive per window.
11. **Event tests.** Assert the topics and data of every event with `env.events().all()`.
12. **Auth tests for every role.** Replace `mock_all_auths` in the role tests with exact `MockAuth` entries.
13. **`queued_range(start, limit)` view** that lists pending releases for dashboards. Bound `limit` to keep reads under network limits.
14. **TypeScript bindings and example script.** Generate with `stellar contract bindings typescript` and add an example that deposits, releases and reads `remaining()`.
15. **Expire stale queue entries.** Add a `max_age` after which a queued release can no longer run and must be re-requested.
16. **Two-step admin transfer.** Replace `set_admin` with `propose_admin` plus `accept_admin`.

## High

17. **Multi-token vault.** One vault, many tokens, each with its own `Config` and window.
18. **Guardian watcher bot.** A small service that reads `queued` events from Stellar RPC `getEvents` and posts alerts to Discord or Telegram. Include a config file and a README.
19. **Fuzz tests.** Add a `cargo fuzz` target that runs random sequences of `release`, `execute`, `cancel` and time jumps. Assert that instant outflow per window never exceeds the cap.
20. **Reference integration.** A sample bridge-custody or treasury contract that holds its funds in Floodgate. Include an end-to-end test.
21. **Upgradeability with timelock.** Admin-gated wasm upgrade that must be queued with its own delay, so the guardian can react.
22. **Resource-cost report.** Measure CPU, memory and ledger I/O for each function with `env.cost_estimate()` and document the results.
