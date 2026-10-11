// Validar y Compilar · la aduana entre el plan del modelo y la base de datos.
// El modelo propone; aquí se revisa cada monto contra lo que la persona escribió, la categoría contra la
// lista cerrada, las fechas, los permisos y el consentimiento. Solo sale un plan con operaciones conocidas.
const ctx = $('Armar Contexto').first().json;
const entrada = $input.first().json;

const GASTO = ['Alimentación', 'Restaurantes y Bares', 'Transporte', 'Viajes y Hospedaje', 'Vivienda', 'Servicios', 'Salud',
  'Entretenimiento', 'Educación', 'Tecnología', 'Cuidado Personal', 'Ropa y Calzado', 'Hogar', 'Deudas y Préstamos', 'Otros'];
const INGRESO = ['Salario', 'Freelance', 'Ventas', 'Inversiones', 'Bonos', 'Otros'];
const ALIAS = {
  'cuidado personal y belleza': 'Cuidado Personal', 'belleza': 'Cuidado Personal', 'aseo personal': 'Cuidado Personal',
  'higiene': 'Cuidado Personal', 'aseo': 'Hogar', 'aseo del hogar': 'Hogar', 'limpieza': 'Hogar', 'ocio': 'Entretenimiento',
  'otros gastos': 'Otros', 'otros ingresos': 'Otros', 'mercado': 'Alimentación', 'supermercado': 'Alimentación',
  'supermercados': 'Alimentación', 'comida': 'Restaurantes y Bares', 'comida por fuera': 'Restaurantes y Bares',
  'restaurantes': 'Restaurantes y Bares', 'licores': 'Restaurantes y Bares', 'ropa': 'Ropa y Calzado', 'calzado': 'Ropa y Calzado',
  'ropa y zapatos': 'Ropa y Calzado', 'deudas': 'Deudas y Préstamos', 'prestamos': 'Deudas y Préstamos',
  'medicamentos': 'Salud', 'farmacia': 'Salud', 'viajes': 'Viajes y Hospedaje', 'hospedaje': 'Viajes y Hospedaje',
  'alojamiento': 'Viajes y Hospedaje', 'hotel': 'Viajes y Hospedaje', 'turismo': 'Viajes y Hospedaje',
  'suscripciones': 'Servicios', 'servicios y suscripciones': 'Servicios', 'trabajo independiente': 'Freelance',
  'sueldo': 'Salario', 'nomina': 'Salario', 'venta': 'Ventas', 'inversion': 'Inversiones', 'bono': 'Bonos', 'prima': 'Bonos',
};
const MONEDAS = ['COP', 'USD', 'EUR', 'MXN', 'GBP', 'CAD', 'BRL', 'PEN', 'CLP', 'ARS'];
const MONEDA_RE = {
  USD: /d[oó]lar|\busd\b|us\$|dolarito/i, EUR: /euro|\beur\b|€/i, MXN: /pesos? mexicanos?|\bmxn\b/i, GBP: /libras? esterlinas?|\bgbp\b|£/i,
  CAD: /d[oó]lar(es)? canadienses?|\bcad\b/i, BRL: /\breales\b|\bbrl\b|r\$/i, PEN: /\bsoles\b|\bpen\b/i, CLP: /pesos? chilenos?|\bclp\b/i,
  ARS: /pesos? argentinos?|\bars\b/i,
};
const MEDIOS = { efectivo: 'efectivo', cash: 'efectivo', debito: 'debito', 'tarjeta debito': 'debito', credito: 'credito',
  'tarjeta de credito': 'credito', 'tarjeta credito': 'credito', tc: 'credito', tarjeta: 'credito', transferencia: 'transferencia',
  nequi: 'transferencia', daviplata: 'transferencia', pse: 'transferencia', otro: 'otro' };
const AFIRMA = /^\s*(s[ií]+|sip|dale|de una|h[aá]gale|listo|ok|okey|okay|confirmo|correcto|claro|perfecto|exacto|eso|b[oó]rr[ae]l[oa]s?|gu[aá]rdal[oa]s?|an[oó]tal[oa]s?|c[aá]mbial[oa])(?=$|[\s.,;:!?¡¿)])/i;
const NIEGA_INICIO = /^\s*(no\b|nel\b|mejor no|todav[ií]a no|espera|esper[aá]|cancela)/i;
const NIEGA_FRASE = /\b(no (lo |la |los |las )?(borres|guardes|anotes|cambies|confirmo)|cancela|todav[ií]a no)\b/i;
const NIEGA_EXTRA = /(^\s*\S+[\s,.;:!]+(que\s+)?no\b)|\bmejor no\b|\bno todav[ií]a\b|\bno lo hagas\b|\besp[eé]ra(te)?\b|\bno[\s.!]*$/i;
const MAX_ACCIONES = 5, MAX_ITEMS = 15, MAX_REFS = 20;
const tz = 'America/Bogota';
const hoy = DateTime.fromISO(ctx.hoy, { zone: tz }).startOf('day');

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();
const normMonto = (s) => norm(s).replace(/[’`]/g, "'").replace(/\$\s*/g, '$');
const limpiar = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const capital = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const escLike = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(/[^\d.\-]/g, '')) : Number(v); return Number.isFinite(n) ? n : NaN; };

// ---------- Extractor determinista de montos colombianos ----------
// Devuelve {valor, ini, fin, moneda, x1000ok}. x1000ok = un número suelto que razonablemente omite el «mil» («almuerzo 18»),
// no una cantidad («2 polas»), una hora («a las 8»), un día («el 15») ni un año.
const UNIDADES = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400,
  cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
const CONECTORES = new Set(['de', 'del', 'en', 'por', 'pesos', 'peso', 'el', 'la', 'lo', 'los', 'las', 'un', 'una', 'unos', 'unas', 'a', 'al',
  'y', 'e', 'o', 'u', 'con', 'sin', 'para', 'pa', 'pal', 'que', 'mas', 'menos', 'hasta', 'desde', 'ya', 'hoy', 'ayer', 'anoche', 'ahorita',
  'tambien', 'nomas', 'no', 'si', 'cop', 'entre', 'cada', 'porque', 'pero', 'como', 'total', 'eso', 'esa', 'este', 'esta', 'me', 'se', 'le', 'mi', 'tu']);
const PLURALES_OK = new Set(['pesos', 'lucas', 'luquitas', 'barras', 'luks', 'palos', 'melones', 'millones', 'dolares', 'euros', 'mas', 'menos', 'apenas', 'nomas', 'unos', 'unas', 'los', 'las', 'mis', 'tus', 'sus', 'dos', 'tres', 'seis', 'diez', 'doce', 'trece', 'dieciseis', 'veintiseis', 'pues', 'entonces', 'despues', 'antes', 'jajaja', 'jaja', 'gracias', 'casi', 'pagues', 'fuimos', 'estamos', 'somos', 'vamos']);
const DESPUES_NO_MONTO = /^\s*(de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|a\.? ?m\b|p\.? ?m\b|h\b|hrs?\b|horas?\b|min\b|minutos?\b|segundos?\b|dias?\b|semanas?\b|mes(es)?\b|anos?\b|%|por ?ciento\b|y media\b|y cuarto\b|en punto\b)/;
const ANTES_NO_MONTO = /(\ba las|\ba la|\bde las|\bel|\bdel|\bhace|\bdesde el|\bhasta el|\bpara el|\bdia|\bpiso|\bcalle|\bcarrera|\bnumero)\s*$/;
const ES_MIL = /^(k|mil|lucas?|luquitas?|luks?|barras?)$/;
const ES_MILLON = /^(palos?|melon(es)?|millon(es)?)$/;

function numeroDigitos(raw) {
  // 12.500 → 12500 · 2,5 → 2.5 · 20,000 → 20000 · 1.250.000,50 → 1250000.5 · 1'300.000 → 1300000
  const s = raw.replace(/\s/g, '').replace(/'/g, '.');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+\.\d+$/.test(s)) return Number(s);
  if (/^\d+$/.test(s)) return Number(s);
  return NaN;
}

function palabrasANumero(tokens) {
  // "tres mil quinientos", "veinte", "un millon doscientos mil"; devuelve {valor, usados}
  let total = 0, actual = 0, usados = 0, alguno = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'y' && alguno && UNIDADES[tokens[i + 1]] !== undefined) { usados++; continue; }
    if (UNIDADES[t] !== undefined) { actual += UNIDADES[t]; usados++; alguno = true; continue; }
    if (t === 'mil') { total += (alguno ? (actual || 1) : 1) * 1000; actual = 0; usados++; alguno = true; continue; }
    if (/^millon(es)?$/.test(t) && alguno) { total = (total + (actual || 1)) * 1000000; actual = 0; usados++; continue; }
    break;
  }
  if (!alguno) return null;
  return { valor: total + actual, usados };
}

// Lo que sigue a «N mil» o «N palos»: «y medio», «quinientos», «500», «doscientos mil»
function cola(resto, unidad) {
  const m1 = resto.match(/^\s+y\s+medi[oa]\b/);
  if (m1) return { suma: unidad / 2, largo: m1[0].length };
  const m2 = resto.match(/^\s+(y\s+)?(\d{1,3})\b/);
  if (m2 && !DESPUES_NO_MONTO.test(resto.slice(m2[0].length)) && !/^\s*(k|mil|lucas?|luks?|barras?|palos?|millon)/.test(resto.slice(m2[0].length))) {
    return { suma: unidad === 1000 ? Number(m2[2]) : Number(m2[2]) * 1000, largo: m2[0].length };
  }
  const m3 = resto.match(/^\s+(y\s+)?([a-z]+(?:\s+[a-z]+){0,3})/);
  if (m3) {
    const p = palabrasANumero(m3[2].split(' '));
    if (p && p.valor > 0) {
      const usado = (m3[1] || '') + m3[2].split(' ').slice(0, p.usados).join(' ');
      const largo = resto.indexOf(usado) + usado.length;
      if (unidad === 1000 && p.valor < 1000) return { suma: p.valor, largo };
      if (unidad === 1000000 && p.valor < 1000) return { suma: p.valor * 1000, largo };
      if (unidad === 1000000 && p.valor < 1000000) return { suma: p.valor, largo };
    }
  }
  return { suma: 0, largo: 0 };
}

function extraerMontos(texto) {
  const t = normMonto(texto);
  const res = [];
  const ocupado = [];
  const libre = (i, f) => !ocupado.some(([a, b]) => i < b && f > a);
  const monedaCerca = (ini, fin) => {
    const ventana = t.slice(Math.max(0, ini - 6), Math.min(t.length, fin + 18));
    for (const [m, re] of Object.entries(MONEDA_RE)) if (re.test(ventana)) return m;
    return null;
  };
  // «2 polas», «3 camisas»: un número seguido de un sustantivo en plural es una cantidad, no un precio sin «mil»
  const sigueSustantivo = (fin) => { const w = (t.slice(fin).match(/^\s*([a-z]+)/) || [])[1]; return !!w && w.length >= 3 && /s$/.test(w) && !CONECTORES.has(w) && !PLURALES_OK.has(w); };
  const empuja = (valor, ini, fin, x1000ok, moneda) => {
    if (Number.isFinite(valor) && valor > 0) { res.push({ valor: Math.round(valor * 100) / 100, ini, fin, x1000ok: !!x1000ok, moneda: moneda || monedaCerca(ini, fin) }); ocupado.push([ini, fin]); }
  };
  // 1) expresiones especiales
  const especiales = [
    [/\b(un |1 )?(palo|melon|millon) y medio\b/g, 1500000], [/\b(una|1) luca y media\b/g, 1500], [/\bmedio (palo|melon|millon)\b/g, 500000],
    [/\bmedia luca\b/g, 500], [/\b(una|1) luca\b/g, 1000], [/\b(un|1) (palo|melon|millon)\b/g, 1000000],
  ];
  for (const [re, v] of especiales) {
    let m;
    while ((m = re.exec(t))) {
      if (!libre(m.index, m.index + m[0].length)) continue;
      let fin = m.index + m[0].length, valor = v;
      if (v === 1000000) { const c = cola(t.slice(fin), 1000000); valor += c.suma; fin += c.largo; }
      if (v === 1000) { const c = cola(t.slice(fin), 1000); valor += c.suma; fin += c.largo; }
      empuja(valor, m.index, fin, false);
    }
  }
  // 2) cifras con sufijo opcional
  const reNum = /(\$|us\$|usd ?|€ ?)?(\d{1,3}(?:'\d{3})?(?:[.,]\d{3})+(?:,\d+)?|\d{1,3}'\d{3}|\d+(?:[.,]\d+)?)\s*(k|mil|lucas?|luquitas?|luks?|barras?|palos?|melon(?:es)?|millon(?:es)?)?\b/g;
  let m;
  while ((m = reNum.exec(t))) {
    const ini = m.index;
    let fin = ini + m[0].length;
    if (!libre(ini, fin)) continue;
    const antes = t.charAt(ini - 1), despues = t.charAt(fin);
    if (antes === ':' || despues === ':' || antes === '/' || despues === '/' || (antes === '-' && /\d/.test(t.charAt(ini - 2)))) continue;
    let v = numeroDigitos(m[2]);
    if (!Number.isFinite(v)) continue;
    const suf = m[3] || '';
    const suelto = !m[1] && !suf;
    if (suelto) {
      if (v <= 31 && ANTES_NO_MONTO.test(t.slice(Math.max(0, ini - 14), ini))) continue;
      if (DESPUES_NO_MONTO.test(t.slice(fin))) continue;
      if (/^(19|20)\d{2}$/.test(m[2]) && !/^\s*(pesos?|cop)\b/.test(t.slice(fin))) continue;
    }
    if (ES_MIL.test(suf)) { v *= 1000; const c = cola(t.slice(fin), 1000); v += c.suma; fin += c.largo; }
    else if (ES_MILLON.test(suf)) { v *= 1000000; const c = cola(t.slice(fin), 1000000); v += c.suma; fin += c.largo; }
    let moneda = null;
    if (m[1] && /us|usd/.test(m[1])) moneda = 'USD'; else if (m[1] && /€/.test(m[1])) moneda = 'EUR';
    empuja(v, ini, fin, suelto && v < 1000 && !sigueSustantivo(fin), moneda);
  }
  // 3) números en palabras («cinco lucas», «quince mil quinientos», «dos palos y medio»)
  const re = /[a-z0-9ñ]+/g;
  const toks = [];
  let w;
  while ((w = re.exec(t))) toks.push({ s: w[0], i: w.index, f: w.index + w[0].length });
  for (let i = 0; i < toks.length; i++) {
    if (!libre(toks[i].i, toks[i].f)) continue;
    if (UNIDADES[toks[i].s] === undefined && toks[i].s !== 'mil') continue;
    if (i > 0 && (UNIDADES[toks[i - 1].s] !== undefined || toks[i - 1].s === 'mil') && libre(toks[i - 1].i, toks[i - 1].f)) continue;
    const p = palabrasANumero(toks.slice(i).map((x) => x.s));
    if (!p) continue;
    let v = p.valor;
    let fin = toks[i + p.usados - 1].f;
    const sig = toks[i + p.usados] ? toks[i + p.usados].s : '';
    const usaMil = toks.slice(i, i + p.usados).some((x) => x.s === 'mil' || /^millon/.test(x.s));
    let unidad = 0;
    if (ES_MIL.test(sig) && sig !== 'mil') { v *= 1000; unidad = 1000; fin = toks[i + p.usados].f; }
    else if (/^(palos?|melon(es)?)$/.test(sig)) { v *= 1000000; unidad = 1000000; fin = toks[i + p.usados].f; }
    else if (!usaMil && p.valor < 10 && !/^(pesos?|dolares?|euros?)$/.test(sig)) { i += p.usados - 1; continue; }
    if (unidad) { const c = cola(t.slice(fin), unidad); v += c.suma; fin += c.largo; }
    if (!libre(toks[i].i, fin)) { i += p.usados - 1; continue; }
    empuja(v, toks[i].i, fin, !unidad && !usaMil && v < 1000 && !sigueSustantivo(fin) && !DESPUES_NO_MONTO.test(t.slice(fin)));
    i += p.usados - 1;
  }
  return res;
}

// ---------- Fechas y periodos ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = (d) => d.toISODate();
function leerFecha(f) {
  if (f == null || f === '' || f === 'hoy') return hoy;
  if (f === 'ayer') return hoy.minus({ days: 1 });
  if (f === 'anteayer') return hoy.minus({ days: 2 });
  const d = DateTime.fromISO(String(f).slice(0, 10), { zone: tz });
  return d.isValid ? d.startOf('day') : null;
}
function fechaItem(f) {
  const d = leerFecha(f);
  if (!d) return { ok: false, motivo: 'fecha_invalida' };
  if (d > hoy) return { ok: false, motivo: 'fecha_futura' };
  if (d < hoy.minus({ days: 120 })) return { ok: false, motivo: 'fecha_muy_vieja' };
  return { ok: true, fecha: iso(d) };
}
function fechaBusqueda(f) {
  const d = leerFecha(f);
  if (!d) return { ok: false, motivo: 'fecha_invalida' };
  if (d > hoy) return { ok: false, motivo: 'fecha_futura' };
  if (d < hoy.minus({ days: 730 })) return { ok: false, motivo: 'fecha_muy_vieja' };
  return { ok: true, fecha: iso(d) };
}
function periodo(a) {
  const p = a.periodo || 'este_mes';
  let ini, fin, aIni, aFin, etiqueta;
  const finHoy = hoy.plus({ days: 1 });
  const mismoTramo = (pi, pf, largo) => { const f = pi.plus(largo); return [pi, f < pf ? f : pf]; };
  switch (p) {
    case 'hoy': ini = hoy; fin = finHoy; aIni = hoy.minus({ days: 1 }); aFin = hoy; etiqueta = 'hoy'; break;
    case 'ayer': ini = hoy.minus({ days: 1 }); fin = hoy; aIni = hoy.minus({ days: 2 }); aFin = ini; etiqueta = 'ayer'; break;
    case 'esta_semana': ini = hoy.startOf('week'); fin = finHoy; [aIni, aFin] = mismoTramo(ini.minus({ weeks: 1 }), ini, fin.diff(ini)); etiqueta = 'esta semana'; break;
    case 'semana_pasada': ini = hoy.startOf('week').minus({ weeks: 1 }); fin = hoy.startOf('week'); aIni = ini.minus({ weeks: 1 }); aFin = ini; etiqueta = 'la semana pasada'; break;
    case 'quincena_actual': {
      ini = hoy.day <= 15 ? hoy.startOf('month') : hoy.set({ day: 16 }); fin = finHoy;
      const pIni = hoy.day <= 15 ? hoy.minus({ months: 1 }).set({ day: 16 }) : hoy.startOf('month');
      const pFin = hoy.day <= 15 ? hoy.startOf('month') : hoy.set({ day: 16 });
      [aIni, aFin] = mismoTramo(pIni, pFin, fin.diff(ini)); etiqueta = 'esta quincena'; break;
    }
    case 'quincena_pasada': {
      if (hoy.day <= 15) { ini = hoy.minus({ months: 1 }).set({ day: 16 }); fin = hoy.startOf('month'); aIni = hoy.minus({ months: 1 }).startOf('month'); aFin = ini; }
      else { ini = hoy.startOf('month'); fin = hoy.set({ day: 16 }); aIni = hoy.minus({ months: 1 }).set({ day: 16 }); aFin = ini; }
      etiqueta = 'la quincena pasada'; break;
    }
    case 'mes_pasado': ini = hoy.startOf('month').minus({ months: 1 }); fin = hoy.startOf('month'); aIni = ini.minus({ months: 1 }); aFin = ini; etiqueta = 'en ' + MESES[ini.month - 1]; break;
    case 'ultimos_n_dias': {
      const n = Math.min(Math.max(parseInt(a.n, 10) || 7, 1), 366);
      ini = hoy.minus({ days: n - 1 }); fin = finHoy; aIni = ini.minus({ days: n }); aFin = ini; etiqueta = 'en los últimos ' + n + ' días'; break;
    }
    case 'mes_especifico': {
      const d = DateTime.fromISO(String(a.mes || '').slice(0, 7) + '-01', { zone: tz });
      if (!d.isValid || d > hoy) return null;
      ini = d; fin = d.plus({ months: 1 }); if (fin > finHoy) fin = finHoy; aIni = d.minus({ months: 1 }); aFin = d;
      etiqueta = 'en ' + MESES[d.month - 1] + (d.year !== hoy.year ? ' de ' + d.year : ''); break;
    }
    case 'rango': {
      const d1 = leerFecha(a.desde), d2 = leerFecha(a.hasta || a.desde);
      if (!d1 || !d2) return null;
      ini = d1 < d2 ? d1 : d2; fin = (d1 < d2 ? d2 : d1).plus({ days: 1 }); if (fin > finHoy) fin = finHoy;
      if (ini >= fin) return null;
      let recortado = false;
      if (fin.diff(ini, 'days').days > 366) { ini = fin.minus({ days: 366 }); recortado = true; }
      aFin = ini; aIni = ini.minus(fin.diff(ini));
      const ult = fin.minus({ days: 1 });
      const conAno = ini.year !== ult.year || ult.year !== hoy.year;
      etiqueta = 'del ' + ini.day + (ini.month !== ult.month || conAno ? ' de ' + MESES[ini.month - 1] : '') + (ini.year !== ult.year ? ' de ' + ini.year : '') +
        ' al ' + ult.day + ' de ' + MESES[ult.month - 1] + (conAno ? ' de ' + ult.year : '') + (recortado ? ' (último año)' : '');
      break;
    }
    case 'este_ano': ini = hoy.startOf('year'); fin = finHoy; aIni = ini.minus({ years: 1 }); aFin = fin.minus({ years: 1 }); etiqueta = 'en lo que va del año'; break;
    case 'este_mes': default:
      ini = hoy.startOf('month'); fin = finHoy; [aIni, aFin] = mismoTramo(ini.minus({ months: 1 }), ini, fin.diff(ini));
      etiqueta = 'en lo que va de ' + MESES[hoy.month - 1];
  }
  if (ini.year < 2020) ini = DateTime.fromISO('2020-01-01', { zone: tz });
  return { ini: iso(ini), fin: iso(fin), ant_ini: iso(aIni), ant_fin: iso(aFin), etiqueta, periodo: p };
}

// ---------- Corpus de evidencia ----------
const corpus = (ctx.corpus || []).map((c) => ({ ...c, n: normMonto(c.texto), montos: extraerMontos(c.texto) }));
const corpusValores = [];
corpus.forEach((c) => c.montos.forEach((x) => corpusValores.push(x.valor)));
const ultimos = ctx.ultimos || [];
const pendientes = ctx.pendientes || [];
const actual = corpus.find((c) => c.actual) || { n: '', montos: [] };

function categoria(c, tipo) {
  const lista = tipo === 'income' ? INGRESO : GASTO;
  if (!c) return { cat: 'Otros', ajustada: true };
  const k = norm(c);
  const exacta = lista.find((x) => norm(x) === k);
  if (exacta) return { cat: exacta, ajustada: false };
  const al = ALIAS[k];
  if (al && lista.includes(al)) return { cat: al, ajustada: false };
  return { cat: 'Otros', ajustada: true };
}

function moneda(m) {
  const x = String(m || 'COP').toUpperCase();
  if (!MONEDAS.includes(x)) return { ok: false, motivo: 'moneda_no_soportada' };
  if (x !== 'COP' && !corpus.some((c) => MONEDA_RE[x].test(c.n))) return { ok: false, motivo: 'moneda_dudosa' };
  return { ok: true, moneda: x };
}

const escRe = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Revisa que un monto salga de lo que la persona escribió. escala: monto original en correcciones.
// Con evidencia citada: solo cuentan las cifras que caen dentro de esa evidencia en el mensaje original.
// Sin evidencia ubicable: solo vale una coincidencia exacta con una cifra dicha (sin inferir el «mil»).
function revisarMonto(monto, evidencia, mon, escala) {
  const v = num(monto);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, motivo: 'monto_invalido' };
  if (v > 1000000000) return { ok: false, motivo: 'monto_absurdo' };
  const coincide = (vals, inferir) => {
    for (const x of vals) if (Math.abs(x.valor - v) < 0.01) return { ok: true, aviso: null, moneda: x.moneda };
    if (!inferir) return null;
    for (const x of vals) {
      if (mon === 'COP' && x.x1000ok && x.valor < 1000 && Math.abs(x.valor * 1000 - v) < 0.01) return { ok: true, aviso: 'monto_inferido_x1000', moneda: x.moneda };
      if (escala && escala >= 1000000 && x.valor < 1000 && Math.abs(x.valor * 1000000 - v) < 0.01) return { ok: true, aviso: 'escala_millones', moneda: x.moneda };
    }
    return null;
  };
  const evN = normMonto(evidencia);
  if (evN) {
    const re = new RegExp('(^|[^0-9a-z])' + escRe(evN) + '($|[^0-9a-z])');
    const fuentes = corpus.filter((c) => re.test(c.n)).sort((a, b) => (b.actual ? 1 : 0) - (a.actual ? 1 : 0));
    for (const c of fuentes) {
      const mm = re.exec(c.n);
      const ini = mm.index + mm[1].length, fin = ini + evN.length;
      const dentro = c.montos.filter((x) => x.ini < fin && x.fin > ini);
      const r = coincide(dentro, true);
      if (r) return { ...r, fuente: c };
    }
    const enSpan = (c) => { const mm = re.exec(c.n); const ini = mm.index + mm[1].length; return c.montos.filter((x) => x.ini < ini + evN.length && x.fin > ini); };
    if (fuentes.length && mon === 'COP' && fuentes.some((c) => enSpan(c).some((x) => x.moneda && x.moneda !== 'COP'))) return { ok: false, motivo: 'moneda_dudosa' };
    if (fuentes.length) {
      const algunNumero = fuentes.some((c) => { const mm = re.exec(c.n); const ini = mm.index + mm[1].length; return c.montos.some((x) => x.ini < ini + evN.length && x.fin > ini) || /\d/.test(evN); });
      return { ok: false, motivo: algunNumero ? 'monto_no_coincide' : 'sin_monto' };
    }
  }
  for (const c of corpus) {
    const r = coincide(c.montos, false);
    if (r) return { ...r, aviso: 'evidencia_aproximada', fuente: c };
  }
  return { ok: false, motivo: 'monto_no_coincide' };
}

const contiene = (c, v) => c.montos.some((x) => Math.abs(x.valor - v) < 0.01 || (x.x1000ok && x.valor < 1000 && Math.abs(x.valor * 1000 - v) < 0.01));
// El monto viene de un mensaje anterior que ya quedó anotado (y la persona no lo repitió ahora)
function yaAnotado(v, mon) {
  if (contiene(actual, v)) return false;
  return corpus.some((c) => !c.actual && contiene(c, v) &&
    ultimos.some((u) => u.mk === c.mk && (u.moneda || 'COP') === mon && Math.abs(Number(u.monto) - v) < 0.5));
}
// Mismo monto, misma descripción, hace menos de 30 min: se pregunta antes de anotarlo otra vez
function posibleDuplicado(v, mon, desc) {
  const d = norm(desc);
  return ultimos.some((u) => Number(u.hace_min) <= 30 && (u.moneda || 'COP') === mon && Math.abs(Number(u.monto) - v) < 0.5 && d && norm(u.descripcion) === d);
}

function aproxCOP(v, mon) {
  if (mon === 'COP') return v;
  const t = ctx.tasas && ctx.tasas[mon];
  return t ? v * Number(t.tasa) : null;
}

// ---------- Plan ----------
let plan = null, planInvalido = false;
if (ctx.ruta === 'directo') {
  plan = ctx.plan_directo;
} else {
  let raw = '';
  try { raw = entrada.choices[0].message.content || ''; } catch (e) { raw = entrada.text || ''; }
  try {
    const s = String(raw).replace(/```(json)?/gi, '');
    plan = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch (e) { planInvalido = true; plan = { acciones: [], respuesta: '', pregunta: null, tono: 'normal' }; }
}
if (!plan || typeof plan !== 'object') { planInvalido = true; plan = { acciones: [], respuesta: '', pregunta: null, tono: 'normal' }; }
// Una «GUIA:» en medio del texto convierte toda la respuesta en guía: ese borrador nunca se envía tal cual
if (typeof plan.respuesta === 'string' && /GUIA:/i.test(plan.respuesta) && !/^\s*GUIA:/i.test(plan.respuesta)) plan.respuesta = 'GUIA: ' + plan.respuesta.replace(/GUIA:\s*/gi, '');
const acciones = Array.isArray(plan.acciones) ? plan.acciones : [];

const estado = ctx.estado_usuario;
const PERMISOS_NUEVO = ['crear_cuenta', 'reenviar_codigo', 'avisar_equipo', 'registrar', 'pago_tarjeta', 'verificar_codigo', 'confirmar_pendiente', 'cancelar_pendiente'];
const pasos = [], rechazos = [], avisos = [], monedas = [], info = [];
let creaCuenta = false;
const agrega = (op, args, meta) => { pasos.push({ n: pasos.length + 1, op, args }); info.push(meta || {}); };
const rechaza = (accion, idx, motivo, detalle) => rechazos.push({ accion, idx, motivo, detalle: detalle || null });

acciones.slice(0, MAX_ACCIONES).forEach((ac, ai) => {
  const tipoAc = String(ac && ac.accion || '');
  const a = (ac && typeof ac.args === 'object' && ac.args) || {};
  if (estado !== 'registrado' && !PERMISOS_NUEVO.includes(tipoAc)) return rechaza(tipoAc, ai, 'no_permitida');
  if (estado !== 'registrado' && (tipoAc === 'registrar' || tipoAc === 'pago_tarjeta') && !creaCuenta) return rechaza(tipoAc, ai, 'falta_cuenta');
  if (estado === 'registrado' && ['crear_cuenta', 'reenviar_codigo'].includes(tipoAc)) return rechaza(tipoAc, ai, 'ya_registrado');

  switch (tipoAc) {
    case 'registrar': {
      const todos = Array.isArray(a.items) ? a.items : [];
      if (todos.length > MAX_ITEMS) rechaza('registrar', MAX_ITEMS, 'demasiados_items', String(todos.length - MAX_ITEMS));
      const items = todos.slice(0, MAX_ITEMS);
      const ok = [], conf = [];
      items.forEach((it, ii) => {
        const tipo = /ingreso|income/i.test(it.tipo) ? 'income' : 'expense';
        const desc = limpiar(it.descripcion, 60);
        const mo = moneda(it.moneda);
        if (!mo.ok) return rechaza('registrar', ii, mo.motivo, desc);
        const rm = revisarMonto(it.monto, it.evidencia, mo.moneda);
        if (!rm.ok) return rechaza('registrar', ii, rm.motivo, desc);
        if (mo.moneda === 'COP' && rm.moneda && rm.moneda !== 'COP') return rechaza('registrar', ii, 'moneda_dudosa', desc);
        const monto = num(it.monto);
        if (yaAnotado(monto, mo.moneda)) return rechaza('registrar', ii, 'ya_anotado', desc);
        const fe = fechaItem(it.fecha);
        if (!fe.ok) return rechaza('registrar', ii, fe.motivo, desc);
        const ca = categoria(it.categoria, tipo);
        if (ca.ajustada) avisos.push({ tipo: 'categoria_ajustada', item: desc, a: ca.cat });
        if (rm.aviso) avisos.push({ tipo: rm.aviso, item: desc, monto });
        const medio = it.medio ? MEDIOS[norm(it.medio)] || null : null;
        const row = { idx: ok.length + conf.length + 1, type: tipo, amount: monto, currency: mo.moneda, category: ca.cat,
          description: capital(limpiar(it.descripcion, 100)) || (tipo === 'income' ? 'Ingreso' : 'Gasto'),
          store_name: limpiar(it.comercio, 60) || null, product_name: limpiar(it.producto, 60) || null,
          fecha_local: fe.fecha, payment_method: medio };
        if (mo.moneda !== 'COP') {
          const t = ctx.tasas && ctx.tasas[mo.moneda];
          const lejos = !t || Math.abs(DateTime.fromISO(t.fecha).diff(DateTime.fromISO(fe.fecha), 'days').days) > (mo.moneda === 'USD' ? 0 : 1);
          if (lejos) monedas.push({ base: mo.moneda, fecha: fe.fecha });
        }
        const cop = aproxCOP(monto, mo.moneda);
        const grande = cop != null && ((tipo === 'expense' && cop >= 3000000) || (tipo === 'income' && cop >= 30000000));
        const dup = posibleDuplicado(monto, mo.moneda, row.description);
        const motivo = grande ? 'monto_alto' : (mo.moneda === 'COP' && monto < 100) ? 'monto_bajo' : dup ? 'posible_duplicado' : null;
        if (motivo) conf.push({ ...row, motivo }); else ok.push(row);
      });
      if (ok.length) agrega('registrar', { items: ok }, { items: ok.map((r) => r.description) });
      if (conf.length) agrega('crear_pendiente_tx', { items: conf.map(({ motivo, ...r }) => r), motivo: conf[0].motivo }, { motivo: conf[0].motivo });
      break;
    }
    case 'pago_tarjeta': {
      const rm = revisarMonto(a.monto, a.evidencia, 'COP');
      if (!rm.ok) return rechaza('pago_tarjeta', 0, rm.motivo);
      const args = { monto: num(a.monto) };
      const previo = !contiene(actual, args.monto) && corpus.find((c) => !c.actual && contiene(c, args.monto));
      if (previo && ultimos.some((u) => u.mk === previo.mk && u.tipo === 'transfer')) return rechaza('pago_tarjeta', 0, 'ya_anotado');
      if (a.intereses != null && num(a.intereses) > 0) {
        const ri = revisarMonto(a.intereses, a.evidencia_intereses || a.evidencia, 'COP');
        if (!ri.ok || num(a.intereses) >= args.monto) return rechaza('pago_tarjeta', 0, 'intereses_no_coinciden');
        args.intereses = num(a.intereses);
      }
      const fe = fechaItem(a.fecha); if (!fe.ok) return rechaza('pago_tarjeta', 0, fe.motivo);
      if (fe.fecha) args.fecha_local = fe.fecha;
      const medio = a.medio ? MEDIOS[norm(a.medio)] : null; if (medio && medio !== 'credito') args.medio = medio;
      agrega('pago_tarjeta', args);
      break;
    }
    case 'corregir': {
      const c = (typeof a.cambios === 'object' && a.cambios) || {};
      const args = {}, cambios = {};
      let original = null;
      if (a.ref != null) {
        original = ultimos.find((u) => Number(u.ref) === Number(a.ref));
        if (!original) return rechaza('corregir', 0, 'ref_desconocida');
        args.ref = Number(a.ref);
      } else if (a.mensaje_editado && ctx.editado_de) {
        args.editado_de = ctx.editado_de;
      } else if (a.buscar && typeof a.buscar === 'object') {
        let d = null;
        if (a.buscar.fecha) { const f = fechaBusqueda(a.buscar.fecha); if (!f.ok) return rechaza('corregir', 0, f.motivo); d = f.fecha; }
        args.sel_ini = d || iso(hoy.minus({ days: 7 }));
        args.sel_fin = d ? iso(DateTime.fromISO(d).plus({ days: 1 })) : iso(hoy.plus({ days: 1 }));
        if (a.buscar.texto) args.sel_texto = escLike(limpiar(a.buscar.texto, 40));
        if (a.buscar.categoria) { args.sel_categoria = categoria(a.buscar.categoria, 'expense').cat; args.sel_categorias = [args.sel_categoria].concat(Object.keys(ALIAS).filter((k) => ALIAS[k] === args.sel_categoria)); }
      } else return rechaza('corregir', 0, 'sin_objetivo');
      const tipo = c.tipo ? (/ingreso|income/i.test(c.tipo) ? 'income' : 'expense') : null;
      const monOrig = original ? original.moneda || 'COP' : 'COP';
      if (c.moneda) { const mo = moneda(c.moneda); if (!mo.ok) return rechaza('corregir', 0, mo.motivo); cambios.moneda = mo.moneda; }
      if (c.monto != null) {
        const rm = revisarMonto(c.monto, a.evidencia || c.evidencia, cambios.moneda || monOrig, original ? Number(original.monto) : null);
        if (!rm.ok) return rechaza('corregir', 0, rm.motivo);
        cambios.monto = num(c.monto);
      }
      if (c.monto_cop != null) {
        const rm = revisarMonto(c.monto_cop, a.evidencia || c.evidencia, 'COP');
        if (!rm.ok) return rechaza('corregir', 0, rm.motivo);
        cambios.monto_cop = num(c.monto_cop);
      }
      if (tipo) cambios.tipo = tipo;
      if (c.categoria) cambios.categoria = categoria(c.categoria, tipo || (original && original.tipo === 'income' ? 'income' : 'expense')).cat;
      if (c.descripcion) cambios.descripcion = capital(limpiar(c.descripcion, 100));
      if (c.fecha) { const fe = fechaItem(c.fecha); if (!fe.ok) return rechaza('corregir', 0, fe.motivo); cambios.fecha = fe.fecha; }
      if (c.medio) { const md = MEDIOS[norm(c.medio)]; cambios.medio = md || 'ninguno'; }
      if (!Object.keys(cambios).length) return rechaza('corregir', 0, 'sin_cambios');
      args.cambios = cambios;
      agrega('corregir', args, { descripcion: original ? original.descripcion : null });
      break;
    }
    case 'preparar_borrado': {
      const args = {};
      if (Array.isArray(a.refs) && a.refs.length) {
        const refs = a.refs.slice(0, MAX_REFS).map(Number);
        if (refs.some((r) => !ultimos.some((u) => Number(u.ref) === r))) return rechaza('preparar_borrado', 0, 'ref_desconocida');
        args.refs = refs;
      } else if (a.lote === 'ultimo' || a.lote === 'último') {
        const u = ultimos[0];
        if (!u || Number(u.hace_min) > 1440) return rechaza('preparar_borrado', 0, 'lote_viejo');
        args.lote_de = Number(u.ref);
      } else if (a.lote != null) {
        const l = Number(String(a.lote).replace(/\D/g, ''));
        if (!ultimos.some((u) => Number(u.lote) === l)) return rechaza('preparar_borrado', 0, 'ref_desconocida');
        args.lote_de = l;
      } else if (a.buscar && typeof a.buscar === 'object') {
        let d = null;
        if (a.buscar.fecha) { const f = fechaBusqueda(a.buscar.fecha); if (!f.ok) return rechaza('preparar_borrado', 0, f.motivo); d = f.fecha; }
        if (!d && !a.buscar.texto) return rechaza('preparar_borrado', 0, 'sin_objetivo');
        args.sel_ini = d || iso(hoy.minus({ days: 7 }));
        args.sel_fin = d ? iso(DateTime.fromISO(d).plus({ days: 1 })) : iso(hoy.plus({ days: 1 }));
        if (a.buscar.texto) args.sel_texto = escLike(limpiar(a.buscar.texto, 40));
        if (a.buscar.categoria) { args.sel_categoria = categoria(a.buscar.categoria, 'expense').cat; args.sel_categorias = [args.sel_categoria].concat(Object.keys(ALIAS).filter((k) => ALIAS[k] === args.sel_categoria)); }
      } else return rechaza('preparar_borrado', 0, 'sin_objetivo');
      agrega('preparar_borrado', args);
      break;
    }
    case 'confirmar_pendiente': {
      const p = pendientes.find((x) => x.id === a.pendiente_id);
      if (!p) return rechaza('confirmar_pendiente', 0, 'pendiente_desconocido');
      if (p.creado_en === ctx.message_key) return rechaza('confirmar_pendiente', 0, 'mismo_mensaje');
      const porBoton = ctx.option_id === 'pa:' + p.id + ':ok';
      const texto = ctx.texto_actual || '';
      const consiente = p.kind === 'link_notice'
        ? (porBoton || /no fui yo/i.test(texto))
        : (porBoton || (AFIRMA.test(texto) && !NIEGA_INICIO.test(texto) && !NIEGA_FRASE.test(texto) && !NIEGA_EXTRA.test(texto)));
      if (!consiente) return rechaza('confirmar_pendiente', 0, 'falta_confirmacion_explicita');
      const args = { pa_id: p.id };
      if (p.kind === 'receipt_draft') {
        const n = ((p.payload && p.payload.items) || []).length;
        if (Array.isArray(a.excluir)) args.excluir = a.excluir.map(Number).filter((x) => x >= 1 && x <= n);
        if (Array.isArray(a.cambios)) args.cambios = a.cambios.filter((x) => x && Number(x.item) >= 1 && Number(x.item) <= n)
          .map((x) => ({ item: Number(x.item), categoria: categoria(x.categoria, 'expense').cat }));
        if (a.usar_total_impreso === true) args.usar_total_impreso = true;
        if (a.medio) { const md = MEDIOS[norm(a.medio)]; if (md) args.medio = md; }
      }
      // Confirmar algo en otra moneda también necesita la tasa (si falta, la BD no consume el pendiente)
      const pl = p.payload || {};
      const monPend = p.kind === 'receipt_draft' ? [{ m: pl.moneda, f: pl.fecha_ok }] : p.kind === 'tx_confirm' ? (pl.items || []).map((i) => ({ m: i.currency, f: i.fecha_local })) : [];
      monPend.filter((x) => x.m && x.m !== 'COP').forEach((x) => {
        const f = x.f || ctx.hoy, t = ctx.tasas && ctx.tasas[x.m];
        if (!t || Math.abs(DateTime.fromISO(t.fecha).diff(DateTime.fromISO(f), 'days').days) > (x.m === 'USD' ? 0 : 1)) monedas.push({ base: x.m, fecha: f });
      });
      agrega('confirmar_pendiente', args, { kind: p.kind, payload: p.payload });
      break;
    }
    case 'cancelar_pendiente': {
      const p = pendientes.find((x) => x.id === a.pendiente_id);
      if (!p) return rechaza('cancelar_pendiente', 0, 'pendiente_desconocido');
      agrega('cancelar_pendiente', { pa_id: p.id }, { kind: p.kind });
      break;
    }
    case 'consultar':
    case 'grafico': {
      const pe = periodo(a);
      if (!pe) return rechaza(tipoAc, 0, 'periodo_invalido');
      const tipo = tipoAc === 'grafico' ? 'expense' : /ingreso/i.test(a.tipo) ? 'income' : /gasto/i.test(a.tipo) ? 'expense' : null;
      const args = { ini: pe.ini, fin: pe.fin, ant_ini: pe.ant_ini, ant_fin: pe.ant_fin, comparar: tipoAc === 'grafico' ? false : a.comparar === true };
      if (tipo) args.tipo = tipo;
      if (a.categoria) {
        const c = categoria(a.categoria, tipo || 'expense').cat;
        args.categorias = [c].concat(Object.keys(ALIAS).filter((k) => ALIAS[k] === c));
      }
      const agr = tipoAc === 'grafico' ? 'categoria' : a.agrupar_por;
      if (['categoria', 'comercio', 'descripcion', 'dia'].includes(agr)) args.agrupar = agr;
      agrega('consultar', args, { etiqueta: pe.etiqueta, periodo: pe.periodo, grafico: tipoAc === 'grafico', categoria: a.categoria ? args.categorias[0] : null });
      break;
    }
    case 'listar': {
      const pe = periodo(a.periodo ? a : { periodo: 'ultimos_n_dias', n: 30 });
      if (!pe) return rechaza('listar', 0, 'periodo_invalido');
      const args = { ini: pe.ini, fin: pe.fin, limite: Math.min(Math.max(parseInt(a.limite, 10) || 10, 1), 20) };
      if (/ingreso/i.test(a.tipo)) args.tipo = 'income'; else if (/gasto/i.test(a.tipo)) args.tipo = 'expense';
      if (a.categoria) { const c = categoria(a.categoria, args.tipo || 'expense').cat; args.categorias = [c].concat(Object.keys(ALIAS).filter((k) => ALIAS[k] === c)); }
      if (a.texto) args.texto = escLike(limpiar(a.texto, 40));
      agrega('listar', args, { etiqueta: pe.etiqueta });
      break;
    }
    case 'convertir': {
      const mo = String(a.moneda || '').toUpperCase();
      if (!MONEDAS.includes(mo) || mo === 'COP') return rechaza('convertir', 0, 'moneda_no_soportada');
      const rm = revisarMonto(a.monto, a.evidencia || '', mo);
      if (!rm.ok) return rechaza('convertir', 0, rm.motivo);
      const fe = fechaItem(a.fecha);
      const t = ctx.tasas && ctx.tasas[mo];
      if (!t || t.fecha < iso(hoy.minus({ days: 3 }))) monedas.push({ base: mo, fecha: (fe.ok && fe.fecha) || ctx.hoy });
      agrega('convertir', { monto: num(a.monto), moneda: mo, fecha: (fe.ok && fe.fecha) || ctx.hoy });
      break;
    }
    case 'crear_cuenta': {
      const email = String(a.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) || email.length > 254) return rechaza('crear_cuenta', 0, 'correo_invalido');
      const [usuario, dominio] = email.split('@');
      const TYPO = { 'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com',
        'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'hotmial.com': 'hotmail.com',
        'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
        'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com' };
      let sug = TYPO[dominio] || null;
      if (!sug && /\.con$/.test(dominio)) sug = dominio.replace(/\.con$/, '.com');
      if (!sug && /\.co\.co$/.test(dominio)) sug = dominio.replace(/\.co\.co$/, '.co');
      if (sug) return rechaza('crear_cuenta', 0, 'correo_dudoso', usuario + '@' + sug);
      const nombre = limpiar(a.nombre, 40);
      if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]{1,40}$/.test(nombre)) return rechaza('crear_cuenta', 0, 'falta_nombre');
      creaCuenta = true;
      agrega('crear_cuenta', { email, nombre });
      break;
    }
    case 'reenviar_codigo': agrega('solicitar_codigo', {}); break;
    case 'verificar_codigo': if (ctx.codigo_detectado) agrega('verificar_codigo', { codigo: ctx.codigo_detectado }); break;
    case 'canal_principal': {
      const pl = String(a.plataforma || '').toLowerCase();
      if (!['whatsapp', 'telegram', 'este'].includes(pl)) return rechaza('canal_principal', 0, 'canal_invalido');
      agrega('canal_principal', { plataforma: pl === ctx.platform ? 'este' : pl });
      break;
    }
    case 'recordatorios': {
      const cual = String(a.cual || '').toLowerCase();
      const activo = a.activo === true || a.activo === 'true';
      const prefs = cual === 'todos' ? { mediodia: activo, noche: activo, resumen: activo }
        : ['mediodia', 'noche', 'resumen'].includes(cual) ? { [cual]: activo } : null;
      if (!prefs) return rechaza('recordatorios', 0, 'recordatorio_invalido');
      agrega('preferencias', { prefs }, { recordatorios: prefs });
      break;
    }
    case 'nombre': {
      const nombre = limpiar(a.nombre, 40);
      if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]{1,40}$/.test(nombre)) return rechaza('nombre', 0, 'nombre_invalido');
      agrega('preferencias', { nombre }, { nombre });
      break;
    }
    case 'avisar_equipo': {
      const tipo = ['problema', 'sugerencia', 'seguridad'].includes(a.tipo) ? a.tipo : 'problema';
      agrega('avisar_equipo', { tipo, resumen: limpiar(a.resumen, 300) || 'sin resumen' }, { tipo });
      break;
    }
    case 'olvidar_conversacion': agrega('olvidar_conversacion', {}); break;
    default: rechaza(tipoAc || 'desconocida', ai, 'accion_desconocida');
  }
});
if (acciones.length > MAX_ACCIONES) rechaza('plan', MAX_ACCIONES, 'demasiadas_acciones');

const ops = pasos.map((p) => p.op);
const p1 = b64({ platform: ctx.platform, chat_id: ctx.chat_id, message_key: ctx.message_key, raw: String(ctx.texto_actual || '').slice(0, 500), pasos });
const unicas = [];
monedas.forEach((m) => { if (!unicas.some((u) => u.base === m.base && u.fecha === m.fecha)) unicas.push(m); });

return [{ json: {
  pasos, info, ops, rechazos, avisos, monedas_necesarias: unicas,
  hay_pasos: pasos.length > 0, faltan_tasas: unicas.length > 0,
  plan: { respuesta: String(plan.respuesta || '').slice(0, 700), pregunta: plan.pregunta ? String(plan.pregunta).slice(0, 300) : null,
          tono: ['normal', 'celebrar', 'empatia', 'serio'].includes(plan.tono) ? plan.tono : 'normal', n_acciones: acciones.length,
          invalido: planInvalido, fijo: plan.fijo === true },
  corpus_valores: corpusValores,
  p1,
} }];
