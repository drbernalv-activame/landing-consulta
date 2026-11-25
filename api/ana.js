/* Chat de Ana para la landing /programa.
   Función serverless de Vercel: recibe el historial corto de la conversación
   y devuelve la respuesta del modelo. La llave del API nunca sale del servidor.

   Variables de entorno (Vercel → Settings → Environment Variables):
     ANTHROPIC_API_KEY   obligatoria
     ANA_LANDING_MODEL   opcional; por defecto el mismo modelo que usa Ana en la app
*/
const SYSTEM = require('./_ana-prompt.js');

const MODEL = process.env.ANA_LANDING_MODEL || 'claude-haiku-4-5-20251001';
const MAX_MENSAJES = 12;        // historial que acepta por petición
const MAX_CARACTERES = 600;     // por mensaje del visitante
const MAX_CARACTERES_ANA = 2500; // por respuesta previa de Ana que regresa en el historial
const MAX_TOKENS = 400;         // respuestas de 2 a 4 oraciones
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 20;     // peticiones por IP cada 10 minutos

/* Límite por IP en memoria. Es un freno básico: cada instancia de la función
   lleva su propia cuenta, así que no sustituye un tope de gasto en la consola
   de Anthropic. */
const visitas = new Map();
function excedeLimite(ip) {
  const ahora = Date.now();
  const previas = (visitas.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (previas.length >= MAX_POR_VENTANA) { visitas.set(ip, previas); return true; }
  previas.push(ahora);
  visitas.set(ip, previas);
  if (visitas.size > 5000) visitas.clear();
  return false;
}

function mensajesValidos(body) {
  const lista = body && body.messages;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAX_MENSAJES) return null;
  const limpios = [];
  for (const m of lista) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content !== 'string') return null;
    const texto = m.content.trim();
    if (!texto || texto.length > (m.role === 'user' ? MAX_CARACTERES : MAX_CARACTERES_ANA)) return null;
    limpios.push({ role: m.role, content: texto });
  }
  if (limpios[0].role !== 'user' || limpios[limpios.length - 1].role !== 'user') return null;
  return limpios;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'metodo_no_permitido' });
  }

  /* Solo se atiende a la propia página. */
  const origen = req.headers.origin;
  if (origen) {
    let mismoSitio = false;
    try { mismoSitio = new URL(origen).host === req.headers.host; } catch (e) { mismoSitio = false; }
    if (!mismoSitio) return res.status(403).json({ error: 'origen_no_permitido' });
  }

  const llave = process.env.ANTHROPIC_API_KEY;
  if (!llave) return res.status(503).json({ error: 'sin_configurar' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
  if (excedeLimite(ip)) return res.status(429).json({ error: 'demasiadas_peticiones' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const mensajes = mensajesValidos(body);
  if (!mensajes) return res.status(400).json({ error: 'peticion_invalida' });

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 20000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: control.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': llave,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: mensajes }),
    });
    if (!r.ok) {
      console.error('[ana] respuesta del API', r.status);
      return res.status(502).json({ error: 'sin_respuesta' });
    }
    const datos = await r.json();
    const texto = (datos.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!texto) return res.status(502).json({ error: 'sin_respuesta' });
    return res.status(200).json({ reply: texto });
  } catch (e) {
    console.error('[ana] error', e && e.name);
    return res.status(502).json({ error: 'sin_respuesta' });
  } finally {
    clearTimeout(reloj);
  }
};
