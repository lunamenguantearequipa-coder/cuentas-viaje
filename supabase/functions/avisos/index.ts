// Notificaciones del celular (Web Push) de Cuentas Hermanizzz.
// - accion=hora    → recordatorios (pg_cron cada hora, con x-cron)
// - accion=nuevo   → alguien anotó un gasto o pago (trigger de la base, con x-cron)
// - accion=prueba  → aviso de prueba a quien lo pide (con su sesión de la app)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { avisos, ahoraLima, partes, detalleCarga, enSoles, fmt, type Ctx } from './logica.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (d: any, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const r = await sb.from('bot_config').select('clave, valor');
  cfg = Object.fromEntries((r.data || []).map((x: any) => [x.clave, x.valor]));
  webpush.setVapidDetails('https://lunamenguantearequipa-coder.github.io/cuentas-viaje/', cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

// Manda a todos los celulares de esas personas. Borra suscripciones vencidas.
async function push(filtro: { personas?: string[]; user?: string }, payload: { titulo: string; cuerpo: string; url?: string; tag?: string }) {
  await config();
  let q = sb.from('push_subs').select('*');
  if (filtro.personas) q = q.in('persona_id', filtro.personas);
  if (filtro.user) q = q.eq('user_id', filtro.user);
  const subs = (await q).data || [];
  const res: any[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: payload.titulo, body: payload.cuerpo, url: payload.url || '', tag: payload.tag || '' }), { TTL: 12 * 3600, urgency: 'high' });
      res.push({ id: s.id, ok: true });
    } catch (e: any) {
      const code = e?.statusCode;
      const cuerpo = String(e?.body || '');
      if (code === 404 || code === 410 || (code === 400 && /BadWebPushToken|BadDeviceToken/.test(cuerpo))) await sb.from('push_subs').delete().eq('id', s.id);
      console.error('push error', code, String(e?.body || e?.message || e).slice(0, 300));
      res.push({ id: s.id, ok: false, code });
    }
  }
  return res;
}

async function cargar(viajeId: string): Promise<Ctx> {
  const [v, p, m, r] = await Promise.all([
    sb.from('viajes').select('*').eq('id', viajeId).single(),
    sb.from('personas').select('*').eq('viaje_id', viajeId).order('orden'),
    sb.from('movimientos').select('*').eq('viaje_id', viajeId),
    sb.from('reservas').select('*').eq('viaje_id', viajeId)
  ]);
  return { viaje: v.data, personas: p.data || [], movs: m.data || [], reservas: r.data || [], yo: null, hoy: ahoraLima().fecha, ahora: new Date().toISOString() };
}

async function porHora() {
  const vs = await sb.from('viajes').select('id'), ah = ahoraLima(), out: any[] = [];
  for (const v of vs.data || []) {
    const ctx = await cargar(v.id);
    for (const a of avisos(ctx, ah)) {
      const claim = await sb.from('bot_avisos').insert({ clave: 'push:' + a.clave });
      if (claim.error) continue; // ya se mandó
      out.push({ clave: a.clave, envios: await push({ personas: [a.persona_id] }, { titulo: a.titulo, cuerpo: a.cuerpo, url: a.url, tag: a.clave }) });
    }
  }
  return out;
}

async function gastoNuevo(id: string) {
  const m = (await sb.from('movimientos').select('*').eq('id', id).maybeSingle()).data;
  if (!m) return { omitido: 'no existe' };
  const ctx = await cargar(m.viaje_id);
  const autor = ctx.personas.find((p: any) => p.id === m.registrado_por) || ctx.personas.find((p: any) => p.user_id && p.user_id === m.creado_por);
  if (!autor) return { omitido: 'sin autor' }; // cargas hechas a mano no avisan
  if (m.tipo === 'pago') {
    if (m.a_id === autor.id) return { omitido: 'lo anotó quien recibe' };
    return push({ personas: [m.a_id] }, { titulo: '🤝 ' + (m.de_id === autor.id ? autor.nombre + ' te pasó ' : autor.nombre + ' anotó un pago de ') + fmt(m.monto), cuerpo: 'Ya está descontado de las cuentas.', url: '#mov=' + m.id, tag: 'mov:' + m.id });
  }
  const d = detalleCarga(partes(m, ctx.viaje, ctx.personas), ctx.personas, m.categoria), total = enSoles(m, ctx.viaje);
  const res: any[] = [];
  for (const p of ctx.personas.filter((x: any) => x.tipo === 'paga' && x.id !== autor.id)) {
    const v = d[p.id] ? d[p.id].propio + d[p.id].cubre : 0;
    if (v < 0.005) continue;
    res.push(...await push({ personas: [p.id] }, {
      titulo: '🧾 ' + autor.nombre + ' anotó: ' + m.descripcion,
      cuerpo: fmt(total) + ' · pagó ' + (ctx.personas.find((x: any) => x.id === m.pagador_id)?.nombre || '—') + '. Te toca ' + fmt(v) + '.',
      url: '#mov=' + m.id, tag: 'mov:' + m.id
    }));
  }
  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const accion = url.searchParams.get('accion') || body.accion;
    if (accion === 'prueba') {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const u = await sb.auth.getUser(jwt);
      if (u.error || !u.data.user) return json({ error: 'Sin sesión' }, 401);
      const r = await push({ user: u.data.user.id }, { titulo: '🌿 ¡Avisos activados!', cuerpo: 'Así te van a llegar los recordatorios del viaje: check-in, hora de salir y gastos nuevos.', url: '#viaje', tag: 'prueba' });
      return json({ enviados: r.filter((x) => x.ok).length, total: r.length, detalle: r });
    }
    const c = await config();
    if (req.headers.get('x-cron') !== c.cron_token) return json({ error: 'No autorizado' }, 403);
    if (accion === 'hora') return json({ ok: true, avisos: await porHora() });
    if (accion === 'nuevo') return json({ ok: true, envios: await gastoNuevo(body.id) });
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
