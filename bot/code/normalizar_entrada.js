// Normalizar Entrada · un solo contrato para WhatsApp, Telegram y el chat de pruebas. Lo que no hay que atender se descarta aquí.
const execId = String($execution.id);
const manual = $execution.mode === 'manual' || $execution.mode === 'test';
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const it = $input.first();
const j = (it && it.json) || {};
let m = null, binario = null;

const base = (x) => ({ v: 1, origen: null, platform: null, chat_id: null, message_key: null, editado_de: null, received_at: new Date().toISOString(),
  sender: { name: null, phone: null }, input_type: 'texto', text: '', option_id: null, media: null, tg_callback_id: null, wa_message_id: null,
  extra_medios: false, modo_envio: 'real', execution_id: execId, ...x });

if (j.chatInput !== undefined || j.sessionId !== undefined) {
  // Chat de Pruebas del editor: «#tg » simula Telegram; #ok / #no tocan los botones del último pendiente
  let text = String(j.chatInput || '').trim();
  let platform = 'whatsapp';
  if (/^#tg(\s|$)/i.test(text)) { platform = 'telegram'; text = text.replace(/^#tg\s*/i, ''); }
  let option_id = /^#ok$/i.test(text) ? '#ok' : /^#no$/i.test(text) ? '#no' : /^#resumen$/i.test(text) ? 'resumen_mes' : null;
  const claves = Object.keys(it.binary || {});
  let input_type = option_id ? 'boton' : 'texto', media = null;
  if (claves.length && !option_id) {
    const bin = it.binary[claves[0]];
    const mime = bin.mimeType || '';
    input_type = mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'imagen' : mime === 'application/pdf' ? 'pdf' : 'no_soportado';
    media = { ref: claves[0], mime, file_name: bin.fileName || null, caption: text || null };
    binario = { data: bin };
  }
  m = base({ origen: 'prueba', platform, chat_id: 'qa-' + String(j.sessionId || 'sesion').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + (platform === 'telegram' ? '-tg' : ''),
    message_key: 'qa:' + execId, sender: { name: 'Prueba QA', phone: null }, input_type, text: option_id ? '' : text, option_id, media, modo_envio: 'chat' });
} else if (j.update_id !== undefined || j.message || j.edited_message || j.callback_query) {
  const cb = j.callback_query;
  const msg = j.message || j.edited_message || (cb && cb.message);
  const from = cb ? cb.from : msg && msg.from;
  const chat = msg && msg.chat;
  if (from && chat && chat.type === 'private' && !from.is_bot) {
    const chatId = String(from.id);
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null;
    if (cb) {
      m = base({ origen: 'telegram', platform: 'telegram', chat_id: chatId, message_key: 'tg:cb:' + cb.id, sender: { name, phone: null },
        input_type: 'boton', option_id: String(cb.data || '').slice(0, 64), tg_callback_id: String(cb.id) });
    } else {
      const editado = !!j.edited_message;
      let input_type = 'texto', media = null;
      const text = msg.text || msg.caption || '';
      if (msg.voice || msg.audio || msg.video_note) {
        const a = msg.voice || msg.audio || msg.video_note;
        input_type = 'audio'; media = { ref: a.file_id, mime: a.mime_type || 'audio/ogg', file_name: a.file_name || null, caption: msg.caption || null };
      } else if (msg.photo && msg.photo.length) {
        input_type = 'imagen'; media = { ref: msg.photo[msg.photo.length - 1].file_id, mime: 'image/jpeg', file_name: null, caption: msg.caption || null };
      } else if (msg.document) {
        const d = msg.document, mime = d.mime_type || '';
        input_type = mime.startsWith('image/') ? 'imagen' : mime === 'application/pdf' ? 'pdf' : 'no_soportado';
        media = { ref: d.file_id, mime, file_name: d.file_name || null, caption: msg.caption || null };
      } else if (!msg.text) input_type = 'no_soportado';
      m = base({ origen: 'telegram', platform: 'telegram', chat_id: chatId,
        received_at: new Date(1000 * (Number(editado ? msg.edit_date : msg.date) || Date.now() / 1000)).toISOString(),
        message_key: 'tg:' + chatId + ':' + msg.message_id + (editado ? ':e' + (msg.edit_date || Date.now()) : ''),
        editado_de: editado ? 'tg:' + chatId + ':' + msg.message_id : null, sender: { name, phone: null }, input_type,
        text: String(text).slice(0, 4000), media });
    }
  }
} else if (Array.isArray(j.messages) && j.messages.length) {
  // WhatsApp: se unen los mensajes del mismo remitente que llegan en un webhook; los estados y reacciones no se atienden
  const from = j.messages[0].from;
  const lista = j.messages.filter((x) => x.from === from);
  const contacto = (j.contacts || []).find((c) => c.wa_id === from) || {};
  const textos = [];
  let media = null, input_type = null, option_id = null, extra = false;
  for (const x of lista) {
    const t = x.type;
    if (t === 'text') textos.push((x.text && x.text.body) || '');
    else if (t === 'interactive') { const r = x.interactive && (x.interactive.button_reply || x.interactive.list_reply); option_id = (r && r.id) || null; textos.push((r && r.title) || ''); }
    else if (t === 'button') { option_id = (x.button && x.button.payload) || null; textos.push((x.button && x.button.text) || ''); }
    else if (t === 'audio' || t === 'voice') { if (media) extra = true; else { const a = x.audio || x.voice; media = { ref: a.id, mime: a.mime_type || 'audio/ogg', file_name: null, caption: null }; input_type = 'audio'; } }
    else if (t === 'image') { if (media) extra = true; else { media = { ref: x.image.id, mime: x.image.mime_type || 'image/jpeg', file_name: null, caption: x.image.caption || null }; input_type = 'imagen'; if (x.image.caption) textos.push(x.image.caption); } }
    else if (t === 'document') {
      const d = x.document, mime = d.mime_type || '';
      if (media) extra = true; else { media = { ref: d.id, mime, file_name: d.filename || null, caption: d.caption || null }; input_type = mime.startsWith('image/') ? 'imagen' : mime === 'application/pdf' ? 'pdf' : 'no_soportado'; if (d.caption) textos.push(d.caption); }
    } else if (t !== 'reaction' && !input_type) input_type = 'no_soportado';
  }
  if (option_id) input_type = 'boton';
  const texto = textos.filter(Boolean).join('\n').trim();
  if (!input_type && texto) input_type = 'texto';
  if (input_type) {
    m = base({ origen: 'whatsapp', platform: 'whatsapp', chat_id: String(from), message_key: 'wa:' + lista[0].id,
      received_at: new Date(1000 * (Number(lista[0].timestamp) || Date.now() / 1000)).toISOString(),
      sender: { name: (contacto.profile && contacto.profile.name) || null, phone: String(from) }, input_type, text: texto.slice(0, 4000),
      option_id, media, wa_message_id: lista[0].id, extra_medios: extra });
  }
}

if (!m) return [];
if (manual && m.origen !== 'prueba') {
  // datos fijados en el editor: nada sale hacia Meta o Telegram y la clave no choca con mensajes reales
  m.modo_envio = 'simulado';
  m.message_key += ':pin' + execId;
}
m.p1 = b64({ platform: m.platform, chat_id: m.chat_id, message_key: m.message_key, execution_id: execId });
m.p1_ctx = b64({ platform: m.platform, chat_id: m.chat_id, real: m.modo_envio === 'real', editado_de: m.editado_de });
return [binario ? { json: m, binary: binario } : { json: m }];
