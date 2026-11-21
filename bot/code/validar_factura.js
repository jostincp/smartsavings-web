// Validar Factura · lo que lee Gemini se trata como dato: se parsea, se sanea y se comprueba que cuadre antes de mostrarlo.
const N = $('Normalizar Entrada').first().json;
const j = $input.first().json || {};
const CATS = ['Alimentación', 'Restaurantes y Bares', 'Transporte', 'Viajes y Hospedaje', 'Vivienda', 'Servicios', 'Salud', 'Entretenimiento',
  'Educación', 'Tecnología', 'Cuidado Personal', 'Ropa y Calzado', 'Hogar', 'Deudas y Préstamos', 'Otros'];
const ALIAS = { 'cuidado personal y belleza': 'Cuidado Personal', 'belleza': 'Cuidado Personal', 'aseo personal': 'Cuidado Personal', 'higiene': 'Cuidado Personal',
  'aseo': 'Hogar', 'aseo del hogar': 'Hogar', 'limpieza': 'Hogar', 'ocio': 'Entretenimiento', 'otros gastos': 'Otros', 'mercado': 'Alimentación',
  'supermercado': 'Alimentación', 'bebidas': 'Alimentación', 'licores': 'Restaurantes y Bares', 'ropa': 'Ropa y Calzado', 'calzado': 'Ropa y Calzado',
  'medicamentos': 'Salud', 'farmacia': 'Salud', 'viajes': 'Viajes y Hospedaje', 'hospedaje': 'Viajes y Hospedaje', 'hotel': 'Viajes y Hospedaje' };
function porPalabras(p) {
  p = p.toLowerCase();
  if (/hotel|hostal|alojamiento|hospedaje|airbnb|tiquete|pasaje|vuelo|flota|copetran|bolivariano|berlinas|brasilia/.test(p)) return 'Viajes y Hospedaje';
  if (/uber|taxi|gasolina|peaje|sitp|transmilenio/.test(p)) return 'Transporte';
  if (/celular|cable|audifono|audífono|computador|cargador|mouse|teclado|usb/.test(p)) return 'Tecnología';
  if (/cerveza|vino|aguardiente|whisky|licor|ron /.test(p)) return 'Restaurantes y Bares';
  if (/shampoo|sh |champu|jab[oó]n|desodorante|des roll|serum|suero|gel |hidratant|crema|cepillo|dental|afeitar|perfume|protector solar|maquillaje|toalla higi|pañal|panal/.test(p)) return 'Cuidado Personal';
  if (/detergente|limpiador|escoba|trapero|bolsa|servilleta|blanqueador|desinfectante|vela|pila|bombillo|papel higi|lavaloza|suavizante/.test(p)) return 'Hogar';
  if (/acetaminof|ibuprofeno|pastilla|medicamento|vitamina|curita|term[oó]metro/.test(p)) return 'Salud';
  if (/camisa|pantal[oó]n|media |calcet|zapato|tenis|boxer|blusa/.test(p)) return 'Ropa y Calzado';
  return null;
}
const titulo = (s) => s.toLowerCase().split(' ').map((w) => ['de', 'del', 'en', 'la', 'el', 'y', 'con', 'sin', 'por'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const precio = (v) => {
  if (typeof v === 'number') return Math.round(v);
  const s = String(v || '').replace(/[^\d.,]/g, '').replace(/[.,]\d{2}$/, '');
  return parseInt(s.replace(/[.,]/g, ''), 10) || 0;
};
const sano = (s, n) => String(s || '').replace(/https?:\/\/\S+/gi, '').replace(/[<>\[\]{}\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

let raw = '';
try { raw = j.content && j.content.parts ? j.content.parts.map((p) => p.text || '').join('') : (j.text || j.output || JSON.stringify(j.candidates || '')); } catch (e) { raw = ''; }
let d = null;
try { const s = String(raw).replace(/```(json)?/gi, ''); d = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch (e) { d = null; }

let factura;
if (!d || j.error) {
  factura = { es_factura: true, legible: false, motivo: 'no_se_pudo_leer' };
} else if (d.es_factura === false) {
  factura = { es_factura: false, legible: false };
} else {
  const items = (Array.isArray(d.items) ? d.items : []).map((i) => {
    const producto = titulo(sano(i.producto || i.product, 60));
    const c = String(i.categoria || '').trim();
    const cat = CATS.find((x) => x.toLowerCase() === c.toLowerCase()) || ALIAS[c.toLowerCase()] || porPalabras(producto) || 'Otros';
    return { producto, precio: precio(i.precio || i.price), categoria: cat };
  }).filter((i) => i.producto && i.precio > 0).slice(0, 40);
  const total = precio(d.total);
  const suma = items.reduce((s, i) => s + i.precio, 0);
  const moneda = /^[A-Z]{3}$/.test(String(d.moneda || '')) ? d.moneda : 'COP';
  const hoy = DateTime.now().setZone('America/Bogota').startOf('day');
  const f = d.fecha ? DateTime.fromISO(String(d.fecha).slice(0, 10), { zone: 'America/Bogota' }) : null;
  const fechaOk = f && f.isValid && f <= hoy && f >= hoy.minus({ days: 120 }) && f.toISODate() !== hoy.toISODate() ? f.toISODate() : null;
  const cuenta = {};
  items.forEach((i) => { cuenta[i.categoria] = (cuenta[i.categoria] || 0) + i.precio; });
  const principal = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  factura = { es_factura: true, legible: d.legible !== false && items.length > 0 && (total > 0 || suma > 0), tienda: sano(d.tienda, 60) || 'Tienda',
    fecha: f && f.isValid ? f.toISODate() : null, fecha_ok: fechaOk, moneda, total: total || suma, suma,
    cuadra: total > 0 ? Math.abs(suma - total) <= total * 0.02 : true, items, categoria_principal: principal ? principal[0] : 'Otros' };
}
return [{ json: { factura, p1: Buffer.from(JSON.stringify({ platform: N.platform, chat_id: N.chat_id, message_key: N.message_key, factura }), 'utf8').toString('base64') } }];
