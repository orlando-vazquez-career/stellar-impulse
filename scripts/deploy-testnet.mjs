// Deploys the cosmetics contract and the marketplace to Stellar testnet, creates the
// catalog and writes a public deployment record. Secrets stay in the Stellar CLI key
// store, never in the repository. Re-running deploys fresh contracts (testnet can reset).
//
// Usage: node scripts/deploy-testnet.mjs [--smoke]
//   --smoke  also buys a piece, grants a reward, and sells a piece on the marketplace
//            between two test players, checking the 95/5 split.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const wasmPath = join(root, "contracts/target/wasm32v1-none/release/impulso_cosmetics.wasm");
const marketWasmPath = join(root, "contracts/target/wasm32v1-none/release/impulso_marketplace.wasm");
const recordPath = join(root, "contracts/deployments/testnet.json");
const stellar = process.env.STELLAR_BIN ?? "stellar";
const network = "testnet";
const passphrase = "Test SDF Network ; September 2015";
const nativeSac = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const XLM = 10_000_000n;
// Integer discriminants of the contract enums (lib.rs).
const SLOT = { Livery: 0, Trail: 1, Emblem: 2, Announcer: 3, Music: 4 };
const FAMILY = { Merit: 0, Veteran: 1, Collection: 2 };

// On-chain catalog (contract v4). Each hangar category keeps free pieces off chain; these are
// the premium pieces and the merit rewards. URIs are served by apps/web.
const catalog = [
  { id: 1, key: "aurora-andina", slot: "Livery", family: "Collection", transferable: true, cap: 0, price: 5n * XLM },
  { id: 2, key: "pulso-violeta", slot: "Trail", family: "Collection", transferable: true, cap: 0, price: 3n * XLM },
  { id: 3, key: "primera-victoria", slot: "Emblem", family: "Merit", transferable: false, cap: 0, price: 0n },
  { id: 4, key: "exploracion", slot: "Emblem", family: "Merit", transferable: false, cap: 0, price: 0n },
  { id: 5, key: "voz-analista", slot: "Announcer", family: "Collection", transferable: true, cap: 0, price: 4n * XLM },
  { id: 6, key: "musica-gravity-final-path", slot: "Music", family: "Collection", transferable: true, cap: 0, price: 2n * XLM },
];
const MARKET_FEE_BPS = 500;
const LISTING_LEDGERS = 30 * 17_280;

// Testnet sometimes drops the connection or times out; those are retried, contract errors are not.
const TRANSIENT = /ConnectionReset|SendRequest|Request timeout|client error \(Connect\)|No status yet|TRY_AGAIN_LATER|50[234]/;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function run(args, { allowFail = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const result = spawnSync(stellar, args, { encoding: "utf8" });
    if (result.error) throw new Error(`Cannot run ${stellar}: ${result.error.message}`);
    if (result.status !== 0 && attempt < 4 && TRANSIENT.test(result.stderr)) {
      console.warn(`Network hiccup on "${args.slice(0, 3).join(" ")}", retrying (${attempt}/3)`);
      pause(4000);
      continue;
    }
    if (result.status !== 0 && !allowFail) {
      throw new Error(`stellar ${args.join(" ")} failed:\n${result.stderr}`);
    }
    return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr };
  }
}

function identity(name) {
  const existing = run(["keys", "address", name], { allowFail: true });
  if (existing.ok) return existing.out;
  run(["keys", "generate", name, "--network", network, "--fund"]);
  return run(["keys", "address", name]).out;
}

const invoke = (contract, source, fn, args, opts) =>
  run(["contract", "invoke", "--id", contract, "--source", source, "--network", network, "--", fn, ...args], opts);

const smoke = process.argv.includes("--smoke");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const wasmHash = sha256(wasmPath);
const marketWasmHash = sha256(marketWasmPath);

const roles = {
  admin: identity("impulso-admin"),
  minter: identity("impulso-minter"),
  treasury: identity("impulso-treasury"),
};
console.log("Roles:", roles);

const sac = run(["contract", "id", "asset", "--asset", "native", "--network", network]).out;
if (sac !== nativeSac) throw new Error(`Unexpected native SAC ${sac}; update docs/blockchain.md`);

const deploy = run([
  "contract", "deploy", "--wasm", wasmPath, "--source", "impulso-admin", "--network", network, "--",
  "--admin", roles.admin, "--minter", roles.minter, "--treasury", roles.treasury,
  "--payment_token", sac, "--name", "Impulso Cosmetics", "--symbol", "IMPC",
]);
const contractId = deploy.out.split(/\s+/).pop();
const deployTx = (deploy.err.match(/[0-9a-f]{64}/g) ?? []).find((h) => h !== wasmHash) ?? null;
console.log("Contract:", contractId);

for (const c of catalog) {
  invoke(contractId, "impulso-admin", "create_class", [
    "--class_id", String(c.id), "--slot", String(SLOT[c.slot]), "--family", String(FAMILY[c.family]),
    "--transferable", String(c.transferable), "--supply_cap", String(c.cap),
    "--price", String(c.price), "--uri", `/cosmetics/${c.key}.json`,
  ]);
  console.log(`Class ${c.id} ${c.key} created`);
}
if (invoke(contractId, "impulso-admin", "version", []).out !== "4") throw new Error("Unexpected contract version");

const marketDeploy = run([
  "contract", "deploy", "--wasm", marketWasmPath, "--source", "impulso-admin", "--network", network, "--",
  "--admin", roles.admin, "--cosmetics", contractId, "--payment_token", sac,
  "--fee_recipient", roles.treasury, "--fee_bps", String(MARKET_FEE_BPS),
]);
const marketplaceId = marketDeploy.out.split(/\s+/).pop();
const marketDeployTx = (marketDeploy.err.match(/[0-9a-f]{64}/g) ?? []).find((h) => h !== marketWasmHash) ?? null;
if (invoke(marketplaceId, "impulso-admin", "version", []).out !== "1") throw new Error("Unexpected marketplace version");
console.log("Marketplace:", marketplaceId);

let smokeResult = null;
if (smoke) {
  const player = identity("impulso-player");
  const bought = invoke(contractId, "impulso-player", "buy", ["--buyer", player, "--class_id", "2"]).out;
  const rewardId = randomBytes(32).toString("hex");
  const granted = invoke(contractId, "impulso-minter", "grant", ["--to", player, "--class_id", "3", "--reward_id", rewardId]).out;
  const again = invoke(contractId, "impulso-minter", "grant", ["--to", player, "--class_id", "3", "--reward_id", rewardId], { allowFail: true });
  if (again.ok) throw new Error("Second grant with the same reward_id was accepted");
  const tokens = invoke(contractId, "impulso-player", "tokens_of", ["--owner", player]).out;
  const hasTrail = invoke(contractId, "impulso-player", "has_class", ["--owner", player, "--class_id", "2"]).out;
  // Marketplace: the player lists the trail, a second player buys it.
  const buyer = identity("impulso-buyer");
  const ledger = Number(/Sequence:\s*(\d+)/.exec(run(["ledger", "latest", "--network", network]).out)?.[1]);
  const price = 2n * XLM;
  const balance = (who) => BigInt(JSON.parse(invoke(sac, "impulso-player", "balance", ["--id", who]).out));
  const sellerBefore = balance(player);
  const treasuryBefore = balance(roles.treasury);
  const listing = invoke(marketplaceId, "impulso-player", "list", [
    "--seller", player, "--token_id", bought, "--price", String(price), "--live_until_ledger", String(ledger + LISTING_LEDGERS),
  ]).out;
  invoke(marketplaceId, "impulso-buyer", "buy", ["--buyer", buyer, "--listing_id", listing, "--max_price", String(price)]);
  const newOwner = JSON.parse(invoke(contractId, "impulso-player", "owner_of", ["--token_id", bought]).out);
  if (newOwner !== buyer) throw new Error("Marketplace sale did not move the piece");
  const fee = price * BigInt(MARKET_FEE_BPS) / 10_000n;
  const sellerGain = balance(player) - sellerBefore;
  const treasuryGain = balance(roles.treasury) - treasuryBefore;
  if (treasuryGain !== fee) throw new Error(`Fee mismatch: ${treasuryGain} != ${fee}`);
  // The seller also paid the listing's network fee (storage rent included), so the gain is under price - fee.
  const listingCost = price - fee - sellerGain;
  if (listingCost < 0n || listingCost > XLM / 2n) throw new Error(`Seller payout ${sellerGain} out of range`);
  console.log(`Listing network cost: ${Number(listingCost) / 1e7} XLM`);
  smokeResult = {
    player, buyer, boughtToken: Number(bought), grantedToken: Number(granted), duplicateGrantRejected: true,
    tokensOf: JSON.parse(tokens), hasClass2: hasTrail === "true",
    marketSale: { listingId: Number(listing), price: String(price), fee: String(fee), sellerReceived: String(sellerGain), newOwner },
  };
  console.log("Smoke:", smokeResult);
}

const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
mkdirSync(join(root, "contracts/deployments"), { recursive: true });
const record = {
  network, passphrase, contractId, contractVersion: 4, wasmSha256: wasmHash, deployTx, commit,
  deployedAt: new Date().toISOString(), paymentToken: { asset: "native XLM", sac },
  roles, classes: catalog.map(({ id, key, slot, family, transferable, cap, price }) => ({ id, key, slot, family, transferable, supplyCap: cap, priceStroops: String(price) })),
  marketplace: {
    contractId: marketplaceId, contractVersion: 1, wasmSha256: marketWasmHash, deployTx: marketDeployTx,
    feeBps: MARKET_FEE_BPS, feeRecipient: roles.treasury,
    explorer: `https://stellar.expert/explorer/testnet/contract/${marketplaceId}`,
  },
  smoke: smokeResult,
  explorer: `https://stellar.expert/explorer/testnet/contract/${contractId}`,
};
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
console.log(`Record written to ${recordPath}`);
