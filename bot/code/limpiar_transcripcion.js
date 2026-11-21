// Limpiar Transcripción · si Whisper falló o solo devolvió ruido, transcripcion_ok = false y no se anota nada.
const j = $input.first().json || {};
let texto = typeof j.text === 'string' ? j.text : (typeof j.transcription === 'string' ? j.transcription : '');
texto = texto.replace(/\s+/g, ' ').trim();
const ruido = !texto || texto.length < 2 || /^(\[.*\]|\(.*\)|gracias( por ver)?\.?|subt[ií]tulos.*|m[uú]sica\.?|\.+)$/i.test(texto);
return [{ json: { texto: ruido ? '' : texto.slice(0, 2000), transcripcion_ok: !j.error && !ruido } }];
