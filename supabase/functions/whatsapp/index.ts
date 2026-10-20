// Agente de WhatsApp de Cuentas Hermanizzz (frases fijas, sin IA).
// - GET  /whatsapp                 → verificación del webhook de Meta
// - POST /whatsapp                 → mensajes entrantes de WhatsApp
// - POST /whatsapp?accion=avisos   → recordatorios (lo llama pg_cron cada hora con x-cron)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { responder, avisos, soloDigitos, ahoraLima, type Ctx } from './logica.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const WA_TOKEN = Deno.env.get('WA_TOKEN') || '';
const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID') || '';
const WA_APP_SECRET = Deno.env.get('WA_APP_SECRET') || '';
const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE') || ''; // plantilla aprobada con un parámetro {{1}} para avisos fuera de las 24 h
const GRAPH = 'https://graph.facebook.com/v21.0/';

async function config(clave: string): Promise<string | undefined> {
  const r = await sb.from('bot_config').select('valor').eq('clave', clave).maybeSingle();
  return r.data?.valor;
}

async function enviar(to: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  if (!WA_TOKEN || !WA_PHONE_ID) return { ok: false, error: 'Falta WA_TOKEN o WA_PHONE_ID' };
  const post = (body: any) => fetch(GRAPH + WA_PHONE_ID + '/messages', {
    method: 'POST', headers: { Authorization: 'Bearer ' + WA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ messaging_product: 'whatsapp', to }, body))
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
  let r = await post({ type: 'text', text: { body: texto.slice(0, 4000), preview_url: false } });
  if (r.status < 300) return { ok: true };
  const code = r.json?.error?.code;
  // 131047: pasaron más de 24 h desde su último mensaje → solo se puede escribir con plantilla
  if (code === 131047 && WA_TEMPLATE) {
    r = await post({ type: 'template', template: { name: WA_TEMPLATE, language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: texto.replace(/\s*\n+\s*/g, ' · ').slice(0, 1000) }] }] } });
    if (r.status < 300) return { ok: true };
  }
  const err = JSON.stringify(r.json?.error || r.json).slice(0, 500);
  console.error('WhatsApp error', r.status, err);
  return { ok: false, error: err };
}

async function cargar(viajeId: string, yo: any): Promise<Ctx> {
  const [v, p, m, r] = await Promise.all([
    sb.from('viajes').select('*').eq('id', viajeId).single(),
    sb.from('personas').select('*').eq('viaje_id', viajeId).order('orden'),
    sb.from('movimientos').select('*').eq('viaje_id', viajeId),
    sb.from('reservas').select('*').eq('viaje_id', viajeId)
  ]);
  const ah = ahoraLima();
  const personas = p.data || [];
  return { viaje: v.data, personas, movs: m.data || [], reservas: r.data || [], yo: yo ? personas.find((x: any) => x.id === yo.id) || yo : null, hoy: ah.fecha, ahora: new Date().toISOString() };
}

async function firmaValida(raw: string, header: string | null) {
  if (!WA_APP_SECRET) return true;
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === header.slice(7);
}

async function atender(msg: any) {
  // evita responder dos veces el mismo mensaje (Meta a veces reintenta)
  const ins = await sb.from('bot_mensajes').insert({ id: msg.id, texto: msg.text?.body ?? '[' + msg.type + ']' });
  if (ins.error) { if (ins.error.code === '23505') return; console.error(ins.error); }

  const tel = soloDigitos(msg.from);
  const pr = await sb.from('personas').select('*').eq('telefono', tel).order('created_at', { ascending: false });
  const persona = (pr.data || [])[0];
  if (!persona) {
    await enviar(tel, 'Hola 👋 Este número lleva las cuentas de un viaje familiar. Si eres parte, pide que agreguen tu WhatsApp en la app (Personas → Editar).');
    return;
  }
  await sb.from('bot_mensajes').update({ persona_id: persona.id }).eq('id', msg.id);
  if (persona.tipo !== 'paga') { await enviar(tel, 'Hola ' + persona.nombre + ' 💛 Tus cuentas las llevan tus hijas. Ellas te pueden contar cómo van.'); return; }

  let texto: string;
  if (msg.type !== 'text') {
    texto = msg.type === 'image' || msg.type === 'document'
      ? '📷 Las fotos de los pases súbelas en la app, pestaña *Viaje*: así quedan guardadas con su reserva. Aquí solo leo texto.'
      : 'Por ahora solo leo mensajes de texto. Escribe *ayuda* para ver lo que sé hacer.';
  } else {
    const ctx = await cargar(persona.viaje_id, persona);
    const r = responder(ctx, msg.text.body || '');
    texto = r.texto;
    if (r.accion) {
      let res: any;
      if (r.accion.tipo === 'insert_mov') res = await sb.from('movimientos').insert(Object.assign({ viaje_id: persona.viaje_id, origen: 'whatsapp', registrado_por: persona.id, creado_por: persona.user_id || null }, r.accion.row));
      else if (r.accion.tipo === 'delete_mov') res = await sb.from('movimientos').delete().eq('id', r.accion.id).eq('viaje_id', persona.viaje_id);
      else if (r.accion.tipo === 'update_res') res = await sb.from('reservas').update(r.accion.cambios).eq('id', r.accion.id).eq('viaje_id', persona.viaje_id);
      if (res?.error) { console.error(res.error); texto = 'Uy, no pude guardarlo 😕 Inténtalo otra vez o anótalo en la app.'; }
      else if (r.despues) texto += r.despues(await cargar(persona.viaje_id, persona));
    }
  }
  await enviar(tel, texto);
  await sb.from('bot_mensajes').update({ respuesta: texto }).eq('id', msg.id);
}

async function correrAvisos() {
  const vs = await sb.from('viajes').select('id');
  const ah = ahoraLima(), enviados: any[] = [];
  for (const v of vs.data || []) {
    const ctx = await cargar(v.id, null);
    for (const a of avisos(ctx, ah)) {
      if (!a.telefono) continue;
      const claim = await sb.from('bot_avisos').insert({ clave: a.clave });
      if (claim.error) continue; // ya se envió antes
      const r = await enviar(a.telefono, a.texto);
      enviados.push({ clave: a.clave, ok: r.ok, error: r.error });
    }
  }
  return enviados;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === await config('verify_token');
      return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('No autorizado', { status: 403 });
    }
    if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });

    if (url.searchParams.get('accion') === 'avisos') {
      if (req.headers.get('x-cron') !== await config('cron_token')) return new Response('No autorizado', { status: 403 });
      return Response.json({ enviados: await correrAvisos() });
    }

    const raw = await req.text();
    if (!(await firmaValida(raw, req.headers.get('x-hub-signature-256')))) return new Response('Firma inválida', { status: 401 });
    const body = JSON.parse(raw || '{}');
    for (const e of body.entry || []) for (const ch of e.changes || []) for (const m of ch.value?.messages || []) await atender(m);
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response('ok', { status: 200 }); // a Meta siempre le respondemos 200 para que no reintente en bucle
  }
});
