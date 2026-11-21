// Cadena local: Normalizar → Armar → (plan simulado) → Validar → [BD real aparte] → Resultados → Verificar
const { runCode } = require('./run');
const fs = require('fs');
const NOW = '2026-10-09T08:52:00-05:00';
const [,, paso, texto, planArg, dbArg, llmArg] = process.argv;
const ctxDB = JSON.parse(fs.readFileSync(__dirname + '/fx/ctx_t1.json', 'utf8'));
const chat = { json: { sessionId: 't1', action: 'sendMessage', chatInput: texto } };
const N = runCode('normalizar_entrada.js', { input: [chat], execution: { id: '9001', mode: 'manual' }, now: NOW })[0];
N.json.chat_id = 'qa-t1'; // la sesión de prueba ya registrada
const nodes = { 'Normalizar Entrada': [N], 'Cargar Contexto': [{ json: { r: ctxDB } }] };
const A = runCode('armar_contexto.js', { nodes, now: NOW })[0];
nodes['Armar Contexto'] = [A];
if (paso === 'armar') { console.log(A.json.ruta, JSON.stringify(A.json.plan_directo)); console.log(A.json.entrada_planificador); process.exit(0); }
const planIn = A.json.ruta === 'directo' ? [A] : [{ json: { choices: [{ message: { content: planArg } }] } }];
const V = runCode('validar_compilar.js', { input: planIn, nodes, now: NOW })[0];
nodes['Validar y Compilar'] = [V];
if (paso === 'validar') { console.log(JSON.stringify({ pasos: V.json.pasos, rechazos: V.json.rechazos, avisos: V.json.avisos })); console.log('P1=' + V.json.p1); process.exit(0); }
if (dbArg) nodes['Ejecutar Plan'] = [{ json: { r: JSON.parse(dbArg) } }];
const R = runCode('resultados.js', { input: [{ json: {} }], nodes, now: NOW })[0];
nodes['Resultados del Turno'] = [R];
const llm = llmArg ? [{ json: { choices: [{ message: { content: llmArg } }] } }] : [R];
const M = runCode('verificar_mensajes.js', { input: llm, nodes, now: NOW });
console.log(JSON.stringify({ usar_borrador: R.json.usar_borrador, necesita_redaccion: R.json.necesita_redaccion, plantilla: R.json.respuesta_plantilla, hechos: R.json.hechos, botones: R.json.botones, laterales: R.json.laterales }, null, 1));
console.log('---- texto_prueba ----\n' + (M[0].json.texto_prueba || JSON.stringify(M.map((x) => x.json.destino))));
console.log('fuente:', M[0].json.fuente, 'verificador:', M[0].json.verificador);
console.log('cierre:', Buffer.from(M[0].json.cierre_p1, 'base64').toString());
if (R.json.redactor_body) console.log('redactor user msg:', R.json.redactor_body.messages[1].content);
