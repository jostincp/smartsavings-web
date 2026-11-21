// Resultados del Turno · convierte las filas reales de la BD en hechos, cifras permitidas, botones y envíos laterales.
// Nada de lo que se narra sale de aquí si la transacción no terminó completa.
const PROMPT_REDACCION = __PROMPT_REDACCION__;
const ctx = $('Armar Contexto').first().json;
const V = $('Validar y Compilar').first().json;
const leer = (nombre) => { try { const n = $(nombre); if (n.isExecuted === false) return null; return n.first().json; } catch (e) { return null; } };
const E = leer('Ejecutar Plan');
const cfg = ctx.config || {};

const CAT = { 'Restaurantes y Bares': 'comida por fuera', 'Alimentación': 'mercado', 'Transporte': 'transporte', 'Viajes y Hospedaje': 'viajes',
  'Vivienda': 'vivienda', 'Servicios': 'servicios y suscripciones', 'Salud': 'salud', 'Entretenimiento': 'entretenimiento', 'Educación': 'educación',
  'Tecnología': 'tecnología', 'Cuidado Personal': 'cuidado personal', 'Ropa y Calzado': 'ropa y zapatos', 'Hogar': 'hogar',
  'Deudas y Préstamos': 'deudas y préstamos', 'Otros': 'otros', 'Salario': 'salario', 'Freelance': 'trabajo independiente', 'Ventas': 'ventas',
  'Inversiones': 'inversiones', 'Bonos': 'bonos', 'Pago de Tarjeta': 'pago de tarjeta' };
const ALIAS = { 'Cuidado Personal y Belleza': 'Cuidado Personal', 'Otros Gastos': 'Otros', 'Supermercados': 'Alimentación', 'Ropa': 'Ropa y Calzado', 'Deudas': 'Deudas y Préstamos' };
const RED = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
const permitidos = new Set();
const porcentajes = new Set();
const anota = (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { permitidos.add(Math.round(n * 100) / 100); permitidos.add(Math.round(n)); } };
const COP = (n) => { anota(Math.abs(Number(n))); const v = Math.round(Math.abs(Number(n) || 0)); return (Number(n) < 0 ? '-' : '') + '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
const millones = (n) => { const v = Math.abs(Number(n)); if (v < 1000000) return null; const r = Math.round(v / 100000) / 10; anota(r * 1000000); return '$' + String(r).replace('.', ',') + ' millones'; };
const dinero = (monto, moneda, cop) => { if (!moneda || moneda === 'COP') return COP(monto); anota(monto); return moneda + ' ' + String(monto).replace('.', ',') + (cop != null ? ', unos ' + COP(cop) : ''); };
const pct = (a, b) => { if (!b) return null; const p = Math.round((a / b) * 100); porcentajes.add(p); return p + '%'; };
const cat = (c) => CAT[ALIAS[c] || c] || String(c || 'otros').toLowerCase();
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const pick = (arr) => arr[Math.abs([...String(ctx.message_key)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) % arr.length];
const lista = (xs) => xs.length <= 2 ? xs.join(' y ') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];

// Cifras que la persona dijo o que ya están en el contexto
(V.corpus_valores || []).forEach((v) => { anota(v); if (v < 1000) anota(v * 1000); });
(ctx.ultimos || []).forEach((u) => { anota(u.monto); anota(u.cop); });
anota(ctx.deuda_tarjeta);
(ctx.pendientes || []).forEach((p) => { const pl = p.payload || {}; anota(pl.total_cop); anota(pl.total); anota(pl.suma); (pl.items || []).forEach((i) => { anota(i.amount); anota(i.precio); anota(i.cop); }); });
if (ctx.factura) { anota(ctx.factura.total); anota(ctx.factura.suma); (ctx.factura.items || []).forEach((i) => anota(i.precio)); (ctx.factura.por_categoria || []).forEach((c) => anota(c.total)); }
Object.values(ctx.tasas || {}).forEach((t) => anota(t.tasa));

const hechos = [], memoria = [], plantilla = [], laterales = [];
let botones = [], imagenUrl = null, falla = false, exito = true;
const rechazos = V.rechazos || [];
const avisos = (V.avisos || []).slice();

const resultados = (E && E.r && Array.isArray(E.r.resultados)) ? E.r.resultados : [];
if (V.hay_pasos && (!E || !E.r || E.r.ok !== true || resultados.length !== V.pasos.length || resultados.some((x) => !x || x.r == null))) falla = true;

const lateral = (platform, chat_id, texto, extra) => { if (platform && chat_id) laterales.push({ platform, chat_id: String(chat_id), texto, ...(extra || {}) }); };
const enVentana = (platform) => { const c = (ctx.canales || []).find((x) => x.platform === platform); return platform === 'telegram' || !!(c && c.en_ventana); };
const btn = (id, ok, no, editar) => [{ id: 'pa:' + id + ':ok', title: ok }, { id: 'pa:' + id + ':' + (editar ? 'editar' : 'no'), title: no }];
const textoCodigo = (para, codigo) => 'Hola, alguien quiere conectar un ' + (RED[para] || para) + ' a tu cuenta de SmartSavings. Si eres tú, escribe este código allá: ' + codigo + '. Vence en 10 minutos. Si no fuiste tú, ignora este mensaje: tu cuenta sigue segura.';

function registro(r, origen, pedidos) {
  if (!r || r.ok === false) {
    exito = false;
    const m = r && r.motivo;
    hechos.push({ op: 'anotar', ok: false, motivo: m || 'desconocido' });
    plantilla.push(m === 'limite_diario' ? 'Hoy ya anotaste muchísimos movimientos; sigamos mañana.' : m === 'pendiente_no_confirmado' ? 'Ese botón ya venció; dime otra vez qué quieres hacer.' : 'No alcancé a anotarlo. ¿Me lo repites?');
    return;
  }
  const g = r.guardados || [];
  const items = g.map((x) => {
    const base = (x.descripcion || 'Movimiento') + ' ' + (x.moneda && x.moneda !== 'COP' ? dinero(x.monto, x.moneda, x.cop) + ' (tasa ' + COP(x.tasa) + ' por ' + (x.moneda === 'USD' ? 'dólar' : x.moneda) + ', ' + (x.fuente === 'trm_datos_gov' ? 'TRM oficial' : 'tasa del día') + ')' : COP(x.cop));
    return base + (x.tipo === 'transfer' ? ' (pago de tarjeta, no es gasto)' : ' (' + cat(x.categoria) + ')') + (x.medio === 'credito' ? ' con tarjeta de crédito' : '') + (x.fecha && x.fecha !== ctx.hoy ? ' · fecha ' + x.fecha : '');
  });
  const total = g.reduce((s, x) => s + Number(x.cop || 0), 0);
  if (g.length) hechos.push({ op: origen || 'anotado', ok: true, items, total: g.length > 1 ? COP(total) : undefined, ya_estaba: r.nuevos === 0 ? true : undefined });
  if (g.length) memoria.push('anotó ' + g.map((x) => 'ref ' + x.ref + ' ' + x.descripcion + ' ' + COP(x.cop)).join(', ') + ' (lote ' + r.lote + ')');
  // sin_tasa trae el idx (desde 1) de los ítems que no se guardaron por falta de tasa
  const sinTasa = (r.sin_tasa || []).map((ix) => (pedidos || []).find((p) => Number(p.idx) === Number(ix)) || {});
  sinTasa.forEach((x) => { exito = false; hechos.push({ op: 'anotar', ok: false, motivo: 'tasa_no_disponible', item: x.description, moneda: x.currency }); });
  if (sinTasa.length) {
    const mon = sinTasa.map((x) => x.currency).filter((m, i, a) => m && a.indexOf(m) === i);
    plantilla.push('No tengo la tasa ' + (mon.length ? 'del ' + lista(mon) + ' ' : '') + 'en este momento' + (g.length ? ', así que ' + (sinTasa.length === 1 ? 'eso' : 'esos') + ' no lo anoté' : '') + '. ¿Cuánto te cobraron en pesos?');
  }
  if (!g.length && !(r.sin_tasa || []).length) { exito = false; hechos.push({ op: 'anotar', ok: false, motivo: 'nada_guardado' }); plantilla.push('No alcancé a anotarlo. ¿Me lo repites?'); }
  if ((r.tasa_lejana || []).length) avisos.push({ tipo: 'tasa_lejana' });
  if (g.length === 1) {
    const x = g[0];
    plantilla.push(x.tipo === 'income' ? pick(['Anotado: ingreso de ', 'Listo, quedó el ingreso de ']) + (x.moneda !== 'COP' ? dinero(x.monto, x.moneda, x.cop) : COP(x.cop)) + ' (' + cat(x.categoria) + ').'
      : pick(['Anotado: ', 'Listo: ', 'Hecho: ']) + String(x.descripcion || 'gasto').toLowerCase() + ' por ' + (x.moneda !== 'COP' ? dinero(x.monto, x.moneda, x.cop) : COP(x.cop)) + (x.medio === 'credito' ? ' con la tarjeta de crédito' : '') + '.');
  } else if (g.length > 1) {
    plantilla.push('Anoté ' + g.length + ': ' + g.slice(0, 6).map((x) => '• ' + x.descripcion + ' ' + COP(x.cop)).join(' ') + (g.length > 1 ? ' — total ' + COP(total) : ''));
  }
}

function consulta(r, meta, paso) {
  if (!r || r.ok === false) { exito = false; hechos.push({ op: 'consulta', ok: false, motivo: 'sin_cuenta' }); plantilla.push('Primero necesito crearte la cuenta para poder decirte cómo vas.'); return; }
  const t = r.totales || [];
  const suma = (tramo, tipo) => t.filter((x) => x.tramo === tramo && x.tipo === tipo).reduce((s, x) => s + Number(x.total || 0), 0);
  const cuenta = (tramo, tipo) => t.filter((x) => x.tramo === tramo && x.tipo === tipo).reduce((s, x) => s + Number(x.n || 0), 0);
  const g = suma('act', 'expense'), i = suma('act', 'income'), pt = suma('act', 'transfer');
  const gA = suma('ant', 'expense'), iA = suma('ant', 'income');
  const credito = t.filter((x) => x.tramo === 'act' && x.tipo === 'expense').reduce((s, x) => s + Number(x.con_credito || 0), 0);
  const h = { op: meta.grafico ? 'grafica' : 'consulta', ok: true, periodo: meta.etiqueta };
  if (meta.categoria) h.categoria = cat(meta.categoria);
  h.gastos = COP(g); h.n_gastos = cuenta('act', 'expense');
  if (millones(g)) h.gastos_aprox = millones(g);
  if (i || !meta.categoria) { h.ingresos = COP(i); h.n_ingresos = cuenta('act', 'income'); }
  if (i) { h.balance = COP(Math.abs(i - g)) + (i - g >= 0 ? ' arriba' : ' abajo'); h.balance_nota = 'ingresos menos gastos según lo anotado'; }
  if (pt) h.pagos_tarjeta = COP(pt) + ' (no cuentan como gasto)';
  if (credito) h.gastos_con_tarjeta_credito = COP(credito);
  if (r.deuda_tarjeta != null && Number(r.deuda_tarjeta) > 0) h.deuda_tarjeta_anotada = COP(r.deuda_tarjeta);
  if (gA || iA) {
    const d = g - gA;
    h.comparacion = { periodo_anterior: 'el mismo tramo del periodo anterior', gastos_antes: COP(gA), diferencia_gastos: COP(Math.abs(d)) + (d > 0 ? ' más' : d < 0 ? ' menos' : ' (igual)') };
    if (gA) h.comparacion.variacion = pct(Math.abs(d), gA);
    if (iA) h.comparacion.ingresos_antes = COP(iA);
  }
  const grupos = (r.grupos || []).filter((x) => x.tipo === 'expense' && Number(x.total) > 0);
  if (grupos.length) {
    const agr = {};
    grupos.forEach((x) => { const k = (meta.grafico || paso.args.agrupar === 'categoria') ? cat(x.clave) : (paso.args.agrupar === 'dia' ? String(x.clave) : x.clave || 'sin nombre'); agr[k] = agr[k] || { total: 0, n: 0, ant: 0 }; agr[k].total += Number(x.total || 0); agr[k].n += Number(x.n || 0); agr[k].ant += Number(x.total_ant || 0); });
    h.grupos = Object.entries(agr).sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([k, v]) => ({ nombre: k, total: COP(v.total), movimientos: v.n, porcentaje: pct(v.total, g), antes: v.ant ? COP(v.ant) : undefined }));
    if (meta.grafico) {
      const top = Object.entries(agr).sort((a, b) => b[1].total - a[1].total).slice(0, 7);
      const chart = { type: 'doughnut', data: { labels: top.map(([k]) => cap(k)), datasets: [{ data: top.map(([, v]) => Math.round(v.total)),
        backgroundColor: ['#059669', '#10b981', '#34d399', '#6ee7b7', '#0f766e', '#14b8a6', '#a7f3d0'] }] },
        options: { plugins: { legend: { position: 'right' }, title: { display: true, text: 'Gastos ' + meta.etiqueta } } } };
      imagenUrl = 'https://quickchart.io/chart?w=640&h=400&bkg=white&c=' + encodeURIComponent(JSON.stringify(chart));
    }
  }
  if (meta.grafico && !grupos.length) h.sin_datos = true;
  hechos.push(h);
  memoria.push('consultó ' + meta.etiqueta + ': gastos ' + COP(g) + (i ? ', ingresos ' + COP(i) : ''));
  plantilla.push(cap(meta.etiqueta) + ' llevas ' + COP(g) + ' en gastos' + (h.n_gastos ? ' (' + h.n_gastos + ' movimientos)' : '') + (i ? ' y te han entrado ' + COP(i) : '') + '.' +
    (h.grupos && h.grupos.length ? ' Lo más grande: ' + h.grupos.slice(0, 3).map((x) => x.nombre + ' ' + x.total).join(' · ') + '.' : ''));
}

V.pasos.forEach((paso, k) => {
  if (falla) return;
  const res = resultados[k] || {};
  const r = res.r || {};
  const meta = (V.info || [])[k] || {};
  switch (paso.op) {
    case 'registrar': registro(r, null, paso.args.items); break;
    case 'crear_pendiente_tx': {
      const items = (r.items || []).map((x) => (x.description || 'Movimiento') + ' ' + dinero(x.amount, x.currency));
      hechos.push({ op: 'pide_confirmacion', requiere_confirmacion: true, motivo: r.motivo, items });
      if (r.pendiente_id) { botones = btn(r.pendiente_id, 'Sí, anótalo', 'No'); memoria.push('pidió confirmar ' + r.pendiente_id + ': ' + items.join(', ')); }
      plantilla.push((r.motivo === 'monto_alto' ? 'Es un monto alto, así que te pregunto antes: ' : r.motivo === 'monto_bajo' ? 'Me quedó la duda con el monto: ' : 'Antes de anotarlo: ') + '¿te anoto ' + lista(items) + '?');
      break;
    }
    case 'pago_tarjeta': {
      if (r.estado === 'sin_cuenta') { exito = false; hechos.push({ op: 'pago_tarjeta', ok: false, motivo: 'sin_cuenta' }); plantilla.push('Primero necesito crearte la cuenta.'); break; }
      const reg = r.registro;
      if (r.estado === 'no_guardado' || (reg && reg.ok === false)) {
        exito = false;
        const mot = r.motivo || (reg && reg.motivo) || 'desconocido';
        hechos.push({ op: 'pago_tarjeta', ok: false, motivo: mot });
        plantilla.push(mot === 'limite_diario' ? 'Hoy ya anotaste muchísimos movimientos; sigamos mañana.' : 'No alcancé a anotar el pago. ¿Me lo repites?');
        break;
      }
      // Solo hubo escritura si op_registrar guardó filas (abono y/o intereses)
      const escrito = !!(reg && (reg.guardados || []).length);
      const abono = Number(r.abono) || 0, intereses = Number(r.intereses) || 0;
      const h = { op: 'pago_tarjeta', ok: escrito, pagado: COP(r.pagado), deuda_anotada_antes: COP(Math.max(0, Number(r.deuda_antes) || 0)) };
      if (abono > 0) { h.abono_a_compras_ya_anotadas = COP(abono); h.no_cuenta_como_gasto = true; h.deuda_anotada_ahora = COP(r.deuda_despues); }
      else h.sin_compras_con_tarjeta_anotadas = true;
      if (intereses > 0) h.intereses_como_gasto = COP(intereses);
      const posibles = Number(r.posibles_ya_anotadas) || 0;
      if (r.estado === 'excede') {
        h.compras_no_anotadas = COP(r.exceso); h.requiere_confirmacion = true;
        if (posibles > 0) h.quizas_ya_anotadas_sin_medio = COP(posibles);
        if (r.pendiente_id) botones = btn(r.pendiente_id, 'Sí, anótalas', posibles > 0 ? 'Ya estaban' : 'No');
      }
      hechos.push(h);
      memoria.push('pago de tarjeta ' + COP(r.pagado) + (abono > 0 ? ': abono ' + COP(abono) : ': no se sumó (no había compras con tarjeta anotadas)') + (reg && reg.lote ? ' (lote ' + reg.lote + ')' : '') + (r.pendiente_id ? '; pidió confirmar ' + r.pendiente_id + ' por ' + COP(r.exceso) : ''));
      plantilla.push((abono > 0 ? 'Listo, abonaste ' + COP(abono) + ' a la tarjeta. No lo sumé como gasto porque esas compras ya estaban anotadas.' : 'No tengo compras con tarjeta anotadas aquí, así que ese pago todavía no lo sumé.') +
        (intereses > 0 && escrito ? ' Los ' + COP(intereses) + ' de intereses sí quedaron como gasto.' : '') +
        (r.estado === 'excede' ? (abono > 0 ? ' De ese pago, ' + COP(r.exceso) + ' no lo veo como compras con tarjeta anotadas.' : '') +
          (posibles > 0 ? ' Si esas compras ya me las habías contado sin decir que fueron con tarjeta, no hago nada más; si no, ¿te anoto ' + COP(r.exceso) + ' como gasto?' : ' ¿Te anoto ' + COP(r.exceso) + ' como gasto de compras con tarjeta?') : ' Según lo anotado, te quedan ' + COP(r.deuda_despues) + ' por pagar.'));
      break;
    }
    case 'crear_cuenta':
    case 'solicitar_codigo': {
      const est = r.estado;
      const cod = paso.op === 'crear_cuenta' ? r.codigo : r;
      if (est === 'creada') { hechos.push({ op: 'cuenta', ok: true, estado: 'creada', nombre: r.nombre }); memoria.push('creó la cuenta'); plantilla.push('¡Listo, ' + r.nombre + ', ya tienes tu cuenta!'); break; }
      if (est === 'recuperada') { hechos.push({ op: 'cuenta', ok: true, estado: 'chat_reconectado', nombre: r.nombre }); memoria.push('reconectó el chat a su cuenta'); plantilla.push('¡Hola de nuevo' + (r.nombre ? ', ' + r.nombre : '') + '! Ya reconecté este chat a tu cuenta.'); break; }
      const ce = cod && cod.estado;
      // El borrador del planificador no sabe que el correo ya existía: aquí manda la plantilla o el redactor
      exito = paso.op === 'solicitar_codigo' && ce === 'codigo_enviado';
      const destino = RED[cod && cod.canal_destino] || 'otro canal';
      const map = {
        codigo_enviado: 'Ese correo ya tiene cuenta 🙌 Te mandé un código de 6 dígitos a tu ' + destino + '; escríbemelo aquí. Vence en 10 minutos y no se lo pases a nadie.',
        canal_fuera_de_ventana: 'Ese correo ya tiene cuenta. Para mandarte el código, escríbeme «hola» desde tu ' + destino + ' y te lo envío por allá.',
        espera: 'Ya te mandé un código hace un momento; revisa tu ' + destino + '. Si no te llega en un minuto, me dices y te mando otro.',
        limite_intentos: 'Por seguridad ya no puedo mandar más códigos por ahora. Intenta de nuevo en una hora.',
        sin_canal_destino: 'Ese correo ya tiene cuenta, pero no tengo otro canal activo para mandarte el código.' + (cfg.correo_soporte ? ' Escríbenos a ' + cfg.correo_soporte + ' y te ayudamos.' : ' Le paso tu caso al equipo para ayudarte.'),
        sin_cuenta: 'No encuentro una cuenta con ese correo. ¿Te registraste con otro?',
        ya_vinculado: 'Este chat ya está conectado a tu cuenta.',
      };
      const fijos = { falta_nombre: '¿Cómo te llamas?', correo_invalido: 'Ese correo no me cuadra. ¿Me lo escribes otra vez?', limite_intentos: 'Hiciste varios intentos seguidos; esperemos un rato y lo intentamos de nuevo.',
        chat_en_uso: 'Este chat ya estaba conectado a una cuenta. ¿Con qué correo te habías registrado?', ya_vinculado: 'Este chat ya tiene cuenta.', no_creada: 'No pude crear la cuenta con ese correo. ¿Me lo confirmas?' };
      if (cod && cod.envio && cod.envio.codigo) {
        lateral(cod.envio.platform, cod.envio.chat_id, textoCodigo(ctx.platform, cod.envio.codigo), { tipo: 'codigo', sin_memoria: true });
        delete cod.envio.codigo;
      }
      hechos.push({ op: 'vinculacion', ok: ce === 'codigo_enviado', estado: ce || est, canal_destino: destino, vence_min: 10 });
      memoria.push('vinculación: ' + (ce || est));
      plantilla.push(map[ce] || fijos[est] || 'Revisemos eso con calma. ¿Me repites tu correo?');
      break;
    }
    case 'verificar_codigo': {
      const est = r.estado;
      if (est === 'vinculado') {
        const otro = r.aviso ? RED[r.aviso.platform] : 'tu otro canal';
        hechos.push({ op: 'vinculacion', ok: true, estado: 'vinculado', nombre: r.nombre, canal_principal: RED[r.canal_principal] });
        memoria.push('vinculó este ' + RED[ctx.platform]);
        plantilla.push('¡Conectado' + (r.nombre ? ', ' + r.nombre : '') + '! Ya puedes escribirme por aquí o por ' + otro + '. [[PAUSA]] Los recordatorios y el resumen te siguen llegando por ' + (RED[r.canal_principal] || otro) + '; si los prefieres por acá, me dices.');
        // El código se entregó en ese chat hace menos de 10 minutos, así que su ventana sigue abierta
        if (r.aviso && r.aviso.chat_id) {
          lateral(r.aviso.platform, r.aviso.chat_id, 'Se conectó un ' + RED[ctx.platform] + ' a tu cuenta de SmartSavings. Si no fuiste tú, toca «No fui yo» o respóndeme «no fui yo».',
            { tipo: 'aviso_vinculacion', botones: btn(r.aviso.id, 'No fui yo', 'Sí, fui yo') });
        }
      } else {
        exito = false;
        const m = { incorrecto: 'Ese no me coincide. Revísalo con calma; te quedan ' + r.intentos_restantes + ' intentos.', bloqueado: 'Por seguridad bloqueé ese código. Pide uno nuevo en un rato.',
          expirado: 'Ese código ya venció. ¿Te mando uno nuevo?', no_entregado: 'Todavía no te he podido mandar el código: escríbeme «hola» desde tu otro canal y te lo envío.',
          chat_en_otra_cuenta: 'Este chat ya está conectado a otra cuenta, así que no lo puedo vincular.', sin_solicitud: 'No tengo ningún código pendiente para este chat. ¿Quieres conectarlo a tu cuenta? Pásame tu correo.' };
        hechos.push({ op: 'vinculacion', ok: false, estado: est, intentos_restantes: r.intentos_restantes });
        memoria.push('código: ' + est);
        plantilla.push(m[est] || m.sin_solicitud);
      }
      break;
    }
    case 'consultar': consulta(r, meta, paso); break;
    case 'listar': {
      if (r.ok === false) { exito = false; plantilla.push('Primero necesito crearte la cuenta.'); break; }
      const items = (r.items || []).map((x) => x.fecha.slice(5, 10).split('-').reverse().join('/') + ' ' + (x.descripcion || '') + ' ' + dinero(x.monto, x.moneda, x.cop) + (x.tipo === 'income' ? ' (ingreso)' : x.tipo === 'transfer' ? ' (pago de tarjeta)' : ''));
      hechos.push({ op: 'lista', ok: true, periodo: meta.etiqueta, movimientos: items });
      memoria.push('listó ' + items.length + ' movimientos ' + meta.etiqueta);
      plantilla.push(items.length ? cap(meta.etiqueta) + ':\n' + items.slice(0, 10).map((s) => '• ' + s).join('\n') : 'No encontré movimientos ' + meta.etiqueta + '.');
      break;
    }
    case 'corregir': registrarCorreccion(r, meta); break;
    case 'preparar_borrado': {
      if (r.estado !== 'preparado') {
        exito = false;
        hechos.push({ op: 'borrado', ok: false, estado: r.estado });
        plantilla.push(r.estado === 'no_disponible' ? 'Por ahora no puedo borrar movimientos desde aquí. Si el monto o la categoría están mal, te lo corrijo.' : r.estado === 'demasiados' ? 'Son más de 20 movimientos; dime cuáles con un poco más de detalle.' : 'No encontré ese movimiento. ¿Me dices cuál era?');
        break;
      }
      const items = (r.items || []).map((x) => (x.descripcion || 'Movimiento') + ' ' + dinero(x.monto, x.moneda, x.cop));
      hechos.push({ op: 'borrado_preparado', requiere_confirmacion: true, items, total: COP(r.total_cop) });
      botones = btn(r.pendiente_id, 'Sí, bórralo', 'No');
      memoria.push('preparó borrado ' + r.pendiente_id + ' (' + r.n + ' movimiento(s), ' + COP(r.total_cop) + ')');
      plantilla.push(r.n === 1 ? '¿Borro ' + items[0] + '?' : 'Son ' + r.n + ' movimientos por ' + COP(r.total_cop) + ': ' + items.slice(0, 6).map((s) => '• ' + s).join(' ') + ' ¿Los borro?');
      break;
    }
    case 'confirmar_pendiente': {
      const est = r.estado;
      if (est === 'delete_confirm') {
        const n = r.n || 0;
        hechos.push({ op: 'borrado', ok: n > 0, borrados: (r.borrados || []).map((x) => x.descripcion + ' ' + COP(x.cop)), total: COP(r.total_borrado_cop), resto_del_lote: r.lote_restante_cop ? COP(r.lote_restante_cop) : undefined });
        memoria.push('borró ' + n + ' movimiento(s) por ' + COP(r.total_borrado_cop));
        plantilla.push(n === 1 ? 'Listo, borrado.' : 'Listo, borré ' + n + ' movimientos por ' + COP(r.total_borrado_cop) + '.');
      } else if (est === 'link_notice') {
        hechos.push({ op: 'desvinculado', ok: !!r.desvinculado, canal: RED[r.desvinculado] });
        memoria.push('desvinculó ' + (r.desvinculado || 'nada'));
        plantilla.push(r.desvinculado ? 'Listo, desconecté ese ' + RED[r.desvinculado] + ' de tu cuenta. Tu cuenta sigue segura; ya le avisé al equipo.' : 'Ese canal ya no estaba conectado. Tu cuenta sigue segura.');
      } else if (est === 'tasa_no_disponible') {
        exito = false;
        hechos.push({ op: 'confirmacion', ok: false, estado: est, moneda: r.moneda });
        plantilla.push('No tengo la tasa ' + (r.moneda ? 'del ' + r.moneda + ' ' : '') + 'en este momento, así que todavía no lo guardé. Intenta en un rato o dime cuánto te cobraron en pesos.');
      } else if (est === 'tx_confirm' || est === 'receipt_draft') {
        registro(r.registro, est === 'receipt_draft' ? 'factura_guardada' : 'anotado');
        if (est === 'receipt_draft' && r.registro && r.registro.ok && (r.registro.guardados || []).length) { plantilla.pop(); const g = r.registro.guardados || []; plantilla.push('Hecho: guardé ' + g.length + ' productos por ' + COP(g.reduce((s, x) => s + Number(x.cop || 0), 0)) + ((r.excluidos || []).length ? ', sin los que me dijiste' : '') + '.'); }
      } else if (est === 'tx_update') {
        registrarCorreccion(r.correccion || {}, meta);
      } else {
        exito = false;
        hechos.push({ op: 'confirmacion', ok: false, estado: est });
        plantilla.push(est === 'sin_cuenta' ? 'Primero necesito crearte la cuenta para guardarlo.' : 'Ese botón ya venció; dime otra vez qué quieres hacer.');
      }
      break;
    }
    case 'cancelar_pendiente': {
      const t = { delete_confirm: 'Ok, no borré nada.', tx_confirm: 'Listo, no lo anoté.', tx_update: 'Ok, lo dejé como estaba.', receipt_draft: 'Listo, no guardé la factura.', link_notice: 'Perfecto, la conexión queda activa.' };
      if (r.estado === 'no_encontrado') exito = false;
      hechos.push({ op: 'cancelado', ok: r.estado !== 'no_encontrado', que: r.estado });
      memoria.push('canceló pendiente (' + r.estado + ')');
      plantilla.push(t[r.estado] || 'Ese botón ya venció; dime otra vez qué quieres hacer.');
      break;
    }
    case 'canal_principal': {
      if (r.estado === 'ok' || r.estado === 'ya_era') {
        const pr = RED[r.principal];
        hechos.push({ op: 'canal_principal', ok: true, principal: pr, ya_era: r.estado === 'ya_era' || undefined, plantilla_fuera_de_ventana: r.principal === 'whatsapp' && !r.en_ventana ? true : undefined });
        memoria.push('canal principal: ' + r.principal);
        plantilla.push(r.estado === 'ya_era' ? 'Los recordatorios ya te llegan por ' + pr + '.' : 'Listo: los recordatorios y el resumen te llegan ahora por ' + pr + '.' + (r.principal === 'whatsapp' && !r.en_ventana ? ' Si pasa un día sin que me escribas por allá, te llegarán como mensaje de plantilla.' : ''));
        if (r.anterior && (r.anterior.platform === 'telegram' || enVentana(r.anterior.platform) || String(r.anterior.chat_id).startsWith('qa-'))) lateral(r.anterior.platform, r.anterior.chat_id, 'Desde ahora tus recordatorios y el resumen de SmartSavings te llegan por ' + pr + '.', { tipo: 'aviso_canal' });
      } else {
        exito = false;
        hechos.push({ op: 'canal_principal', ok: false, estado: r.estado, pedido: RED[r.pedido] });
        plantilla.push('Todavía no tienes ' + (RED[r.pedido] || 'ese canal') + ' conectado. Escríbeme desde allá con tu correo y lo conectamos.');
      }
      break;
    }
    case 'preferencias': {
      if (r.ok === false) { exito = false; plantilla.push('Primero necesito crearte la cuenta.'); break; }
      if (meta.nombre) { hechos.push({ op: 'nombre', ok: true, nombre: r.nombre }); memoria.push('ahora le dice ' + r.nombre); plantilla.push('De una, te digo ' + r.nombre + '.'); }
      if (meta.recordatorios) {
        const nom = { mediodia: 'el de las 2:00 p. m.', noche: 'el de las 8:00 p. m.', resumen: 'el resumen de las 9:00 p. m.' };
        const p = r.prefs || {};
        const on = Object.keys(nom).filter((k) => p[k] !== false).map((k) => nom[k]);
        const cambio = Object.entries(meta.recordatorios).map(([k, v]) => (v ? 'prendí ' : 'apagué ') + nom[k]);
        hechos.push({ op: 'recordatorios', ok: true, cambios: cambio, siguen_activos: on });
        memoria.push('recordatorios: ' + cambio.join(', '));
        plantilla.push('Listo, ' + lista(cambio) + '.' + (on.length ? ' Te siguen llegando ' + lista(on) + '.' : ' Ya no te mando recordatorios.'));
      }
      break;
    }
    case 'olvidar_conversacion': hechos.push({ op: 'olvido', ok: true }); plantilla.push('Listo, olvidé nuestra conversación. Tus movimientos siguen guardados.'); break;
    case 'avisar_equipo': {
      hechos.push({ op: 'aviso_equipo', ok: true, tipo: r.tipo });
      memoria.push('avisó al equipo (' + r.tipo + ')');
      if (r.tipo === 'sugerencia') plantilla.push('Buena idea; se la paso al equipo.');
      else if (r.tipo === 'problema') plantilla.push('Le pasé tu caso al equipo; te escriben por aquí.');
      const admin = r.admin_chat_id || cfg.admin_chat_id;
      if (admin) lateral('telegram', admin, '🔔 SmartSavings · ' + r.tipo + ' ' + r.ticket + ' · ' + RED[ctx.platform] + ': ' + String(paso.args.resumen || '').slice(0, 300), { tipo: 'admin', sin_memoria: true });
      break;
    }
    case 'convertir': {
      if (r.tasa == null) { exito = false; hechos.push({ op: 'conversion', ok: false, motivo: 'tasa_no_disponible' }); plantilla.push('No tengo la tasa del ' + r.moneda + ' en este momento. Intenta en un rato.'); break; }
      hechos.push({ op: 'conversion', ok: true, monto: r.moneda + ' ' + String(r.monto).replace('.', ','), resultado: COP(r.resultado_cop), tasa: COP(r.tasa) + ' por ' + (r.moneda === 'USD' ? 'dólar' : r.moneda), fuente: r.fuente === 'trm_datos_gov' ? 'TRM oficial' : 'tasa del día', fecha_tasa: r.fecha_tasa });
      anota(r.monto);
      plantilla.push(r.moneda + ' ' + String(r.monto).replace('.', ',') + ' son unos ' + COP(r.resultado_cop) + ' (' + COP(r.tasa) + ' por ' + (r.moneda === 'USD' ? 'dólar, TRM oficial' : r.moneda) + ').');
      break;
    }
    default: break;
  }
});

function registrarCorreccion(r, meta) {
  const est = r.estado;
  if (est === 'corregido') {
    const a = r.antes || {}, d = r.despues || {};
    const cambios = [];
    if (Number(a.cop) !== Number(d.cop)) cambios.push('de ' + COP(a.cop) + ' a ' + COP(d.cop));
    if (a.categoria !== d.categoria) cambios.push('a ' + cat(d.categoria));
    if (a.descripcion !== d.descripcion) cambios.push('ahora es «' + d.descripcion + '»');
    if (a.fecha !== d.fecha) cambios.push('a la fecha ' + d.fecha);
    if (a.tipo !== d.tipo) cambios.push('ahora es ' + (d.tipo === 'income' ? 'ingreso' : 'gasto'));
    if (d.medio === 'credito') cambios.push('pagado con tarjeta de crédito');
    hechos.push({ op: 'correccion', ok: true, movimiento: a.descripcion, cambios, valor_actual: COP(d.cop), tasa_banco: d.fuente === 'banco' ? COP(d.tasa) + ' por unidad' : undefined });
    memoria.push('corrigió ref ' + d.ref + ' (' + (a.descripcion || '') + '): ' + cambios.join(', '));
    plantilla.push('Corregido: ' + String(a.descripcion || 'el movimiento').toLowerCase() + ' ' + (cambios.join(', ') || 'quedó igual') + '.');
  } else if (est === 'requiere_confirmacion') {
    exito = false; // todavía no cambió nada
    const a = r.antes || {};
    hechos.push({ op: 'correccion', requiere_confirmacion: true, movimiento: a.descripcion, antes: COP(a.cop), cambios: r.cambios });
    if (r.cambios && r.cambios.monto) anota(r.cambios.monto);
    botones = btn(r.pendiente_id, 'Sí, cámbialo', 'No');
    memoria.push('pidió confirmar cambio ' + r.pendiente_id);
    plantilla.push('¿Cambio ' + String(a.descripcion || 'ese movimiento').toLowerCase() + ' de ' + COP(a.cop) + (r.cambios && r.cambios.monto ? ' a ' + COP(r.cambios.monto) : '') + '?');
  } else if (est === 'ambiguo') {
    exito = false;
    const c = (r.candidatos || []).map((x) => x.descripcion + ' de ' + COP(x.cop) + ' (' + x.fecha + ')');
    hechos.push({ op: 'correccion', ok: false, estado: 'ambiguo', candidatos: c });
    plantilla.push('Veo varios: ' + c.slice(0, 4).map((s) => '• ' + s).join(' ') + ' ¿Cuál era?');
  } else {
    exito = false;
    hechos.push({ op: 'correccion', ok: false, estado: est });
    plantilla.push(est === 'tasa_no_disponible' ? 'No tengo la tasa de esa moneda ahora. ¿Cuánto te cobraron en pesos?' : 'No encontré ese movimiento. ¿Me dices cuál era?');
  }
}

// Factura recién leída: botones para guardarla
const nuevoBorrador = (ctx.pendientes || []).find((p) => p.nuevo && p.kind === 'receipt_draft');
if (nuevoBorrador && !botones.length) botones = btn(nuevoBorrador.id, 'Sí, guárdala', 'Cambiar algo', true);
if (nuevoBorrador) memoria.push('leyó factura ' + nuevoBorrador.id + ' (' + (ctx.factura && ctx.factura.tienda) + ', ' + COP(ctx.factura && ctx.factura.total) + ')');
if (nuevoBorrador && ctx.factura && !V.pasos.length) {
  const f = ctx.factura;
  plantilla.push('Leí tu factura' + (f.tienda ? ' de ' + f.tienda : '') + ': ' + f.n_items + ' producto' + (f.n_items === 1 ? '' : 's') + ' por ' + COP(f.total) +
    (f.cuadra === false && f.suma ? ' (sumando lo que leí me da ' + COP(f.suma) + ')' : '') + '.' +
    ((f.por_categoria || []).length ? ' Lo más grande: ' + f.por_categoria.slice(0, 3).map((c) => cat(c.categoria) + ' ' + COP(c.total)).join(' · ') + '.' : '') + ' ¿La guardo así?');
}

// Rechazos del validador → la persona solo oye la pregunta necesaria
const MOTIVO = { monto_no_coincide: '¿Cuánto fue exactamente?', moneda_dudosa: '¿En qué moneda fue?', fecha_futura: '¿De qué fecha es?', fecha_muy_vieja: 'Solo puedo anotar movimientos de los últimos 4 meses. ¿De qué fecha es?',
  ya_anotado: 'Eso ya lo tenía anotado.', correo_dudoso: '¿Será %s?', correo_invalido: 'Ese correo no me cuadra. ¿Me lo escribes otra vez?', falta_nombre: '¿Cómo te llamas?',
  falta_cuenta: 'Primero creemos tu cuenta y ahí mismo te lo anoto.', ref_desconocida: '¿Cuál movimiento era?', falta_confirmacion_explicita: '¿Entonces sí lo hago?',
  tasa_no_disponible: '¿Cuánto te cobraron en pesos?', mismo_mensaje: '¿Lo confirmas?', lote_viejo: '¿Cuál movimiento quieres borrar?' };
const rechazados = rechazos.map((x) => ({ motivo: x.motivo, item: x.motivo === 'correo_dudoso' ? undefined : x.detalle || undefined, sugerencia: x.motivo === 'correo_dudoso' ? x.detalle : undefined }));
if (rechazos.length) {
  const x = rechazos[0];
  const preg = (MOTIVO[x.motivo] || '¿Me lo repites con otras palabras?').replace('%s', x.detalle || '');
  plantilla.push(preg);
}

const plan = V.plan || {};
const SHORT = ['registrar', 'corregir', 'preferencias', 'canal_principal', 'cancelar_pendiente', 'preparar_borrado', 'olvidar_conversacion', 'crear_cuenta', 'avisar_equipo'];
const soloCOP = V.pasos.filter((p) => p.op === 'registrar').every((p) => (p.args.items || []).every((i) => i.currency === 'COP'));
const avisoTasa = avisos.some((a) => a.tipo === 'tasa_lejana');
let usarBorrador = false, necesitaRedaccion = false;
let respuestaPlantilla = plantilla.join(' ').replace(/\s+\[\[PAUSA\]\]\s+/g, ' [[PAUSA]] ').trim();
let pregunta = plan.pregunta || null;
if (falla) {
  respuestaPlantilla = 'Se me enredó algo por acá y no alcancé a guardar nada. ¿Me lo mandas otra vez en un ratico?'; pregunta = null;
} else if (plan.invalido) {
  respuestaPlantilla = 'Se me enredó entenderte. ¿Me lo repites con otras palabras?'; pregunta = null;
} else if (ctx.ruta === 'directo') {
  if (plan.fijo) respuestaPlantilla = plan.respuesta;
  necesitaRedaccion = V.pasos.some((p) => p.op === 'consultar');
} else if (!V.pasos.length && !rechazos.length) {
  const r = String(plan.respuesta || '').trim();
  if (r && !/^GUIA:/i.test(r)) { usarBorrador = true; respuestaPlantilla = respuestaPlantilla || ''; }
  else if (!r && pregunta) { usarBorrador = true; }
  else respuestaPlantilla = respuestaPlantilla || '¿Me lo repites con otras palabras?';
  if (cfg.redactar_charla === true && usarBorrador) { usarBorrador = false; necesitaRedaccion = true; }
  if (nuevoBorrador || ctx.factura) { usarBorrador = false; necesitaRedaccion = true; }
} else if (hechos.some((h) => h.op === 'borrado_preparado')) {
  // Lo que se va a borrar lo dice la BD, nunca el borrador del planificador
  pregunta = null;
} else {
  const r = String(plan.respuesta || '').trim();
  const todosCortos = V.ops.every((op) => SHORT.includes(op));
  const pideConf = botones.length > 0 || hechos.some((h) => h.requiere_confirmacion);
  if (exito && !pideConf && !rechazos.length && !avisoTasa && todosCortos && soloCOP && r && !/^GUIA:/i.test(r)) usarBorrador = true;
  else necesitaRedaccion = true;
}
let plantillaLlm = false;
if (!respuestaPlantilla) { respuestaPlantilla = pregunta || '¿Me lo repites con otras palabras?'; plantillaLlm = !!pregunta; }

const modelo = cfg.modelo_redactor || cfg.modelo_planificador || 'deepseek/deepseek-v4-flash';
const respaldo = cfg.modelo_respaldo || 'google/gemini-3.5-flash-lite';
const guia = String(plan.respuesta || '');
const redactorBody = necesitaRedaccion ? {
  model: modelo, models: [modelo, respaldo].filter((x, i, a) => x && a.indexOf(x) === i),
  messages: [{ role: 'system', content: PROMPT_REDACCION }, { role: 'user', content: JSON.stringify({
    mensaje_usuario: ctx.texto_actual || ctx.titulo_boton || '', [/^GUIA:/i.test(guia) ? 'guia' : 'borrador']: /^GUIA:/i.test(guia) ? guia.replace(/^GUIA:\s*/i, '') : (guia || respuestaPlantilla),
    pregunta, tono: plan.tono || 'normal', hechos: { hechos, rechazados: rechazados.length ? rechazados : undefined, avisos: avisos.length ? avisos : undefined,
      factura_leida: nuevoBorrador ? ctx.factura : undefined } }) }],
  temperature: 0.6, max_tokens: 350,
  reasoning: cfg.razonamiento === 'off' ? { enabled: false } : { effort: 'low', exclude: true }, usage: { include: true },
} : null;

return [{ json: {
  falla, exito, status: falla ? 'failed' : 'done',
  hechos, rechazados, avisos, hechos_memoria: memoria.slice(0, 8),
  numeros_permitidos: Array.from(permitidos), porcentajes: Array.from(porcentajes),
  botones, laterales, imagen_url: imagenUrl,
  borrador: String(plan.respuesta || ''), pregunta, tono: plan.tono || 'normal',
  usar_borrador: usarBorrador, necesita_redaccion: necesitaRedaccion, respuesta_plantilla: respuestaPlantilla, plantilla_llm: plantillaLlm,
  redactor_body: redactorBody,
} }];
