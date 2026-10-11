// Falla Técnica · un error de BD, de descarga o del modelo nunca se trata como «usuario nuevo» ni se narra como éxito.
const j = $input.first().json || {};
const err = j.error || {};
return [{ json: { falla: true, motivo: String(err.message || err.description || 'falla').slice(0, 200) } }];
