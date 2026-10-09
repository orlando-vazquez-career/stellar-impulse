import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Railway replaces a deployment by sending SIGTERM to PID 1, which is pnpm running this exact
// command. Anything but exit code 0 marks the replaced deployment as failed. Windows has no
// SIGTERM delivery to child processes, so this runs on Linux and macOS only.
const root = fileURLToPath(new URL('../../../', import.meta.url));

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as { port: number };
  probe.close();
  await once(probe, 'close');
  return port;
}

describe.skipIf(process.platform === 'win32')('pnpm --filter @impulso/server start', () => {
  it('exits with code 0 when pnpm receives SIGTERM', async () => {
    const port = await freePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      AUTH_DATA_FILE: join(tmpdir(), `impulso-start-shutdown-${port}.json`),
    };
    delete env.DATABASE_URL;
    // Own process group, so a failed run cannot leave an orphaned server behind.
    const pnpm = spawn('pnpm', ['--filter', '@impulso/server', 'start'], {
      cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const exited = once(pnpm, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
    try {
      await new Promise<void>((resolve, reject) => {
        const collect = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes('Game server:')) resolve();
        };
        pnpm.stdout.on('data', collect);
        pnpm.stderr.on('data', collect);
        pnpm.once('error', reject);
        void exited.then(([code, signal]) => reject(new Error(
          `pnpm exited before the server started (code ${code}, signal ${signal}):\n${output}`)));
      });
      pnpm.kill('SIGTERM');
      const [code, signal] = await exited;
      expect({ code, signal }, output).toEqual({ code: 0, signal: null });
      expect(output).not.toContain('ERR_PNPM');
    } finally {
      try { process.kill(-pnpm.pid!, 'SIGKILL'); } catch { /* already gone */ }
    }
  }, 30_000);
});
