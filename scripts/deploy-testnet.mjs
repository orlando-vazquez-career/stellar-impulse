// Deploys the cosmetics contract to Stellar testnet, creates the demo catalog and
// writes a public deployment record. Secrets stay in the Stellar CLI key store,
// never in the repository. Re-running deploys a fresh contract (testnet can reset).
//
// Usage: node scripts/deploy-testnet.mjs [--smoke]
//   --smoke  also buys one piece and grants one reward with a test player account.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const wasmPath = join(root, "contracts/target/wasm32v1-none/release/impulso_cosmetics.wasm");
const recordPath = join(root, "contracts/deployments/testnet.json");
const stellar = process.env.STELLAR_BIN ?? "stellar";
const network = "testnet";
const passphrase = "Test SDF Network ; September 2015";
const nativeSac = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const XLM = 10_000_000n;
// Integer discriminants of the contract enums (lib.rs).
const SLOT = { Livery: 0, Trail: 1, Emblem: 2 };
const FAMILY = { Merit: 0, Veteran: 1, Collection: 2 };

// Demo catalog from brief v0.4: three slots, four pieces. URIs are served by apps/web.
const catalog = [
  { id: 1, key: "aurora-andina", slot: "Livery", family: "Collection", transferable: true, cap: 0, price: 5n * XLM },
  { id: 2, key: "pulso-violeta", slot: "Trail", family: "Collection", transferable: true, cap: 0, price: 3n * XLM },
  { id: 3, key: "primera-victoria", slot: "Emblem", family: "Merit", transferable: false, cap: 0, price: 0n },
  { id: 4, key: "exploracion", slot: "Emblem", family: "Merit", transferable: false, cap: 0, price: 0n },
];

function run(args, { allowFail = false } = {}) {
  const result = spawnSync(stellar, args, { encoding: "utf8" });
  if (result.error) throw new Error(`Cannot run ${stellar}: ${result.error.message}`);
  if (result.status !== 0 && !allowFail) {
    throw new Error(`stellar ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr };
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
const wasm = readFileSync(wasmPath);
const wasmHash = createHash("sha256").update(wasm).digest("hex");

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
if (invoke(contractId, "impulso-admin", "version", []).out !== "3") throw new Error("Unexpected contract version");

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
  smokeResult = { player, boughtToken: Number(bought), grantedToken: Number(granted), duplicateGrantRejected: true, tokensOf: JSON.parse(tokens), hasClass2: hasTrail === "true" };
  console.log("Smoke:", smokeResult);
}

const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
mkdirSync(join(root, "contracts/deployments"), { recursive: true });
const record = {
  network, passphrase, contractId, contractVersion: 3, wasmSha256: wasmHash, deployTx, commit,
  deployedAt: new Date().toISOString(), paymentToken: { asset: "native XLM", sac },
  roles, classes: catalog.map(({ id, key, slot, family, transferable, cap, price }) => ({ id, key, slot, family, transferable, supplyCap: cap, priceStroops: String(price) })),
  smoke: smokeResult,
  explorer: `https://stellar.expert/explorer/testnet/contract/${contractId}`,
};
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
console.log(`Record written to ${recordPath}`);
