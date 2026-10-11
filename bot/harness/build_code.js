// Inserta los prompts en los Code nodes y deja el código final en code/build/.
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '..', 'code');
const out = path.join(dir, 'build');
fs.mkdirSync(out, { recursive: true });
const plan = fs.readFileSync(path.join(dir, 'prompt_plan.txt'), 'utf8').trim();
const red = fs.readFileSync(path.join(dir, 'prompt_redaccion.txt'), 'utf8').trim();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  let s = fs.readFileSync(path.join(dir, f), 'utf8');
  const lit = (t) => '`' + t.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
  s = s.replace('__PROMPT_PLAN__', () => lit(plan)).replace('__PROMPT_REDACCION__', () => lit(red));
  new Function('$input', '$', '$execution', 'DateTime', 'Buffer', s); // falla aquí si hay un error de sintaxis
  fs.writeFileSync(path.join(out, f), s);
}
console.log('ok', fs.readdirSync(out).map((f) => f + ' ' + fs.statSync(path.join(out, f)).size).join(' | '));
