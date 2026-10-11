// Normalizar Tasas · TRM oficial (datos.gov.co) para el dólar y open.er-api cruzada para las demás, con banda de cordura.
const leer = (nombre) => { try { const n = $(nombre); if (n.isExecuted === false) return null; return n.all().map((x) => x.json); } catch (e) { return null; } };
const trm = (leer('Pedir TRM') || []).flatMap((x) => Array.isArray(x) ? x : (x && x.valor ? [x] : []));
const er = (leer('Pedir Tasas er-api') || [])[0] || {};
const tz = 'America/Bogota';
const hoy = DateTime.now().setZone(tz).startOf('day');
const tasas = [];
// Cada vigencia de la TRM cubre varios días (fines de semana y festivos): se expande día por día
for (const r of trm) {
  const v = Number(String(r.valor).replace(',', '.'));
  if (!(v >= 2500 && v <= 8000)) continue;
  let d = DateTime.fromISO(String(r.vigenciadesde).slice(0, 10), { zone: tz });
  const h = DateTime.fromISO(String(r.vigenciahasta || r.vigenciadesde).slice(0, 10), { zone: tz });
  for (let k = 0; k < 10 && d.isValid && d <= h; k++, d = d.plus({ days: 1 })) {
    if (d > hoy.plus({ days: 1 })) break;
    tasas.push({ base: 'USD', rate_date: d.toISODate(), rate: v, source: 'trm_datos_gov' });
  }
}
const rates = er && er.result === 'success' && er.rates ? er.rates : null;
if (rates && rates.COP) {
  const fecha = er.time_last_update_unix ? DateTime.fromSeconds(er.time_last_update_unix, { zone: tz }).toISODate() : hoy.toISODate();
  for (const b of ['EUR', 'MXN', 'GBP', 'CAD', 'BRL', 'PEN', 'CLP', 'ARS']) {
    if (!rates[b]) continue;
    const t = Math.round((rates.COP / rates[b]) * 1e6) / 1e6;
    if (t > 0 && t < 20000) tasas.push({ base: b, rate_date: fecha, rate: t, source: 'open_er_api' });
  }
  if (!tasas.some((t) => t.base === 'USD' && t.rate_date === fecha) && rates.COP >= 2500 && rates.COP <= 8000 && !trm.length) {
    tasas.push({ base: 'USD', rate_date: fecha, rate: rates.COP, source: 'open_er_api' });
  }
}
const vistos = new Set();
const unicas = tasas.filter((t) => { const k = t.base + t.rate_date; if (vistos.has(k)) return false; vistos.add(k); return true; });
return [{ json: { n: unicas.length, p1: Buffer.from(JSON.stringify({ tasas: unicas }), 'utf8').toString('base64') } }];
