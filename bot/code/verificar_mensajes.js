// Verificar y Armar Mensajes · ninguna cifra sin respaldo, ninguna afirmación sin operación real; arma las burbujas por canal.
const leer = (nombre) => { try { const n = $(nombre); if (n.isExecuted === false) return null; return n.first().json; } catch (e) { return null; } };
const N = $('Normalizar Entrada').first().json;
const ctx = leer('Armar Contexto');
const R = leer('Resultados del Turno');
const inp = $input.first().json || {};
const cfg = (ctx && ctx.config) || {};
const RED = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
const FALLA = 'Se me enredó algo por acá y no alcancé a guardar nada. ¿Me lo mandas otra vez en un ratico?';
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

const falla = inp.falla === true || !ctx || !R || R.falla === true;
const permitidos = new Set((R && R.numeros_permitidos) || []);
const porcentajes = new Set((R && R.porcentajes) || []);
const ESCRITURA = ['anotado', 'factura_guardada', 'correccion', 'borrado', 'desvinculado', 'recordatorios', 'nombre', 'canal_principal', 'cuenta', 'pago_tarjeta', 'cancelado', 'olvido'];
const huboEscritura = !!(R && (R.hechos || []).some((h) => h.ok === true && ESCRITURA.includes(h.op)));
const yaAnotado = !!(R && ((R.rechazados || []).some((x) => x.motivo === 'ya_anotado') || (R.hechos || []).some((h) => h.ya_estaba)));
const correccionPendiente = !!(R && (R.hechos || []).some((h) => h.op === 'correccion' && h.requiere_confirmacion) && !(R.hechos || []).some((h) => h.op === 'correccion' && h.ok === true));
const NO_ANTES = '(?<!\\bno\\s(?:lo\\s|la\\s|los\\s|las\\s|te\\s|le\\s)?)';
const AFIRMA = new RegExp('(^|[^a-záéíóúñü])' + NO_ANTES + '(anoté|guardé|borré|corregí|cambié|apagué|prendí|desconecté|registré)(?![a-záéíóúñü])', 'i');
const QUEDO = /qued[oó] (anotad|guardad|registrad|borrad|corregid)/i;
const CORREGIDO = /(^|[^a-záéíóúñü])(corregid[oa]|actualizad[oa])(?![a-záéíóúñü])/i;

function valorDe(s) {
  let t = s.toLowerCase().replace(/^(usd|us\$|eur|€)\s*/, '').replace(/\$\s*/, '').trim();
  let mult = 1;
  if (/(millones|millón|millon)$/.test(t)) { mult = 1e6; t = t.replace(/\s*(millones|millón|millon)$/, ''); }
  else if (/(mil|k|lucas)$/.test(t)) { mult = 1e3; t = t.replace(/\s*(mil|k|lucas)$/, ''); }
  let v;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) v = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+,\d{1,2}$/.test(t)) v = Number(t.replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) v = Number(t.replace(/,/g, ''));
  else v = Number(t.replace(',', '.'));
  return v * mult;
}
function verificar(texto) {
  if (!texto || typeof texto !== 'string') return 'vacio';
  if (texto.length > 1500) return 'muy_largo';
  if (/\b(transacci[oó]n(es)?|base de datos|json|token|prompt|uuid|ref\s?\d+|lote\s?\d+)\b|pa:[A-Za-z0-9]{10}/i.test(texto)) return 'vocabulario';
  let t = texto
    .replace(/\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?)?/gi, ' ')
    .replace(/\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(\s+de\s+\d{4})?/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b20[2-3]\d\b/g, ' ');
  for (const m of t.matchAll(/\b\d{1,3}\s?%/g)) { const p = parseInt(m[0], 10); if (![p - 1, p, p + 1].some((x) => porcentajes.has(x))) return 'porcentaje_sin_respaldo:' + m[0]; }
  t = t.replace(/\b\d{1,3}\s?%/g, ' ');
  const re = /((?:usd|us\$|eur|€)\s?\d+(?:[.,]\d+)*|\$\s?\d{1,3}(?:\.\d{3})+(?:,\d+)?(?:\s?(?:millones|millón))?|\$\s?\d+(?:,\d+)?(?:\s?(?:millones|millón|mil|k))?|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:,\d+)?\s?(?:millones|millón|mil|k|lucas)\b|\b\d{3,}\b)/gi;
  for (const m of t.matchAll(re)) {
    const v = valorDe(m[0]);
    const ext = /^(usd|us\$|eur|€)/i.test(m[0]);
    if (!Number.isFinite(v) || (v < 100 && !ext)) continue;
    const ok = permitidos.has(Math.round(v * 100) / 100) || permitidos.has(Math.round(v)) ||
      Array.from(permitidos).some((x) => x >= 1e6 && Math.abs(x - v) / x < 0.05 && /millon/i.test(m[0]));
    if (!ok) return 'cifra_sin_respaldo:' + m[0];
  }
  // Solo el pretérito con tilde afirma algo hecho; «¿quieres que lo anote?» es una pregunta legítima
  if (!huboEscritura && (AFIRMA.test(texto) || (!yaAnotado && QUEDO.test(texto)))) return 'afirma_sin_operacion';
  if (correccionPendiente && CORREGIDO.test(texto)) return 'afirma_sin_operacion';
  return null;
}
// Una plantilla que viene del LLM (la «pregunta» del plan) también pasa por el verificador
const respaldo = () => (R.plantilla_llm && verificar(R.respuesta_plantilla) ? '¿Me lo repites con otras palabras?' : R.respuesta_plantilla);
const limpiar = (s) => String(s || '').replace(/\*\*/g, '*').replace(/^#+\s*/gm, '').replace(/\[\[OPCIONES[^\]]*\]\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();

let texto, motivo = null, fuente = 'plantilla';
if (falla) { texto = FALLA; }
else if (R.necesita_redaccion) {
  let llm = null;
  try { llm = inp.choices[0].message.content; } catch (e) { llm = null; }
  llm = llm ? limpiar(llm) : null;
  motivo = llm ? verificar(llm) : 'redactor_sin_respuesta';
  if (!motivo) { texto = llm; fuente = 'redactor'; } else texto = respaldo();
} else if (R.usar_borrador) {
  const b = limpiar(R.borrador);
  const conPregunta = [b, R.pregunta && !b.includes(String(R.pregunta).slice(0, 25)) ? R.pregunta : ''].filter(Boolean).join(' [[PAUSA]] ');
  motivo = verificar(conPregunta);
  if (!motivo) { texto = conPregunta; fuente = 'borrador'; } else texto = respaldo();
} else texto = respaldo();
if (!falla && fuente === 'redactor' && R.pregunta && !texto.includes(String(R.pregunta).slice(0, 25)) && !/\?\s*$/.test(texto)) {
  const conP = texto + ' [[PAUSA]] ' + R.pregunta;
  if (!verificar(conP)) texto = conP;
}

let partes = String(texto).split('[[PAUSA]]').map((s) => s.trim()).filter(Boolean);
if (partes.length > 2) partes = [partes[0], partes.slice(1).join(' ')];
if (!partes.length) partes = [FALLA];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (s) => esc(s).replace(/\*([^*\n]{1,80})\*/g, '<b>$1</b>');
const corta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function burbuja(platform, chat_id, txt, opciones) {
  const o = opciones || {};
  const t = corta(String(txt), o.imagen ? 1024 : 4000);
  const botones = (o.botones || []).slice(0, 2).map((b) => ({ id: b.id, title: corta(b.title, 20) }));
  let destino = platform === 'telegram' ? 'tg_texto' : 'wa_texto';
  if (o.imagen) destino = platform === 'telegram' ? 'tg_foto' : 'wa_imagen';
  else if (botones.length === 2) destino = platform === 'telegram' ? 'tg_botones' : 'wa_botones';
  return { destino, platform, chat_id: String(chat_id), texto: t, texto_tg: html(t), texto_tg_plano: esc(t.replace(/\*([^*\n]{1,80})\*/g, '$1')), botones, imagen_url: o.imagen || null,
    wa_payload: destino === 'wa_botones' ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(chat_id), type: 'interactive',
      interactive: { type: 'button', body: { text: corta(t, 1024) }, action: { buttons: botones.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) } } } : null,
    lateral: !!o.lateral, tipo: o.tipo || 'respuesta' };
}

const burbujas = [];
const plat = N.platform, chat = N.chat_id;
((ctx && ctx.entrega_codigo) || []).forEach((c) => burbujas.push(burbuja(plat, chat, 'Hola, alguien quiere conectar un ' + (RED[c.para] || c.para) + ' a tu cuenta de SmartSavings. Si eres tú, escribe este código allá: ' + c.codigo + '. Vence en 10 minutos. Si no fuiste tú, ignora este mensaje: tu cuenta sigue segura.', { tipo: 'codigo' })));
partes.forEach((p, i) => {
  const ultima = i === partes.length - 1;
  burbujas.push(burbuja(plat, chat, p, { imagen: i === 0 && R && R.imagen_url && !falla ? R.imagen_url : null, botones: ultima && !falla && R ? R.botones : [] }));
});
if (!falla && R) (R.laterales || []).forEach((l) => burbujas.push(burbuja(l.platform, l.chat_id, l.texto, { botones: l.botones, lateral: true, tipo: l.tipo })));

const samiMemoria = partes.join('\n');
const hechosMem = ((R && R.hechos_memoria) || []).slice();
// Sin Armar Contexto no hubo máscaras: se tapan secuencias largas de dígitos (códigos, tarjetas, cédulas) antes de guardar
const personaCruda = String(N.text || '').replace(/(?<![\d.,])\d(?:[ -]?\d){5,18}(?![\d.,])/g, '[NÚMERO]').slice(0, 1200);
const cierre = { platform: plat, chat_id: chat, message_key: N.message_key, persona: (ctx && ctx.persona_memoria) || personaCruda,
  sami: samiMemoria, hechos: hechosMem, status: falla ? 'failed' : 'done', verificador: motivo && fuente === 'plantilla' && motivo !== 'redactor_sin_respuesta' ? motivo : undefined };
const cierre_p1 = b64(cierre);

const permitidosReales = Array.isArray(cfg.permitidos_reales) ? cfg.permitidos_reales.map(String) : [];
const modo = N.modo_envio;
const prueba = modo === 'chat' || (modo === 'simulado' && !permitidosReales.includes(String(chat)));
if (prueba) {
  const render = (b) => {
    let s = b.texto;
    if (b.imagen_url) s = '[imagen: gráfica]\n' + s;
    if (b.botones.length) s += '\n' + b.botones.map((x) => '[' + x.title + ']').join(' · ') + '   (escribe #ok o #no)';
    if (b.lateral) {
      if (String(b.chat_id).startsWith('qa-')) return '[Le llegaría a tu otro canal (' + b.platform + ')]: ' + s;
      if (b.tipo === 'admin') return '[Alerta al administrador (simulada)]: ' + s;
      return '[simulado, sin enviar a ' + b.platform + ']: ' + s.replace(/\b\d{6}\b/g, '••••••');
    }
    return s;
  };
  return [{ json: { prueba: true, origen: N.origen, texto_prueba: burbujas.map(render).join('\n· · ·\n'), cierre_p1, fuente, verificador: motivo, burbujas } }];
}
return burbujas.map((b) => ({ json: { ...b, prueba: false, origen: N.origen, cierre_p1 } }));
