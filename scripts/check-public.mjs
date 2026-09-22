import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const failures = [];
const forbiddenDirectories = new Set(['node_modules', '.local', 'target', 'dist', 'coverage', 'test-results', 'playwright-report']);
for (const file of new Set(files)) {
  if (file.split('/').some(part => forbiddenDirectories.has(part))) { failures.push(file + ': generated or local artifact'); continue; }
  if (!fs.existsSync(file)) continue;
  if (fs.lstatSync(file).isSymbolicLink()) { failures.push(file + ': symlink'); continue; }
  const name = path.basename(file);
  if (name.startsWith('.env') && name !== '.env.example') { failures.push(file + ': environment file'); continue; }
  if (!/\.(md|json|ya?ml|[cm]?js|tsx?|rs|toml|sh|ps1|html|css|lock)$/.test(file) && !['LICENSE', '.gitignore', '.gitattributes', '.npmrc'].includes(name)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const checks = [
    [/\bS[A-Z2-7]{55}\b/, 'possible Stellar secret'],
    [/gh[pousr]_[A-Za-z0-9]{30,}/, 'possible access token'],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
    [/[A-Z]:[\\/](?:Users|dev)[\\/]/i, 'machine-specific path'],
    [/\/(?:Users|home)\/[^\s/]+\//, 'user-specific path'],
    [/(?:127\.0\.0\.1|localhost):(?:7777|8765|8766)\b/, 'private service reference']
  ];
  for (const [pattern, reason] of checks) if (pattern.test(text)) failures.push(file + ': ' + reason);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Public tree: no detected credentials, machine paths or private service references.');
