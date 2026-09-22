import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const commands = {
  test: ["cargo", "test", "--workspace", "--locked"],
  check: ["cargo", "check", "--workspace", "--all-targets", "--locked"],
  build: ["stellar", "contract", "build", "--locked"],
  fmt: ["cargo", "fmt", "--all", "--", "--check"],
};
const action = process.argv[2];
if (!Object.hasOwn(commands, action ?? "") || process.argv.length !== 3) {
  console.error("Usage: node scripts/contracts.mjs <test|check|build|fmt>");
  process.exit(2);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const [command, ...args] = commands[action];
let child;
if (process.platform === "win32") {
  const distro = process.env.IMPULSO_WSL_DISTRO;
  const distroArgs = distro ? ["--distribution", distro] : [];
  // The repository path is a positional argument, never executable shell text.
  const script = 'if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi; cd "$(wslpath -u "$1")/contracts" || exit; shift; exec "$@"';
  child = spawn("wsl.exe", [...distroArgs, "--exec", "bash", "-lc", script, "impulso-contracts", root, command, ...args], { stdio: "inherit" });
} else {
  child = spawn(command, args, { cwd: join(root, "contracts"), stdio: "inherit" });
}

child.on("error", (error) => {
  console.error(`Could not start the contract toolchain: ${error.message}`);
  console.error("See docs/blockchain.md for WSL, Rust and Stellar CLI setup.");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
