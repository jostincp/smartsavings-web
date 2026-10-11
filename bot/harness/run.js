// Ejecuta un archivo de Code node de n8n con $input, $(), $execution y DateTime simulados.
const fs = require('fs');
const path = require('path');
const { DateTime, Settings } = require('luxon');

function runCode(file, { input = [], nodes = {}, execution = { id: 'e1', mode: 'manual' }, now } = {}) {
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'code', 'build', file), 'utf8');
  if (now) Settings.now = () => new Date(now).valueOf(); else Settings.now = () => Date.now();
  const wrap = (arr) => ({ all: () => arr, first: () => arr[0], last: () => arr[arr.length - 1], item: arr[0] });
  const $input = wrap(input);
  const $ = (name) => {
    if (!(name in nodes)) {
      return { isExecuted: false, first() { throw new Error('Referenced node is unexecuted: ' + name); }, all() { throw new Error('unexecuted ' + name); }, get item() { throw new Error('unexecuted ' + name); } };
    }
    const arr = nodes[name];
    return { isExecuted: true, ...wrap(arr) };
  };
  const fn = new Function('$input', '$', '$execution', 'DateTime', 'Buffer', 'console', '$now', code);
  return fn($input, $, execution, DateTime, Buffer, console, DateTime.now());
}
module.exports = { runCode, DateTime };
