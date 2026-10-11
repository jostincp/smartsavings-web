// Armar Contexto · máscaras, [CONTEXTO], historial, corpus de evidencia, ruta y plan directo (sin LLM).
const PROMPT_PLAN_VERSION = 'PROMPT_PLAN v1.1';
const PROMPT_PLAN = __PROMPT_PLAN__;

const N = $('Normalizar Entrada').first().json;
const C = $('Cargar Contexto').first().json.r;
const leer = (nombre) => { try { const n = $(nombre); if (n.isExecuted === false) return null; return n.first().json; } catch (e) { return null; } };
const T = leer('Limpiar Transcripción');
const F = leer('Validar Factura');
const B = leer('Guardar Borrador Factura');
const cfg = C.config || {};
const tz = 'America/Bogota';
const ahora = (() => {
  const t = DateTime.fromISO(String(N.received_at || ''), { zone: tz });
  return t.isValid && Math.abs(DateTime.now().diff(t, 'minutes').minutes) <= 15 ? t : DateTime.now().setZone(tz);
})();
const hoy = ahora.toISODate();
const ayer = ahora.minus({ days: 1 }).toISODate();
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CAT_PERSONA = { 'Restaurantes y Bares': 'comida por fuera', 'Alimentación': 'mercado', 'Transporte': 'transporte', 'Viajes y Hospedaje': 'viajes',
  'Vivienda': 'vivienda', 'Servicios': 'servicios y suscripciones', 'Salud': 'salud', 'Entretenimiento': 'entretenimiento', 'Educación': 'educación',
  'Tecnología': 'tecnología', 'Cuidado Personal': 'cuidado personal', 'Ropa y Calzado': 'ropa y zapatos', 'Hogar': 'hogar',
  'Deudas y Préstamos': 'deudas y préstamos', 'Otros': 'otros', 'Salario': 'salario', 'Freelance': 'trabajo independiente', 'Ventas': 'ventas',
  'Inversiones': 'inversiones', 'Bonos': 'bonos', 'Pago de Tarjeta': 'pago de tarjeta' };
const MEDIO_PERSONA = { efectivo: 'efectivo', debito: 'débito', credito: 'tarjeta de crédito', transferencia: 'transferencia', otro: 'otro medio' };
const COP = (n) => { const v = Math.round(Math.abs(Number(n) || 0)); return (Number(n) < 0 ? '-' : '') + '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
const dinero = (monto, moneda, cop) => (!moneda || moneda === 'COP') ? COP(monto) : moneda + ' ' + String(monto).replace('.', ',') + (cop != null ? ' (≈ ' + COP(cop) + ')' : '');
const hora12 = (d) => d.toFormat('h:mm') + (d.hour < 12 ? ' a. m.' : ' p. m.');
const cuando = (s) => {
  const d = DateTime.fromFormat(String(s), 'yyyy-MM-dd HH:mm', { zone: tz });
  if (!d.isValid) return String(s);
  const dia = d.toISODate();
  const base = dia === hoy ? 'hoy' : dia === ayer ? 'ayer' : DIAS[d.weekday - 1] + ' ' + d.day + ' de ' + MESES[d.month - 1];
  return base + ' ' + hora12(d);
};

// ---------- Texto de entrada y máscaras ----------
const tipoEntrada = { texto: 'texto', audio: 'nota_de_voz', imagen: 'foto', pdf: 'pdf', boton: 'boton', no_soportado: 'no_soportado' }[N.input_type] || 'texto';
let texto = N.text || '';
let transcripcionOk = null;
if (N.input_type === 'audio') { transcripcionOk = !!(T && T.transcripcion_ok); texto = T && T.texto ? T.texto : ''; }
if (N.input_type === 'imagen' || N.input_type === 'pdf') texto = (N.media && N.media.caption) || N.text || '';
const vinculacion = C.vinculacion || null;
let codigoDetectado = null;
const mCod = vinculacion && vinculacion.entregado ? String(texto).match(/^\D{0,20}(\d{6})\D{0,20}$/) : null;
if (mCod) { codigoDetectado = mCod[1]; texto = texto.replace(mCod[1], '[CÓDIGO]'); }
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let x = +d[i]; if (alt) { x *= 2; if (x > 9) x -= 9; } s += x; alt = !alt; } return s % 10 === 0; };
let datoSensible = false;
texto = texto.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => { const d = m.replace(/\D/g, ''); if (d.length >= 13 && d.length <= 19 && luhn(d)) { datoSensible = true; return '[DATO SENSIBLE]'; } return m; });
texto = texto.replace(/\b(c[ée]dula|cc|c\.c\.)\s*(n[uú]mero|no\.?)?\s*:?\s*\d[\d. ]{5,12}\d/gi, () => { datoSensible = true; return '[DATO SENSIBLE]'; });
texto = texto.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/<\/?\s*mensaje_usuario/gi, '‹mensaje').slice(0, 2000);

// ---------- Pendientes (más el borrador de factura de este turno) ----------
const pendientes = (C.pendientes || []).slice();
let factura = null;
if (F && F.factura) {
  const f = F.factura;
  const porCat = {};
  (f.items || []).forEach((i) => { porCat[i.categoria] = (porCat[i.categoria] || 0) + i.precio; });
  factura = { es_factura: f.es_factura, legible: f.legible, tienda: f.tienda, fecha: f.fecha, moneda: f.moneda, total: f.total, suma: f.suma,
    cuadra: f.cuadra, n_items: (f.items || []).length,
    items: (f.items || []).map((i, k) => ({ n: k + 1, producto: i.producto, precio: i.precio, categoria: i.categoria })),
    por_categoria: Object.entries(porCat).map(([c, t]) => ({ categoria: c, total: t })).sort((a, b) => b.total - a.total) };
  if (B && B.r && B.r.borrador_id) pendientes.push({ id: B.r.borrador_id, kind: 'receipt_draft', payload: f, creado_en: N.message_key, vence_min: 1440, nuevo: true });
}

// Botones del chat de pruebas: #ok / #no actúan sobre el pendiente más reciente
let optionId = N.option_id || null;
if (optionId === '#ok' || optionId === '#no') {
  const p = pendientes.filter((x) => x.creado_en !== N.message_key).slice(-1)[0];
  optionId = p ? 'pa:' + p.id + ':' + (optionId === '#ok' ? 'ok' : 'no') : null;
}
let tituloBoton = N.input_type === 'boton' ? (N.text || '') : '';

// ---------- Plan directo (sin LLM) ----------
const AFIRMA_PURA = /^\s*(s[ií]+|sip|dale|de una|h[aá]gale|listo|ok(ey)?|okay|confirmo|correcto|claro|b[oó]rr[ae]l[oa]s?|gu[aá]rdal[oa]s?|an[oó]tal[oa]s?)[\s.!]*$/i;
const NIEGA_PURA = /^\s*(no|nel|mejor no|cancela|d[eé]jalo|no gracias)[\s.!]*$/i;
const CONFIRMABLES = ['delete_confirm', 'tx_confirm', 'tx_update', 'receipt_draft'];
const FIJO = {
  boton_vencido: 'Ese botón ya venció; dime otra vez qué quieres hacer.',
  no_soportado: 'Por ahora entiendo texto, notas de voz y fotos de facturas 🙂 ¿Me lo cuentas por ahí?',
  audio_malo: 'Ese audio no lo alcancé a entender, había mucho ruido. ¿Me lo repites o me lo escribes?',
  factura_ilegible: 'No alcancé a leer bien la factura. ¿Me mandas otra foto con buena luz, o me dices el total?',
  extra_medios: 'Me llegaron varios archivos juntos; mándamelos de a uno, porfa, y los voy revisando.',
};
const previos = pendientes.filter((p) => p.creado_en !== N.message_key);
let planDirecto = null;
const plano = (acciones, respuesta, extra) => ({ acciones, respuesta: respuesta || '', pregunta: null, tono: 'normal', ...(extra || {}) });
if (optionId && /^pa:[A-Za-z0-9]{10}:(ok|no|editar)$/.test(optionId)) {
  const [, id, act] = optionId.split(':');
  const p = pendientes.find((x) => x.id === id);
  if (!p) planDirecto = plano([], FIJO.boton_vencido, { fijo: true });
  else if (act === 'ok') planDirecto = plano([{ accion: 'confirmar_pendiente', args: { pendiente_id: id } }].concat(p.kind === 'link_notice'
    ? [{ accion: 'avisar_equipo', args: { tipo: 'seguridad', resumen: 'La persona tocó «No fui yo» después de una vinculación' } }] : []));
  else if (act === 'no') planDirecto = plano([{ accion: 'cancelar_pendiente', args: { pendiente_id: id } }]);
  else { texto = 'Quiero cambiar algo de la factura'; }
} else if (optionId === 'resumen_mes' || /^\s*resumen\s*[.!]*\s*$/i.test(texto)) {
  planDirecto = plano([{ accion: 'consultar', args: { periodo: 'este_mes', tipo: 'ambos', agrupar_por: 'categoria', comparar: true } }],
    'GUIA: resumen del mes: gastos, ingresos y balance, las categorías más grandes y cómo va frente a los mismos días del mes pasado');
} else if (codigoDetectado) {
  planDirecto = plano([{ accion: 'verificar_codigo', args: {} }]);
} else if (/no fui yo/i.test(texto) && pendientes.some((p) => p.kind === 'link_notice')) {
  const p = pendientes.find((x) => x.kind === 'link_notice');
  planDirecto = plano([{ accion: 'confirmar_pendiente', args: { pendiente_id: p.id } },
    { accion: 'avisar_equipo', args: { tipo: 'seguridad', resumen: 'La persona escribió «no fui yo» después de una vinculación' } }]);
} else if (AFIRMA_PURA.test(texto) && previos.filter((p) => CONFIRMABLES.includes(p.kind)).length === 1) {
  planDirecto = plano([{ accion: 'confirmar_pendiente', args: { pendiente_id: previos.find((p) => CONFIRMABLES.includes(p.kind)).id } }]);
} else if (NIEGA_PURA.test(texto) && previos.length === 1 && previos[0].kind !== 'link_notice') {
  // En el aviso de vinculación un «no» puede querer decir «no fui yo»: lo resuelve el planificador.
  planDirecto = plano([{ accion: 'cancelar_pendiente', args: { pendiente_id: previos[0].id } }]);
} else if (N.extra_medios) {
  planDirecto = plano([], FIJO.extra_medios, { fijo: true });
} else if (N.input_type === 'no_soportado') {
  planDirecto = plano([], FIJO.no_soportado, { fijo: true });
} else if (N.input_type === 'audio' && !transcripcionOk) {
  planDirecto = plano([], FIJO.audio_malo, { fijo: true });
} else if ((N.input_type === 'imagen' || N.input_type === 'pdf') && factura && factura.es_factura && !factura.legible) {
  planDirecto = plano([], FIJO.factura_ilegible, { fijo: true });
}

// ---------- Corpus de evidencia y memoria ----------
const historial = (C.historial || []).slice(-16);
const registrado = !!C.registrado;
const estado = registrado ? 'registrado' : (vinculacion ? 'vinculacion_pendiente' : 'nuevo');
const ventana = registrado ? 30 : 1440;
const quitarPrefijo = (s) => String(s || '').replace(/^\[[^\]]{0,60}\]\s*/, '').replace(/^\(tocó[^)]*\)\s*/, '');
const corpus = [{ mk: N.message_key, texto, actual: true }];
historial.filter((h) => h.role === 'persona' && Number(h.hace_min) <= ventana).slice(-4).reverse()
  .forEach((h) => corpus.push({ mk: h.mk, texto: quitarPrefijo(h.content).slice(0, 500), actual: false }));

let personaMemoria = texto;
if (N.input_type === 'audio') personaMemoria = '[nota de voz] ' + (transcripcionOk ? texto : '(no se entendió)');
else if ((N.input_type === 'imagen' || N.input_type === 'pdf') && factura) personaMemoria = '[' + (N.input_type === 'pdf' ? 'PDF' : 'foto') + ' de factura' + (factura.legible ? ': ' + (factura.tienda || 'tienda') + ', ' + factura.n_items + ' productos' : ': no se pudo leer') + '] ' + texto;
else if (N.input_type === 'imagen' || N.input_type === 'pdf') personaMemoria = '[' + N.input_type + '] ' + texto;
else if (N.input_type === 'boton') personaMemoria = '(tocó «' + (tituloBoton || optionId || 'un botón') + '»)';
else if (N.input_type === 'no_soportado') personaMemoria = '[archivo no soportado] ' + texto;
personaMemoria = personaMemoria.slice(0, 1200);

// ---------- Bloque [CONTEXTO] ----------
const prefs = C.prefs || { mediodia: true, noche: true, resumen: true };
const sino = (b) => (b === false ? 'no' : 'sí');
const canales = (C.canales || []).map((c) => c.platform + (c.principal ? ' (principal)' : '') + (c.es_este ? ' [este chat]' : '')).join(', ') || '(ninguno: no tiene cuenta)';
const ultimos = C.ultimos || [];
const lineasMov = ultimos.map((u) => '- ref ' + u.ref + ' · lote ' + u.lote + ' · ' + cuando(u.fecha) + ' · ' + ({ expense: 'gasto', income: 'ingreso', transfer: 'pago de tarjeta' }[u.tipo] || u.tipo) + ' · ' +
  (u.descripcion || '') + ' · ' + dinero(u.monto, u.moneda, u.cop) + ' · ' + (CAT_PERSONA[u.categoria] || u.categoria || '') + (u.medio ? ' · ' + (MEDIO_PERSONA[u.medio] || u.medio) : '') +
  (u.mk === N.editado_de && N.editado_de ? ' · (del mensaje editado)' : ''));
const KIND = { delete_confirm: 'borrar', tx_confirm: 'anotar (espera un sí)', tx_update: 'corregir (espera un sí)', receipt_draft: 'factura leída sin guardar', link_notice: 'aviso de canal conectado' };
const descPend = (p) => {
  const pl = p.payload || {};
  if (p.kind === 'delete_confirm') return (pl.items || []).length + ' movimiento(s), ' + COP(pl.total_cop);
  if (p.kind === 'tx_confirm') return (pl.items || []).map((i) => (i.description || '') + ' ' + dinero(i.amount, i.currency)).join(', ') + (pl.motivo ? ' (' + pl.motivo + ')' : '');
  if (p.kind === 'tx_update') return 'ref ' + pl.ref + ' ' + JSON.stringify(pl.cambios || {});
  if (p.kind === 'receipt_draft') return (pl.tienda || 'factura') + ', ' + (pl.items || []).length + ' productos, total ' + COP(pl.total);
  if (p.kind === 'link_notice') return 'se conectó un ' + (pl.plataforma || 'canal') + ' a la cuenta';
  return '';
};
const lineasPend = pendientes.map((p) => '- id ' + p.id + ' · ' + (KIND[p.kind] || p.kind) + ' · ' + descPend(p) + ' · creado en un mensaje anterior: ' + (p.creado_en !== N.message_key ? 'sí' : 'no') + ' · vence en ' + p.vence_min + ' min');
const proactivo = C.ultimo_proactivo ? ({ proactivo_mediodia: 'recordatorio de las 2:00 p. m.', proactivo_noche: 'recordatorio de las 8:00 p. m.', proactivo_resumen: 'resumen de las 9:00 p. m.' }[C.ultimo_proactivo.tipo] || C.ultimo_proactivo.tipo) + ', hace ' + C.ultimo_proactivo.hace_min + ' min: «' + String(C.ultimo_proactivo.texto || '').slice(0, 160) + '»' : '(ninguno)';
const vinc = vinculacion ? 'esperando código · ' + (vinculacion.entregado ? 'código enviado a su ' + vinculacion.destino : 'debe escribir «hola» desde su ' + vinculacion.destino + ' para recibirlo') + ' · intentos restantes ' + vinculacion.intentos_restantes + ' · vence en ' + vinculacion.vence_min + ' min' : '(ninguna)';
const ctxLineas = [
  '[CONTEXTO]',
  'fecha_hora_local: ' + DIAS[ahora.weekday - 1] + ' ' + ahora.day + ' de ' + MESES[ahora.month - 1] + ' de ' + ahora.year + ', ' + hora12(ahora) + ' (Bogotá) · hoy=' + hoy + ' · ayer=' + ayer,
  'canal_actual: ' + N.platform + ' · estado_usuario: ' + estado + ' · nombre: ' + (C.nombre || '(sin nombre)') + ' · nombre_perfil: ' + (N.sender && N.sender.name ? String(N.sender.name).slice(0, 40) : '(sin nombre)'),
  'canales: ' + canales,
  'recordatorios: 2:00 p. m. ' + sino(prefs.mediodia) + ' · 8:00 p. m. ' + sino(prefs.noche) + ' · resumen 9:00 p. m. ' + sino(prefs.resumen),
  'tipo_entrada: ' + tipoEntrada + (transcripcionOk === null ? '' : ' · transcripcion_ok: ' + (transcripcionOk ? 'sí' : 'no')) + ' · minutos_desde_ultimo_mensaje: ' + (C.minutos_desde_ultimo == null ? '(primera vez)' : C.minutos_desde_ultimo) + ' · avisos_sin_entregar: ' + (C.avisos_sin_entregar || 0),
  'soporte: ' + (cfg.correo_soporte || '(no configurado)') + ' · politica_datos: ' + (cfg.link_politica || '(no configurada)'),
  'deuda_tarjeta_anotada: ' + (C.deuda_tarjeta == null ? '(sin cuenta)' : COP(Math.max(0, C.deuda_tarjeta))),
  'ultimo_mensaje_proactivo: ' + proactivo,
  'ultimos_movimientos:' + (lineasMov.length ? '\n' + lineasMov.join('\n') : ' (ninguno)'),
  'pendientes:' + (lineasPend.length ? '\n' + lineasPend.join('\n') : ' (ninguno)'),
  'vinculacion: ' + vinc,
];
if (factura) ctxLineas.push('factura_leida: ' + JSON.stringify({ es_factura: factura.es_factura, legible: factura.legible, tienda: factura.tienda, fecha: factura.fecha,
  moneda: factura.moneda, total: factura.total, suma_leida: factura.suma, cuadra: factura.cuadra, items: factura.items, por_categoria: factura.por_categoria }));
if (N.editado_de) ctxLineas.push('mensaje_editado: sí (la persona editó un mensaje anterior; movimientos de ese mensaje: ' + JSON.stringify(C.movimientos_editados || []) + ')');
if (datoSensible) ctxLineas.push('aviso: el mensaje traía un [DATO SENSIBLE]');
ctxLineas.push('[/CONTEXTO]');
const conv = historial.map((h) => (h.role === 'persona' ? 'Persona: ' : 'Sami: ') + String(h.content || '').slice(0, 300).replace(/\n+/g, ' ') +
  (h.role === 'sami' && Array.isArray(h.hechos) && h.hechos.length ? ' [hecho: ' + h.hechos.join('; ').slice(0, 300) + ']' : ''));
const entradaPlanificador = ctxLineas.join('\n') + '\n[CONVERSACIÓN RECIENTE]\n' + (conv.join('\n') || '(sin mensajes previos)') + '\n[/CONVERSACIÓN RECIENTE]\n' +
  '<mensaje_usuario tipo="' + tipoEntrada + '">' + (texto || (N.input_type === 'boton' ? '(tocó «' + tituloBoton + '»)' : '(vacío)')) + '</mensaje_usuario>';

const modelo = cfg.modelo_planificador || 'deepseek/deepseek-v4-flash';
const respaldo = cfg.modelo_respaldo || 'google/gemini-3.5-flash-lite';
const llmBody = planDirecto ? null : {
  model: modelo, models: [modelo, respaldo].filter((x, i, a) => x && a.indexOf(x) === i),
  messages: [{ role: 'system', content: PROMPT_PLAN }, { role: 'user', content: entradaPlanificador }],
  temperature: 0.4, max_tokens: 900, response_format: { type: 'json_object' },
  reasoning: cfg.razonamiento === 'off' ? { enabled: false } : { effort: cfg.razonamiento || 'low', exclude: true },
  user: 'ss-' + String(N.platform).slice(0, 2), usage: { include: true },
};

return [{ json: {
  version_prompt: PROMPT_PLAN_VERSION,
  origen: N.origen, platform: N.platform, chat_id: N.chat_id, message_key: N.message_key, modo_envio: N.modo_envio, editado_de: N.editado_de,
  input_type: N.input_type, tipo_entrada: tipoEntrada, option_id: optionId, titulo_boton: tituloBoton,
  hoy, ayer, estado_usuario: estado, nombre: C.nombre || null, nombre_perfil: N.sender ? N.sender.name : null,
  texto_actual: texto, codigo_detectado: codigoDetectado, dato_sensible: datoSensible, transcripcion_ok: transcripcionOk,
  persona_memoria: personaMemoria, corpus, ultimos, pendientes, vinculacion, canales: C.canales || [], prefs,
  factura, tasas: C.tasas || {}, deuda_tarjeta: C.deuda_tarjeta, config: cfg, entrega_codigo: C.codigos_a_entregar || [],
  ruta: planDirecto ? 'directo' : 'planificar', plan_directo: planDirecto,
  entrada_planificador: entradaPlanificador, llm_body: llmBody,
} }];
