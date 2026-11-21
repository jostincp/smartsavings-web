// Expande workflow_sdk.js (con funciones auxiliares) a código SDK literal, que es lo único que acepta el validador de n8n.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'workflow_sdk.js'), 'utf8');
const i0 = src.indexOf('\n', src.indexOf('import '));
const iChain = src.indexOf('export default workflow(');
const body = src.slice(i0, iChain);
let chain = src.slice(iChain);

const EXPR = Symbol('expr');
const regs = [];
const stickies = [];
const mk = (factory) => (cfg) => { const h = { __id: regs.length, factory, cfg }; regs.push(h); return h; };
const stubs = {
  node: mk('node'), trigger: mk('trigger'), ifElse: mk('ifElse'), switchCase: mk('switchCase'), splitInBatches: mk('splitInBatches'),
  expr: (s) => ({ [EXPR]: s }),
  sticky: (content, nodes, cfg) => { const h = { content, nodes, cfg }; stickies.push(h); return h; },
  nextBatch: () => null,
};
new Function(...Object.keys(stubs), body)(...Object.values(stubs));

const names = [...body.matchAll(/^const (\w+) = (?:node|trigger|ifElse|switchCase|splitInBatches|code|pg|espera|openrouter|tgTexto|waTexto|reloj)\(/gm)].map((m) => m[1]);
if (names.length !== regs.length) throw new Error('nombres ' + names.length + ' vs nodos ' + regs.length);
const nameOf = (h) => names[h.__id];
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function ser(v, ind) {
  if (v && v[EXPR] !== undefined) return 'expr(' + JSON.stringify(v[EXPR]) + ')';
  if (Array.isArray(v)) return '[' + v.map((x) => ser(x, ind + 1)).join(', ') + ']';
  if (v && typeof v === 'object') {
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    const sep = ind === 0 ? ',\n  ' : ', ';
    return e.length ? '{ ' + (ind === 0 ? '\n  ' : '') + e.map(([k, x]) => key(k) + ': ' + ser(x, ind + 1)).join(sep) + (ind === 0 ? '\n' : ' ') + '}' : '{}';
  }
  return JSON.stringify(v);
}
let out = "import { workflow, node, trigger, sticky, ifElse, switchCase, splitInBatches, nextBatch, expr } from '@n8n/workflow-sdk';\n\n";
regs.forEach((h) => { delete h.cfg.output; out += 'const ' + nameOf(h) + ' = ' + h.factory + '(' + ser(h.cfg, 0) + ');\n\n'; });
stickies.forEach((s, i) => {
  out += 'const nota' + i + ' = sticky(' + JSON.stringify(s.content) + ', [' + s.nodes.map(nameOf).join(', ') + '], ' + ser(s.cfg, 0) + ');\n';
  chain = chain.replace('notas[' + i + ']', 'nota' + i);
});
out += '\n' + chain;
fs.writeFileSync(path.resolve(__dirname, '..', 'workflow_sdk.gen.js'), out);
console.log('nodos', regs.length, 'notas', stickies.length, 'bytes', out.length);
