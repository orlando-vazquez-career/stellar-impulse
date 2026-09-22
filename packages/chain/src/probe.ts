import { probeTestnet, STELLAR_TESTNET } from "./index.js";

try {
  const result = await probeTestnet();
  console.log(JSON.stringify({ rpcUrl: STELLAR_TESTNET.rpcUrl, ...result }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Stellar probe failed.");
  process.exitCode = 1;
}
