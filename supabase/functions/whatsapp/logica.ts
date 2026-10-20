// Lógica del agente de WhatsApp (frases fijas). Sin dependencias: se prueba con node y corre en Deno.
// deno-lint-ignore-file no-explicit-any

/* ---------------- cálculo (igual que calculos.js de la app) ---------------- */
function tasa(m: any, v: any) { return Number(m.tc) || Number(v.tc) || 1; }
export function enSoles(m: any, v: any) { return m.moneda === 'USD' ? Number(m.monto) * tasa(m, v) : Number(m.monto); }
export function partes(m: any, viaje: any, personas: any[]) {
  const T = enSoles(m, viaje), p: any = {}, ids = personas.map((x) => x.id), n = ids.length || 1;
  ids.forEach((id) => { p[id] = 0; });
  const f = m.moneda === 'USD' ? tasa(m, viaje) : 1;
  if (m.modo === 'todos') ids.forEach((id) => { p[id] = T / n; });
  else if (m.modo === 'tope') {
    const pagan = personas.filter((x) => x.tipo === 'paga');
    const abs = viaje.absorbe_tope && p.hasOwnProperty(viaje.absorbe_tope) ? viaje.absorbe_tope : (pagan[0] && pagan[0].id);
    const cap = Math.min((Number(m.tope) || Number(viaje.tope)) * (Number(m.noches) || 1), T / n);
    ids.forEach((id) => { p[id] = id === abs ? T - cap * (n - 1) : cap; });
  } else if (m.modo === 'detalle') { const d = m.detalle || {}; ids.forEach((id) => { p[id] = (Number(d[id]) || 0) * f; }); }
  else if (m.modo === 'cubiertas') { let cub = personas.filter((x) => x.tipo === 'cubierta'); if (!cub.length) cub = personas; cub.forEach((x) => { p[x.id] = T / cub.length; }); }
  else if (m.modo === 'entre') { let l = (m.entre || []).filter((id: string) => p.hasOwnProperty(id)); if (!l.length) l = ids; l.forEach((id: string) => { p[id] = T / l.length; }); }
  else if (m.modo === 'invito') { if (p.hasOwnProperty(m.pagador_id)) p[m.pagador_id] = T; }
  return p;
}
function esBase(cat: string) { return cat === 'pasajes' || cat === 'hospedaje'; }
function coberturaDe(x: any, cat: string) {
  if (!esBase(cat) && x.cobertura_otros && Object.keys(x.cobertura_otros).length) return x.cobertura_otros;
  return x.cobertura || {};
}
export function detalleCarga(p: any, personas: any[], cat: string) {
  const pagan = personas.filter((x) => x.tipo === 'paga'), c: any = {};
  pagan.forEach((x) => { c[x.id] = { propio: 0, cubre: 0 }; });
  personas.forEach((x) => {
    const v = p[x.id] || 0; if (!v) return;
    if (x.tipo === 'paga') { if (c[x.id]) c[x.id].propio += v; return; }
    const cob = coberturaDe(x, cat), keys = Object.keys(cob).filter((k) => c.hasOwnProperty(k) && Number(cob[k]) > 0);
    const tot = keys.reduce((s, k) => s + Number(cob[k]), 0);
    if (!keys.length || !tot) { pagan.forEach((y) => { c[y.id].cubre += v / (pagan.length || 1); }); return; }
    keys.forEach((k) => { c[k].cubre += v * Number(cob[k]) / tot; });
  });
  return c;
}
export function saldos(viaje: any, personas: any[], movs: any[]) {
  const o: any = {};
  personas.filter((x) => x.tipo === 'paga').forEach((x) => { o[x.id] = { pago: 0, toca: 0, propio: 0, cubre: 0, env: 0, rec: 0, net: 0 }; });
  movs.forEach((m) => {
    if (m.tipo === 'pago') { if (o[m.de_id]) o[m.de_id].env += Number(m.monto); if (o[m.a_id]) o[m.a_id].rec += Number(m.monto); return; }
    if (o[m.pagador_id]) o[m.pagador_id].pago += enSoles(m, viaje);
    const d = detalleCarga(partes(m, viaje, personas), personas, m.categoria);
    Object.keys(d).forEach((k) => { if (o[k]) { o[k].propio += d[k].propio; o[k].cubre += d[k].cubre; o[k].toca += d[k].propio + d[k].cubre; } });
  });
  Object.keys(o).forEach((k) => { const x = o[k]; x.net = x.pago - x.toca + x.env - x.rec; });
  return o;
}
export function liquidar(o: any) {
  const deb: any[] = [], acr: any[] = [];
  Object.keys(o).forEach((k) => { const n = Math.round(o[k].net * 100) / 100; if (n < -0.009) deb.push({ k, v: -n }); else if (n > 0.009) acr.push({ k, v: n }); });
  deb.sort((a, b) => b.v - a.v); acr.sort((a, b) => b.v - a.v);
  const out: any[] = []; let i = 0, j = 0;
  while (i < deb.length && j < acr.length) {
    const x = Math.min(deb[i].v, acr[j].v);
    out.push({ de: deb[i].k, a: acr[j].k, v: Math.round(x * 100) / 100 });
    deb[i].v -= x; acr[j].v -= x;
    if (deb[i].v < 0.01) i++; if (acr[j].v < 0.01) j++;
  }
  return out;
}

/* ---------------- utilidades de texto ---------------- */
export function norm(s: string) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!;:]+/g, ' ').replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ').replace(/\s+/g, ' ').trim(); }
export function soloDigitos(t: string) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 9 && d.charAt(0) === '9') d = '51' + d; // celular peruano sin código
  return d;
}
function r2(n: number) { const v = Math.round((Number(n) || 0) * 100) / 100; return Object.is(v, -0) ? 0 : v; }
export function fmt(n: number) {
  const v = Math.abs(r2(n)), ent = Math.floor(v), dec = Math.round((v - ent) * 100);
  return (r2(n) < 0 ? '-' : '') + 'S/ ' + String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(dec).padStart(2, '0');
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function fecha(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function sumarDias(s: string, n: number) { const d = fecha(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fdia(s: string) { const d = fecha(s); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; }
function hhmm(t: string | null) { return t ? String(t).slice(0, 5) : ''; }
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function lista(a: string[]) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }
// Hora de Lima (UTC-5, sin horario de verano)
export function ahoraLima(ms = Date.now()) { const d = new Date(ms - 5 * 3600e3); return { fecha: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16) }; }

const ICONO: any = { vuelo: '✈️', hospedaje: '🏡', tour: '🧭', otro: '⭐' };
const CIUDAD: any = { AQP: 'Arequipa', LIM: 'Lima', CHH: 'Chachapoyas', TPP: 'Tarapoto', CUZ: 'Cusco', JUL: 'Juliaca', PIU: 'Piura', TRU: 'Trujillo', IQT: 'Iquitos', PCL: 'Pucallpa', JJI: 'Juanjuí', CJA: 'Cajamarca', TCQ: 'Tacna', AYP: 'Ayacucho', JAE: 'Jaén' };
const CATS: any = { pasajes: 'Pasajes', hospedaje: 'Hospedaje', traslados: 'Traslados', tours: 'Tours', comidas: 'Comidas', otros: 'Otros' };
const PALABRAS_CAT: [RegExp, string][] = [
  [/^(cena|almuerzo|desayuno|comida|lonche|cafe|helado|helados|pollo|menu|restaurante|snack|snacks|chela|chelas|bebidas|agua|juane|juanes|ceviche|pizza|super|mercado|cumple)/, 'comidas'],
  [/^(taxi|uber|bus|traslado|traslados|moto|mototaxi|colectivo|combi|carro|transporte|gasolina|peaje|lancha|bote)/, 'traslados'],
  [/^(tour|tours|entrada|entradas|catarata|gocta|kuelap|guia|excursion|paseo|boleto|boletos|telecabina|laguna)/, 'tours'],
  [/^(hotel|hospedaje|airbnb|hostal|noche|noches|cuarto|habitacion|casa|depa|alojamiento)/, 'hospedaje'],
  [/^(pasaje|pasajes|vuelo|vuelos|avion|maleta|maletas|equipaje)/, 'pasajes']
];

/* ---------------- contexto ---------------- */
export type Ctx = { viaje: any; personas: any[]; movs: any[]; reservas: any[]; yo: any; hoy: string; ahora?: string };
export type Accion =
  | { tipo: 'insert_mov'; row: any }
  | { tipo: 'delete_mov'; id: string }
  | { tipo: 'update_res'; id: string; cambios: any };
export type Respuesta = { texto: string; accion?: Accion; despues?: (ctx: Ctx) => string };

function pagan(c: Ctx) { return c.personas.filter((p) => p.tipo === 'paga'); }
function cubiertas(c: Ctx) { return c.personas.filter((p) => p.tipo === 'cubierta'); }
function nom(c: Ctx, id: string) { const p = c.personas.find((x) => x.id === id); return p ? p.nombre : '—'; }
function nombresCub(c: Ctx) { const x = cubiertas(c); return x.length ? lista(x.map((p) => p.nombre.toLowerCase())) : 'las personas cubiertas'; }
function quienes(c: Ctx, ids: string[]) {
  ids = (ids || []).filter((id) => c.personas.some((p) => p.id === id));
  if (ids.length === c.personas.length && ids.length > 2) return 'los ' + ids.length;
  return lista(ids.map((id) => nom(c, id)));
}
// Busca una persona por nombre o apodo (prefijo de 3+ letras): adri, cami, andre, mama, papa, yo.
export function buscarPersona(c: Ctx, palabra: string) {
  const w = norm(palabra);
  if (!w) return null;
  if (w === 'yo' || w === 'mi') return c.yo;
  const ps = c.personas.map((p) => ({ p, n: norm(p.nombre) }));
  return (ps.find((x) => x.n === w) || (w.length >= 3 ? ps.find((x) => x.n.startsWith(w) || w.startsWith(x.n)) : null) || { p: null }).p;
}
function codigos(r: any) { return (r.codigos || []).map((x: any) => x && x.codigo).filter(Boolean); }
function ruta(r: any) { if (!r.origen && !r.destino) return ''; const f = (x: string) => CIUDAD[(x || '').toUpperCase()] || x; return f(r.origen) + ' → ' + f(r.destino); }
function lineaReserva(r: any, conFecha = true) {
  const cs = codigos(r);
  return (ICONO[r.tipo] || '⭐') + ' ' + (conFecha ? fdia(r.fecha) + ' ' : '') + (r.hora ? hhmm(r.hora) + ' ' : '') + '*' + r.titulo + '*' +
    (ruta(r) ? ' · ' + ruta(r) : '') + (r.lugar ? ' · ' + r.lugar : '') +
    (cs.length ? '\n   Código: *' + cs.join('* · *') + '*' : '') +
    (r.checkin_requerido ? (r.checkin_hecho ? '\n   Check-in ✅' : '\n   Check-in pendiente ⏳') : '');
}

/* ---------------- respuestas ---------------- */
export const AYUDA = [
  '🌿 *Cuentas Hermanizzz* — escríbeme así:',
  '',
  '💰 *deuda* — cuánto debes o te deben',
  '👯 *saldos* — cómo están las tres',
  '🧾 *gasto 180 cena pagó camila todos* — anoto un gasto',
  '   también: *entre adri camila* · *invito* · *solo papas* · *tope 2 noches* · *usd* · *ayer*',
  '🤝 *pasé 200 a andrea* — anoto que le pasaste plata',
  '↩️ *borrar* — borra lo último que anotaste aquí',
  '🎫 *código atsa* — código de una reserva (o *códigos*)',
  '📅 *agenda* · *hoy* · *mañana* — lo que viene',
  '✈️ *checkin* — check-ins pendientes · *checkin hecho atsa*',
  '💡 *sugerencia* — quién conviene que pague lo próximo'
].join('\n');

export function textoSaldo(c: Ctx, p: any) {
  const o = saldos(c.viaje, c.personas, c.movs), x = o[p.id];
  if (!x) return p.nombre + ' no lleva cuentas propias (la cubren las hermanas).';
  const n = r2(x.net), yo = c.yo && c.yo.id === p.id;
  const quien = yo ? (n > 0.009 ? 'te deben' : n < -0.009 ? 'debes' : 'estás a mano') : (n > 0.009 ? 'le deben' : n < -0.009 ? 'debe' : 'está a mano');
  const t = [p.nombre + ', ' + quien + (Math.abs(n) > 0.009 ? ' *' + fmt(Math.abs(n)) + '*' : '') + (n > 0.009 ? ' 💚' : n < -0.009 ? '' : ' 🎉'), '', '_De dónde sale:_',
    '• ' + (yo ? 'Pagaste ' : 'Pagó ') + fmt(x.pago),
    '• ' + (yo ? 'Te toca ' : 'Le toca ') + fmt(x.toca) + (x.cubre > 0.004 ? ' (' + (yo ? 'lo tuyo ' : 'lo suyo ') + fmt(x.propio) + ' + ' + nombresCub(c) + ' ' + fmt(x.cubre) + ')' : '')];
  if (x.env > 0.004) t.push('• ' + (yo ? 'Ya pasaste ' : 'Ya pasó ') + fmt(x.env));
  if (x.rec > 0.004) t.push('• ' + (yo ? 'Ya te pasaron ' : 'Ya le pasaron ') + fmt(x.rec));
  const l = liquidar(o).filter((z) => z.de === p.id || z.a === p.id);
  if (l.length) {
    t.push('', '_Para quedar a mano:_');
    l.forEach((z) => t.push('• ' + (z.a === p.id ? nom(c, z.de) + (yo ? ' te pasa ' : ' le pasa ') : (yo ? 'Le pasas a ' : 'Le pasa a ') + nom(c, z.a) + ' ') + fmt(z.v)));
  }
  return t.join('\n');
}
function textoSaldos(c: Ctx) {
  const o = saldos(c.viaje, c.personas, c.movs);
  const t = ['👯 *Cómo están las cuentas*', ''];
  pagan(c).forEach((p) => { const n = r2((o[p.id] || {}).net); t.push((n > 0.009 ? '🟢 ' : n < -0.009 ? '🔴 ' : '⚪ ') + p.nombre + ': ' + (n > 0.009 ? 'le deben ' : n < -0.009 ? 'debe ' : 'a mano') + (Math.abs(n) > 0.009 ? fmt(Math.abs(n)) : '')); });
  const l = liquidar(o);
  if (l.length) { t.push('', '_Para quedar a mano:_'); l.forEach((z) => t.push('• ' + nom(c, z.de) + ' → ' + nom(c, z.a) + ': ' + fmt(z.v))); }
  return t.join('\n');
}
export function sugerencia(c: Ctx) {
  const o = saldos(c.viaje, c.personas, c.movs);
  const d = pagan(c).map((p) => ({ p, v: -r2((o[p.id] || {}).net) })).filter((x) => x.v >= 50).sort((a, b) => b.v - a.v)[0];
  return d || null;
}
function textoSugerencia(c: Ctx) {
  const d = sugerencia(c);
  if (!d) return '💡 Están casi a mano: cualquiera puede pagar lo próximo. 🎉';
  if (c.yo && d.p.id === c.yo.id) return '💡 Te conviene pagar tú lo próximo (una cena, un taxi): así no se te acumula. Debes ' + fmt(d.v) + '.';
  return '💡 Conviene que *' + d.p.nombre + '* pague lo próximo (una cena, un taxi), así no se le acumula. Debe ' + fmt(d.v) + '.';
}
function futuras(c: Ctx) { return c.reservas.filter((r) => r.fecha >= c.hoy || (r.fecha_fin && r.fecha_fin >= c.hoy)).sort((a, b) => (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99'))); }
function textoAgenda(c: Ctx, desde: string, hasta: string, titulo: string) {
  const rs = c.reservas.filter((r) => r.fecha >= desde && r.fecha <= hasta).sort((a, b) => (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99')));
  if (!rs.length) {
    const prox = futuras(c).find((r) => r.fecha > hasta);
    return '📅 ' + titulo + ': no hay nada agendado.' + (prox ? '\n\nLo próximo:\n' + lineaReserva(prox) : '');
  }
  const t = ['📅 *' + titulo + '*']; let dia = '';
  rs.forEach((r) => { if (r.fecha !== dia) { dia = r.fecha; t.push('', '*' + cap(fdia(r.fecha)) + '*'); } t.push(lineaReserva(r, false)); });
  return t.join('\n');
}
function buscarReservas(c: Ctx, q: string) {
  const w = norm(q).split(' ').filter((x) => x.length >= 2);
  return c.reservas.filter((r) => {
    const txt = norm([r.titulo, r.proveedor, r.lugar, r.origen, r.destino, CIUDAD[(r.origen || '').toUpperCase()], CIUDAD[(r.destino || '').toUpperCase()], r.tipo].join(' '));
    return w.every((x) => txt.indexOf(x) >= 0);
  }).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
}
function textoReparto(c: Ctx, m: any) {
  const d = detalleCarga(partes(m, c.viaje, c.personas), c.personas, m.categoria);
  return pagan(c).filter((p) => (d[p.id].propio + d[p.id].cubre) > 0.004).map((p) => p.nombre + ' ' + fmt(d[p.id].propio + d[p.id].cubre)).join(' · ');
}
function modoTxt(c: Ctx, m: any) {
  if (m.modo === 'todos') return 'todos por igual';
  if (m.modo === 'tope') return 'tope ' + fmt(m.tope) + ' × ' + m.noches + (m.noches === 1 ? ' noche' : ' noches');
  if (m.modo === 'cubiertas') return 'solo ' + nombresCub(c);
  if (m.modo === 'entre') return 'entre ' + lista((m.entre || []).map((id: string) => nom(c, id)));
  if (m.modo === 'invito') return 'invitó ' + nom(c, m.pagador_id);
  return m.modo;
}

/* ---------------- gasto ---------------- */
export function parsearGasto(c: Ctx, texto: string) {
  const crudo = texto.trim().split(/\s+/).slice(1); // sin la palabra "gasto"
  const toks = crudo.map(norm);
  let monto = 0, moneda = 'PEN', pagador = c.yo, modo = 'todos', entre: string[] = [], noches = 1, cat = '', fecha = c.hoy;
  const usados = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!monto) {
      const mm = crudo[i].replace(/^(s\/|us\$|\$)/i, '').match(/^(\d+(?:[.,]\d{1,2})?)$/);
      if (mm) { monto = parseFloat(mm[1].replace(',', '.')); if (/^(us\$|\$)/i.test(crudo[i])) moneda = 'USD'; usados.add(i); continue; }
    }
    if (/^(usd|dolares|dolar|us)$/.test(t)) { moneda = 'USD'; usados.add(i); continue; }
    if (/^(s\/|us\$|\$)$/i.test(crudo[i])) { if (!/^s\/$/i.test(crudo[i])) moneda = 'USD'; usados.add(i); continue; }
    if (/^(soles|sol|s)$/.test(t) && i > 0 && usados.has(i - 1)) { usados.add(i); continue; }
    if (/^(pago|pague|pagado|pagada|paga)$/.test(t) && toks[i + 1]) {
      const p = buscarPersona(c, toks[i + 1]);
      if (p) { pagador = p; usados.add(i); usados.add(i + 1); i++; continue; }
    }
    if (/^(todos|todas|igual)$/.test(t)) { modo = 'todos'; usados.add(i); continue; }
    if (/^(invito|invite|invitado|invitada|yo invito)$/.test(t)) { modo = 'invito'; usados.add(i); continue; }
    if (/^(solo|para)$/.test(t) && /^(papas|padres|papis)$/.test(toks[i + 1] || '')) { modo = 'cubiertas'; usados.add(i); usados.add(i + 1); i++; continue; }
    if (t === 'entre') {
      usados.add(i); modo = 'entre'; entre = [];
      let k = i + 1;
      if (/^(las|los)$/.test(toks[k] || '') && /^(3|tres|hermanas)$/.test(toks[k + 1] || '')) { entre = pagan(c).map((p) => p.id); usados.add(k); usados.add(k + 1); i = k + 1; continue; }
      if (/^(hermanas)$/.test(toks[k] || '')) { entre = pagan(c).map((p) => p.id); usados.add(k); i = k; continue; }
      for (; k < toks.length; k++) {
        if (toks[k] === 'y') { usados.add(k); continue; }
        if (/^(papas|padres)$/.test(toks[k])) { cubiertas(c).forEach((p) => entre.push(p.id)); usados.add(k); continue; }
        const p = buscarPersona(c, toks[k]); if (!p) break;
        if (entre.indexOf(p.id) < 0) entre.push(p.id); usados.add(k);
      }
      i = k - 1; continue;
    }
    if (t === 'tope') {
      usados.add(i); modo = 'tope'; cat = 'hospedaje';
      const n = parseInt(toks[i + 1] || '', 10);
      if (n > 0) { noches = n; usados.add(i + 1); i++; if (/^noches?$/.test(toks[i + 1] || '')) { usados.add(i + 1); i++; } }
      continue;
    }
    if (t === 'ayer') { fecha = sumarDias(c.hoy, -1); usados.add(i); continue; }
    if (t === 'hoy') { usados.add(i); continue; }
    if (t.charAt(0) === '#') { const k = Object.keys(CATS).find((x) => x.startsWith(t.slice(1)) || t.slice(1).startsWith(x.slice(0, 4))); if (k) { cat = k; usados.add(i); continue; } }
  }
  const desc = crudo.filter((_, i) => !usados.has(i)).join(' ').replace(/^(de|en|por)\s+/i, '').trim();
  if (!cat) { for (const w of norm(desc).split(' ')) { const f = PALABRAS_CAT.find((x) => x[0].test(w)); if (f) { cat = f[1]; break; } } }
  if (!cat) cat = 'otros';
  return { monto, moneda, pagador, modo, entre, noches, cat, fecha, desc: desc ? cap(desc) : CATS[cat] };
}

/* ---------------- router ---------------- */
export function responder(c: Ctx, texto: string): Respuesta {
  const t = norm(texto), w = t.split(' '), cmd = w[0] || '';
  const yo = c.yo;

  if (!t || /^(hola|holi|buenas|ayuda|menu|help|comandos|opciones|info|\?)$/.test(t) || t === 'que puedo hacer') return { texto: (cmd.startsWith('hol') || cmd === 'buenas' ? '¡Hola ' + yo.nombre + '! ' : '') + AYUDA };

  if (/^(deuda|debo|saldo|mi saldo|cuanto debo|cuanto me deben|me deben|cuentas mias|mis cuentas)$/.test(t) || /^cuanto (le )?debo/.test(t)) {
    const p = /^cuanto (le )?debo a (\w+)/.exec(t); // "cuanto le debo a andrea"
    if (p) {
      const otra = buscarPersona(c, p[2]);
      if (otra) {
        const l = liquidar(saldos(c.viaje, c.personas, c.movs)).find((z) => z.de === yo.id && z.a === otra.id);
        const l2 = liquidar(saldos(c.viaje, c.personas, c.movs)).find((z) => z.de === otra.id && z.a === yo.id);
        if (l) return { texto: 'Para quedar a mano, le pasas a ' + otra.nombre + ' *' + fmt(l.v) + '*.\n\nEscribe *deuda* para ver de dónde sale.' };
        if (l2) return { texto: 'No le debes nada a ' + otra.nombre + ': al revés, ' + otra.nombre + ' te pasa *' + fmt(l2.v) + '*. 💚' };
        return { texto: 'No le debes nada a ' + otra.nombre + '. 🎉' };
      }
    }
    return { texto: textoSaldo(c, yo) };
  }
  if (/^(saldos|todas|resumen|cuentas|como estamos|como vamos)$/.test(t)) return { texto: textoSaldos(c) };
  if (cmd === 'saldo' && w[1]) { const p = buscarPersona(c, w.slice(1).join(' ')); if (p) return { texto: textoSaldo(c, p) }; }

  if (/^(sugerencia|sugerencias|quien paga|quien invita|quien paga ahora|a quien le toca)$/.test(t)) return { texto: textoSugerencia(c) };

  if (/^(codigo|codigos|cod|reserva|reservas)$/.test(cmd)) {
    const q = w.slice(1).join(' ');
    const rs = q ? buscarReservas(c, q) : futuras(c).filter((r) => codigos(r).length);
    if (!rs.length) return { texto: q ? 'No encontré una reserva con "' + q + '". Prueba con la aerolínea o el lugar, por ejemplo *código atsa*.' : 'Todavía no hay códigos guardados. Agrégalos en la app, pestaña Viaje.' };
    return { texto: '🎫 ' + (q ? 'Encontré:' : 'Códigos de lo que viene:') + '\n\n' + rs.slice(0, 8).map((r) => lineaReserva(r)).join('\n\n') };
  }

  if (/^(agenda|itinerario|proximo|que sigue|que viene)$/.test(t)) return { texto: textoAgenda(c, c.hoy, sumarDias(c.hoy, 3), 'Hoy y los próximos 3 días') };
  if (t === 'hoy' || t === 'que hay hoy') return { texto: textoAgenda(c, c.hoy, c.hoy, 'Hoy') };
  if (t === 'manana' || t === 'que hay manana') { const m = sumarDias(c.hoy, 1); return { texto: textoAgenda(c, m, m, 'Mañana') }; }

  if (/^(checkin|check|check-in)/.test(cmd) || t.startsWith('check in')) {
    const resto = t.replace(/^(check ?-?in|checkin|check)\s*/, '');
    const pend = c.reservas.filter((r) => r.checkin_requerido && !r.checkin_hecho && r.fecha >= c.hoy).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
    const hecho = /^(hecho|listo|ok|ya)\b/.exec(resto);
    if (hecho) {
      const q = resto.replace(/^(hecho|listo|ok|ya)\s*(de|del)?\s*/, '');
      const cands = q ? pend.filter((r) => buscarReservas(c, q).some((x) => x.id === r.id)) : pend.slice(0, 1);
      if (!cands.length) return { texto: q ? 'No encontré un check-in pendiente de "' + q + '".' : 'No hay check-ins pendientes. 🎉' };
      if (cands.length > 1) return { texto: 'Hay varios. ¿Cuál? Escribe por ejemplo *checkin hecho ' + norm(cands[0].titulo).split(' ')[0] + '*:\n\n' + cands.map((r) => lineaReserva(r)).join('\n\n') };
      const r = cands[0];
      return { texto: '✅ Listo: check-in de *' + r.titulo + '* marcado como hecho. ¡Buen viaje! ✈️', accion: { tipo: 'update_res', id: r.id, cambios: { checkin_hecho: true } } };
    }
    if (!pend.length) return { texto: '✈️ No hay check-ins pendientes. 🎉' };
    return { texto: '✈️ *Check-ins pendientes*\n\n' + pend.map((r) => lineaReserva(r)).join('\n\n') + '\n\nCuando lo hagan, escribe *checkin hecho ' + norm(pend[0].titulo).split(' ')[0] + '*.' };
  }

  // pagos entre hermanas: "pasé 200 a andrea", "le pagué 150.50 a camila", "yapeé 80 a adri"
  const pm = /^(?:le |ya le )?(pase|pague|yapee|yapie|plinee|transferi|deposite|di)\s+(?:s\/\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles)?\s+a\s+(\w+)/.exec(t);
  if (pm) {
    const otra = buscarPersona(c, pm[3]);
    if (!otra || otra.tipo !== 'paga') return { texto: 'No sé quién es "' + pm[3] + '". Escribe el nombre, por ejemplo *pasé 200 a andrea*.' };
    if (otra.id === yo.id) return { texto: 'No te puedes pasar plata a ti misma. 😅' };
    const monto = parseFloat(pm[2].replace(',', '.'));
    return {
      texto: '🤝 Anotado: ' + yo.nombre + ' le pasó *' + fmt(monto) + '* a ' + otra.nombre + '.',
      accion: { tipo: 'insert_mov', row: { tipo: 'pago', monto, moneda: 'PEN', de_id: yo.id, a_id: otra.id, fecha: c.hoy, nota: 'Anotado por WhatsApp' } },
      despues: (c2) => '\n\n' + textoSaldo(c2, c2.yo) + '\n\nSi me equivoqué, escribe *borrar*.'
    };
  }

  if (/^(gasto|gaste|gastamos|anota|anotar|registra|registrar)$/.test(cmd)) {
    const g = parsearGasto(c, texto);
    if (!(g.monto > 0)) return { texto: 'Me falta el monto. Escríbelo así:\n*gasto 180 cena pagó camila todos*' };
    if (!g.pagador || g.pagador.tipo !== 'paga') return { texto: 'No sé quién pagó. Escribe *pagó* y el nombre, por ejemplo *gasto 180 cena pagó camila todos*.' };
    if (g.modo === 'entre' && !g.entre.length) return { texto: 'Dime entre quiénes, por ejemplo *gasto 60 taxi entre adri camila*.' };
    const row: any = { tipo: 'gasto', descripcion: g.desc, monto: g.monto, moneda: g.moneda, tc: g.moneda === 'USD' ? Number(c.viaje.tc) : null, pagador_id: g.pagador.id, categoria: g.cat, fecha: g.fecha, modo: g.modo, noches: null, tope: null, detalle: null, entre: null };
    if (g.modo === 'tope') { row.noches = g.noches; row.tope = Number(c.viaje.tope); }
    if (g.modo === 'entre') row.entre = g.entre;
    const total = enSoles(row, c.viaje);
    return {
      texto: '🧾 Anotado: *' + row.descripcion + '* · ' + fmt(total) + (row.moneda === 'USD' ? ' (US$ ' + row.monto.toFixed(2) + ')' : '') + '\n' +
        'Pagó ' + g.pagador.nombre + ' · ' + modoTxt(c, row) + ' · ' + CATS[row.categoria] + (row.fecha !== c.hoy ? ' · ' + fdia(row.fecha) : '') + '\n\n' +
        '_Le toca:_ ' + textoReparto(c, row) + '\n\nSi me equivoqué, escribe *borrar*.',
      accion: { tipo: 'insert_mov', row }
    };
  }

  if (/^(borrar|borra|deshacer|eliminar|me equivoque|cancelar)$/.test(t)) {
    const limite = c.ahora ? new Date(Date.parse(c.ahora) - 24 * 3600e3).toISOString() : '';
    const m = c.movs.filter((x) => x.origen === 'whatsapp' && x.registrado_por === yo.id && (!limite || x.created_at >= limite))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!m) return { texto: 'No encontré nada que hayas anotado por aquí en las últimas 24 horas. Para borrar otra cosa, usa la app.' };
    return {
      texto: '↩️ Borrado: ' + (m.tipo === 'pago' ? 'pago de ' + fmt(m.monto) + ' a ' + nom(c, m.a_id) : '*' + m.descripcion + '* · ' + fmt(enSoles(m, c.viaje))) + '.',
      accion: { tipo: 'delete_mov', id: m.id }
    };
  }

  return { texto: 'No entendí 🙈. Escribe *ayuda* para ver lo que sé hacer.\n\nPor ejemplo: *deuda*, *código atsa* o *gasto 180 cena pagó camila todos*.' };
}

/* ---------------- avisos automáticos (se revisan cada hora) ---------------- */
// Cada aviso trae texto para WhatsApp (texto) y para notificación del celular (titulo, cuerpo, url).
export type Aviso = { clave: string; persona_id: string; telefono: string; texto: string; titulo: string; cuerpo: string; url: string };
export function avisos(c: Ctx, ahora: { fecha: string; hora: string }): Aviso[] {
  const out: Aviso[] = [];
  const con = (ids: string[]) => c.personas.filter((p) => ids.indexOf(p.id) >= 0);
  const manana = sumarDias(ahora.fecha, 1);
  const hora = ahora.hora;
  // 1) Check-in: el día anterior desde las 9:00
  if (hora >= '09:00') c.reservas.filter((r) => r.checkin_requerido && !r.checkin_hecho && r.recordar_checkin !== false && r.fecha === manana).forEach((r) => {
    const cs = codigos(r);
    con(r.quienes || []).forEach((p) => out.push({ clave: 'ck:' + r.id + ':' + p.id, persona_id: p.id, telefono: p.telefono || '',
      texto: '✈️ ' + p.nombre + ', mañana es *' + r.titulo + '*' + (r.hora ? ' a las ' + hhmm(r.hora) : '') + (ruta(r) ? ' (' + ruta(r) + ')' : '') + '. ¡Toca hacer el check-in!' + (cs.length ? ' Código: *' + cs.join('* · *') + '*.' : '') + ' Cuando esté listo, escribe *checkin hecho*.',
      titulo: '✈️ Toca hacer el check-in · ' + r.titulo,
      cuerpo: 'Mañana' + (r.hora ? ' a las ' + hhmm(r.hora) : '') + (ruta(r) ? ' · ' + ruta(r) : '') + '.' + (cs.length ? ' Código: ' + cs.join(' · ') + '.' : '') + ' Cuando lo hagas, márcalo en la app.',
      url: '#res=' + r.id }));
  });
  // 2) Hora de salir: hasta 90 min antes
  c.reservas.filter((r) => r.fecha === ahora.fecha && r.hora_salida).forEach((r) => {
    const [h, m] = hhmm(r.hora_salida).split(':').map(Number), [H, M] = hora.split(':').map(Number);
    const falta = h * 60 + m - (H * 60 + M);
    const cs = codigos(r);
    if (falta >= 0 && falta <= 90) con(r.quienes || []).forEach((p) => out.push({ clave: 'sal:' + r.id + ':' + p.id, persona_id: p.id, telefono: p.telefono || '',
      texto: '🚕 ' + p.nombre + ', a las *' + hhmm(r.hora_salida) + '* toca salir para *' + r.titulo + '*' + (r.hora ? ' (' + hhmm(r.hora) + ')' : '') + '.' + (cs.length ? ' Código: *' + cs.join('* · *') + '*.' : ''),
      titulo: '🚕 A las ' + hhmm(r.hora_salida) + ' toca salir',
      cuerpo: r.titulo + (r.hora ? ' sale a las ' + hhmm(r.hora) : '') + '.' + (cs.length ? ' Código: ' + cs.join(' · ') + '.' : ''),
      url: '#res=' + r.id }));
  });
  // 3) Sugerencia del día (solo durante el viaje, a mediodía, si alguien debe S/ 200 o más)
  const fechas = c.reservas.flatMap((r) => [r.fecha, r.fecha_fin]).filter(Boolean).sort();
  if (fechas.length && ahora.fecha >= fechas[0] && ahora.fecha <= fechas[fechas.length - 1] && hora >= '12:00') {
    const d = sugerencia(c);
    if (d && d.v >= 200) out.push({ clave: 'sug:' + c.viaje.id + ':' + ahora.fecha, persona_id: d.p.id, telefono: d.p.telefono || '',
      texto: '💡 ' + d.p.nombre + ', te recomiendo pagar tú la comida o el taxi de hoy: así no se te acumula. Vas debiendo ' + fmt(d.v) + '. Cuando pagues, anótalo aquí: *gasto 120 cena todos*.',
      titulo: '💡 ' + d.p.nombre + ', hoy te conviene invitar',
      cuerpo: 'Si pagas la comida o el taxi de hoy, no se te acumula lo que debes (' + fmt(d.v) + '). Luego anótalo en la app.',
      url: '#resumen' });
  }
  return out;
}
