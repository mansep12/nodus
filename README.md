# Nodus

Multilateral debt netting between businesses on Stellar.

## The idea

Small businesses owe each other money in circles: A owes B, B owes C, C owes A. Each one waits to get paid before it can pay, and liquidity stays locked up.

Nodus finds those circles, cancels all the debts at once and settles only the net balance.

> 3 million in debt cleared by moving 200 thousand.

## How it works

1. **Register.** The creditor registers what it is owed and the debtor accepts it with its signature.
2. **Detect.** An off-chain solver finds debt circles and proposes the netting.
3. **Sign.** Each party sees how much its debt goes down, how much its receivables go down and how much it pays net, and signs only its own part.
4. **Settle.** With the last signature, a single transaction cancels every obligation in the circle and moves the net amounts. Either everything happens or nothing does.

## Why Stellar

- **No central operator.** Each participant signs only its own part (`require_auth`) and all the signatures travel in the same transaction; no trusted clearing house is needed.
- **Atomic.** Cancelling the debts and paying the net amounts happen together or not at all.
- **Verifiable.** The contract events are the receipt.

## Two ways to settle

For a circle where A owes B 100, B owes C 80 and C owes A 90:

|                     | What gets cancelled                       | Money that moves                          |
| ------------------- | ----------------------------------------- | ----------------------------------------- |
| **Settle all**      | The three debts in full: 270              | 20 (A and C pay 10 each, B receives 20)   |
| **No money moved**  | What the debts have in common: 240        | 0. Debts of 20 and 10 remain open         |

In both cases no one ends up better or worse off than before: what each business stops collecting equals what it stops owing plus what it receives.

## Tested on testnet

- A circle of 20 businesses settled in [a single transaction](https://stellar.expert/explorer/testnet/tx/da968b3a8e5ec4a1008d67e5f6ef1bc9df330bf922fbb0e58862245558039b63) with 20 passkey signatures. It uses 33% of the compute and 44% of the size the network allows per transaction.
- A circle of 3 settled [without moving money](https://stellar.expert/explorer/testnet/tx/a2f068a9bf2dbdf736ddabf5860edcce487f0bf3230af49e246881f819558fdd) from the web app, with the fee paid by the relayer.

## Architecture

```
contracts/nodus          Soroban contract (Rust): debt registry and atomic settlement
contracts/allowlist      Smart account policy: limits a key to some Nodus functions
packages/contract-client TypeScript client generated from the contract
packages/stellar         Network config, relayer and passkey signature verification
packages/solver          Circle solver
packages/db              Postgres schema and migrations
packages/indexer         Copies contract events to Postgres
packages/api             Types of what the API returns
packages/e2e             Deployment and end-to-end tests against testnet
apps/web                 Next.js app and its API
```

- **Contract.** The creditor registers (`register`) and can void (`cancel`); the debtor accepts or rejects (`accept`, `reject`) and can pay directly (`pay`). `settle` takes the debts to cancel, computes each party's net amount, requires authorization from all of them and moves the net amounts in the settlement token. `keep_alive` keeps open debts from expiring on the network.
- **Accounts.** Each business is an OpenZeppelin smart account controlled by a passkey. No seed phrases, no extensions. A backup passkey can be added, which can do everything, and an accountant's passkey, which registers and accepts debts but cannot settle or move money.
- **Fees.** Every transaction is sent through OpenZeppelin Relayer (Channels), so no business needs XLM.
- **Signatures.** Each business signs its authorization entry separately. The server stores and forwards them but cannot alter them: the browser checks that what it signs is exactly the circle on screen, and the server verifies each signature before accepting it.
- **Solver.** Runs off-chain, inside the app, every time the debts change. It is not trusted: the contract validates everything again.

Details are in [docs/arquitectura.md](docs/arquitectura.md) and the trust model in [docs/seguridad.md](docs/seguridad.md) (both in Spanish).

## How to run it

Requirements: [Bun](https://bun.sh), Rust with the `wasm32v1-none` target and the [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli).

```bash
bun install
bun run contract:build                           # builds the contract and the policy
cp packages/e2e/.env.example packages/e2e/.env   # and fill in the relayer key
bun run deploy:testnet                           # deploys test token, contract and policy
bun run dev                                      # http://localhost:3000
```

`deploy:testnet` writes the addresses and keys the app needs to `apps/web/.env.local`. Without `DATABASE_URL` the app uses an embedded Postgres; with it, it connects to any Postgres (`bun run db:migrate` applies the schema). To deploy on Vercel with Supabase, or with the `Dockerfile`, see [deployment](docs/arquitectura.md#despliegue).

### Tests

```bash
bun run contract:test    # contracts
bun run test             # solver, indexer, signatures and UI
bun run e2e:settle 3 10  # measures a settlement of 3 and of 10 businesses on testnet
bun run e2e:netting      # debts, indexer, solver and settlement on testnet
```

With `--relayer`, `e2e:settle` and `e2e:netting` send the settlement through the relayer. CI also runs `format:check`, `lint`, `typecheck` and the app build.

`bun run deploy:sandbox && bun run dev:sandbox` starts a second instance on port 3001 with test keys instead of passkeys, and `bun run e2e:web http://localhost:3001` walks through all of it. `bun run demo:neighbors <address>` gives your business two neighbors driven by a script, so you can close a circle without playing every role.

## Known limitations

- Debts are declared by the parties; there is no link to tax invoices (SII).
- Business identity is not verified: the name is just a label.
- On-chain netting has no legal or accounting effect on its own.
- Who owes whom and how much is public. The app does not name the third parties in a circle, but their debts are on-chain and the server sees all of them.
- The settlement token is a test asset, not real USDC.
- The app proposes circles of up to 8 businesses; the 20-business one was built with a script.
- Runs only on testnet and nothing is audited. What should be reviewed before mainnet is in [docs/seguridad.md](docs/seguridad.md).

## License

[MIT](LICENSE). Built for [Find Your Way: Hackathon](https://blog.telluscoop.com/p/findyourway); 1st place, University Track.
