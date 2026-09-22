import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const errors = [];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
for (const file of walk('packages/sim/src').filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function inspect(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const dep = node.moduleSpecifier.text;
      if (dep !== '@impulso/input' && !dep.startsWith('.')) errors.push(file + ': forbidden dependency ' + dep);
      if (dep.startsWith('.') && !path.resolve(path.dirname(file), dep).startsWith(path.resolve(root, 'packages/sim') + path.sep)) errors.push(file + ': relative import escapes sim');
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) errors.push(file + ': dynamic imports prohibited');
    if (ts.isIdentifier(node) && ['Date', 'fetch', 'WebSocket', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'performance', 'crypto', 'process'].includes(node.text)) errors.push(file + ': ambient source ' + node.text);
    if (ts.isPropertyAccessExpression(node) && node.getText(source) === 'Math.random') errors.push(file + ': nondeterministic random');
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}
const pkg = JSON.parse(fs.readFileSync('packages/sim/package.json', 'utf8'));
for (const dep of Object.keys(pkg.dependencies ?? {})) if (dep !== '@impulso/input') errors.push('sim dependency: ' + dep);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Simulation boundary: isolated from network, cosmetics and rendering.');
