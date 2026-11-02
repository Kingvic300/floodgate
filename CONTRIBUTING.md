# Contributing

Thanks for helping. This repo takes part in the Stellar Wave program on Drips, so many issues are sized for one-week contributions.

## Picking an issue

1. Browse issues labelled `wave`. Each one also has a size label: `trivial`, `medium` or `high`.
2. Comment on the issue to ask for it, or apply through the Drips Wave dashboard. Wait until a maintainer assigns it to you before you start, so two people do not do the same work.
3. If an issue is unclear, ask in the issue thread before writing code.

## Setup

- Rust stable with the `wasm32v1-none` target: `rustup target add wasm32v1-none`
- stellar-cli v25.2.0 or newer, for wasm builds: `cargo install --locked stellar-cli`

```sh
cargo test                # unit tests (native)
stellar contract build    # wasm build
```

## Pull requests

- One issue per pull request. Put `Closes #<issue>` in the description.
- CI must pass: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
- Any change to contract behaviour needs a test that fails without the change.
- Keep public function signatures stable unless the issue says otherwise. If you must change one, say so in the pull request.

## Security

Do not open a public issue for a vulnerability. Contact the maintainers privately through GitHub security advisories on this repo.
