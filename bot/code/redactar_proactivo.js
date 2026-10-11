// Redactar Proactivo · textos fijos en la voz de Sami (sin LLM), solo al canal principal; plantilla de Meta fuera de la ventana de 24 h.
const T = $('Tipo de Envío').first().json;
const CAT = { 'Restaurantes y Bares': 'comida por fuera', 'Alimentación': 'mercado', 'Transporte': 'transporte', 'Viajes y Hospedaje': 'viajes', 'Vivienda': 'vivienda',
  'Servicios': 'servicios', 'Salud': 'salud', 'Entretenimiento': 'entretenimiento', 'Educación': 'educación', 'Tecnología': 'tecnología', 'Cuidado Personal': 'cuidado personal',
  'Ropa y Calzado': 'ropa y zapatos', 'Hogar': 'hogar', 'Deudas y Préstamos': 'deudas', 'Otros': 'otros' };
const miles = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const out = [];
for (const it of $input.all()) {
  const d = it.json.dest || {};
  const cfg = it.json.config || {};
  if (!d.user_id) continue;
  const modo = T.prueba ? 'simulado' : (cfg.modo_envio_programado === 'real' ? 'real' : 'simulado');
  const nombre = d.nombre || '';
  const hola = nombre ? ', ' + nombre : '';
  const giro = Math.abs([...String(d.user_id) + d.fecha_local].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 2;
  let texto = null, via = null, template = null, params = [], omitir = false, motivo = null;
  if (T.tipo === 'mediodia') texto = giro ? '¡Hola' + hola + '! ¿Cómo va el día? Si ya almorzaste, cuéntame qué gastaste en la mañana y te lo anoto.' : (nombre || 'Hola') + ', paso a saludarte 👋 ¿Algún gasto de la mañana para anotar?';
  if (T.tipo === 'noche') {
    texto = giro ? (nombre || 'Hola') + ', ¿cómo te fue hoy? Si hubo gastos en la tarde, cuéntamelos y quedan anotados.' : '¿Qué tal la tarde' + hola + '? Si gastaste algo, me cuentas y lo anoto.';
    if (cfg.omitir_noche_si_anoto !== false && d.anoto_desde_tarde) { omitir = true; motivo = 'ya_anoto_en_la_tarde'; }
  }
  const top = (d.top3 || []).map((x) => (CAT[x.categoria] || String(x.categoria).toLowerCase()) + ' $' + miles(x.total)).join(' · ');
  if (T.tipo === 'resumen') texto = 'Hola' + hola + '. Hoy llevas *$' + miles(d.total_hoy) + '* en ' + d.n_hoy + ' movimiento' + (d.n_hoy === 1 ? '' : 's') + (top ? ': ' + top : '') + '. Si quieres ver cómo va el mes, escríbeme «resumen».';
  if (d.platform === 'telegram') via = 'tg_texto';
  else if (d.en_ventana) via = 'wa_texto';
  else if (T.tipo === 'resumen') {
    if (cfg.plantilla_resumen_aprobada === true) { via = 'wa_resumen'; template = 'resumen_diario_gastos|es'; params = [nombre || 'de nuevo', miles(d.total_hoy), String(d.n_hoy), top || 'sin detalle']; }
    else { omitir = true; motivo = 'plantilla_resumen_no_aprobada'; }
  } else {
    via = 'wa_recordatorio';
    template = T.tipo === 'mediodia' ? 'recordatorio_mediodia_gastos|es' : 'recordatorio_pm_gasto|es';
    params = [nombre || 'de nuevo'];
  }
  const textoMemoria = via === 'wa_resumen' ? 'Hola ' + params[0] + ', este es tu resumen de hoy en SmartSavings: gastaste ' + params[1] + ' COP en ' + params[2] + ' movimientos. Por categoría: ' + params[3] + '.'
    : via === 'wa_recordatorio' ? '(recordatorio de las ' + (T.tipo === 'mediodia' ? '2:00' : '8:00') + ' p. m. por plantilla)' : texto;
  out.push({ json: { ...d, tipo: T.tipo, via, texto, texto_tg: esc(texto || '').replace(/\*([^*\n]{1,80})\*/g, '<b>$1</b>'), template, params, modo, omitir,
    p1: b64({ user_id: d.user_id, tipo: T.tipo, fecha_local: d.fecha_local, platform: d.platform, modo, texto_memoria: textoMemoria, omitir, motivo, via }) } });
}
return out;
