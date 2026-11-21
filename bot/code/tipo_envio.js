// Tipo de Envío · 14 h → mediodía, 20 h → noche, 21 h → resumen (hora de Bogotá). A mano: TIPO_PRUEBA y solo chats de prueba.
const TIPO_PRUEBA = 'resumen';
const hora = DateTime.now().setZone('America/Bogota').hour;
const manual = $execution.mode === 'manual' || $execution.mode === 'test';
const tipo = manual ? TIPO_PRUEBA : ({ 14: 'mediodia', 20: 'noche', 21: 'resumen' })[hora] || null;
if (!tipo) return [];
const p = { tipo, prueba: manual };
return [{ json: { ...p, p1: Buffer.from(JSON.stringify(p), 'utf8').toString('base64') } }];
