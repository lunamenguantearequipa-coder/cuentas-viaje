(function () {
  'use strict';
  // La sesión se guarda en el celular y se renueva sola: solo se pide entrar una vez por dispositivo.
  var sb = window.supabase.createClient(window.CONFIG.supabaseUrl, window.CONFIG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  var app = document.getElementById('app');
  var sheet = document.getElementById('sheet');

  var CATS = {
    pasajes: ['Pasajes', '✈️'], hospedaje: ['Hospedaje', '🏡'], traslados: ['Traslados', '🚐'],
    tours: ['Tours', '🧭'], comidas: ['Comidas', '🍽️'], otros: ['Otros', '🧾']
  };
  var TIPOS = { vuelo: ['Vuelo', '✈️', '#0F6E86'], hospedaje: ['Hospedaje', '🏡', '#2F7A57'], tour: ['Tour', '🧭', '#E0962A'], otro: ['Otro', '⭐', '#E2576B'] };
  var CIUDAD = { AQP: 'Arequipa', LIM: 'Lima', CHH: 'Chachapoyas', TPP: 'Tarapoto', CUZ: 'Cusco', JUL: 'Juliaca', PIU: 'Piura', TRU: 'Trujillo', IQT: 'Iquitos', PCL: 'Pucallpa', JJI: 'Juanjuí', CJA: 'Cajamarca', TCQ: 'Tacna', AYP: 'Ayacucho', JAE: 'Jaén' };
  var COLORS = ['#B4501B', '#6A3FC4', '#0F6E86', '#9A6B12', '#3E6B2C', '#B4235A', '#2F5BB7', '#5B6470'];

  function estado0() { return { session: null, user: null, viaje: null, viajes: [], personas: [], movs: [], reservas: [], fotos: [], urls: {}, tab: 'resumen', filtro: 'todos', q: '', channel: null, abierta: null }; }
  var S = estado0();
  var F = null; // formulario de gasto/pago
  var P = null; // formulario de persona
  var Q = null; // porcentajes de mamá y papá
  var R = null; // formulario de reserva

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function r2(n) { var v = Math.round((Number(n) || 0) * 100) / 100; return Object.is(v, -0) ? 0 : v; }
  function fmt(n) { return 'S/ ' + r2(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(v) { if (v == null) return 0; var s = String(v).trim().replace(/\s/g, ''); if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/,/g, ''); else s = s.replace(',', '.'); var n = parseFloat(s); return isFinite(n) ? n : 0; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function partsF(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fdate(s) { if (!s) return ''; var p = s.split('-'); return (+p[2]) + ' ' + MESES[+p[1] - 1]; }
  function fday(s) { if (!s) return ''; var d = partsF(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function fdayL(s) { var d = partsF(s); return cap(DIAS[d.getDay()]) + ' ' + d.getDate() + ' de ' + MESES_L[d.getMonth()]; }
  function fdayC(s) { var d = partsF(s); return DIAS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
  function diasHasta(s) { var a = partsF(s), b = partsF(hoy()); return Math.round((a - b) / 864e5); }
  function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function toast(t) { var x = document.getElementById('toast'); x.textContent = t; x.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { x.hidden = true; }, 3800); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function errTxt(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Falta confirmar tu correo: revisa tu bandeja (y spam) y abre el enlace.';
    if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
    if (/signups? (are |is )?(disabled|not allowed)/i.test(m)) return 'El registro de cuentas nuevas está apagado. Hay que activarlo en Supabase: Authentication → Sign In / Providers → "Allow new users to sign up".';
    if (/at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
    if (/violates foreign key/i.test(m)) return 'No se puede borrar: tiene movimientos registrados.';
    if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return 'La foto es muy pesada (máximo 10 MB).';
    if (/mime type/i.test(m)) return 'Ese tipo de archivo no se puede subir. Usa una foto o un PDF.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
    return m || 'Algo salió mal. Inténtalo otra vez.';
  }
  function pagan() { return S.personas.filter(function (p) { return p.tipo === 'paga'; }); }
  function cubiertas() { return S.personas.filter(function (p) { return p.tipo === 'cubierta'; }); }
  function per(id) { return S.personas.find(function (p) { return p.id === id; }); }
  function nom(id) { var p = per(id); return p ? p.nombre : '—'; }
  function yo() { return S.personas.find(function (p) { return p.user_id && S.user && p.user_id === S.user.id; }); }
  function av(p, size) { if (!p) return ''; return '<span class="avatar" style="--c:' + esc(p.color) + (size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px' : '') + '" aria-hidden="true">' + esc((p.nombre || '?').trim().charAt(0).toUpperCase()) + '</span>'; }
  function absorbe() { return per(S.viaje && S.viaje.absorbe_tope) || pagan()[0]; }
  function lista(arr) { return arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1]; }
  function nombresCub() { var c = cubiertas(); return c.length ? lista(c.map(function (p) { return p.nombre.toLowerCase(); })) : 'las personas cubiertas'; }
  function quienesTxt(ids) {
    ids = (ids || []).filter(per);
    if (!ids.length) return '';
    if (ids.length === S.personas.length && ids.length > 2) return 'Los ' + ids.length;
    return lista(ids.map(nom));
  }
  // Porcentajes de cobertura (normalizados a 100) para pasajes/hospedaje (base) u otros gastos.
  function pcts(base) {
    var c = cubiertas()[0]; if (!c) return {};
    var cob = base ? (c.cobertura || {}) : Calc.coberturaDe(c, 'comidas');
    var tot = 0, out = {}; Object.keys(cob).forEach(function (k) { if (per(k)) tot += Number(cob[k]) || 0; });
    if (!tot) { var ps = pagan(); ps.forEach(function (p) { out[p.id] = 100 / ps.length; }); return out; }
    Object.keys(cob).forEach(function (k) { if (per(k) && Number(cob[k]) > 0) out[k] = Number(cob[k]) * 100 / tot; });
    return out;
  }
  function pctTxt(v) { return (Math.round(v * 10) / 10) + '%'; }
  function mismaCobertura() { var a = pcts(true), b = pcts(false); return pagan().every(function (p) { return Math.abs((a[p.id] || 0) - (b[p.id] || 0)) < 0.05; }); }

  /* ---------- íconos y decoración ---------- */
  var ICON = {
    resumen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    movs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    viaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    personas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 2 5 5.4"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  var HOJA = function (x, y, rot, sc, f, r) { return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + sc + ')"><path d="M0 0 C30 -20 80 -20 110 0 C80 20 30 20 0 0Z" fill="' + f + '"/><path d="M0 0 L110 0" stroke="' + r + '" stroke-width="2"/></g>'; };
  function leaves(kind) {
    var g = '';
    if (kind === 'chica') g = HOJA(360, 10, 140, 1, '#1E5C45', '#2F7A57');
    else {
      g = HOJA(300, -10, 120, 1.7, '#1E5C45', '#2F7A57') + HOJA(345, 150, 200, 1.3, '#2F7A57', '#4E9A6B') + HOJA(255, 250, -60, 1.1, '#245F44', '#3B8159');
      if (kind === 'flores') g += HOJA(-20, 40, 28, 1.5, '#1E5C45', '#2F7A57') + HOJA(20, 260, -40, 1.2, '#2F7A57', '#4E9A6B') + '<circle cx="300" cy="150" r="14" fill="#E2576B"/><circle cx="314" cy="162" r="9" fill="#F2A93B"/>';
    }
    return '<div class="leaves" aria-hidden="true"><svg style="right:0;top:0" width="390" height="260" viewBox="0 0 390 260">' + g + '</svg></div>';
  }
  function heads(dark) {
    var me = yo();
    return '<div class="heads"><button class="round" type="button" data-guia="1" aria-label="Cómo funciona">?</button>' +
      (me ? '<button class="avbtn" type="button" data-go="ajustes" aria-label="Tu cuenta y ajustes">' + av(me, 44) + '</button>' : '') + '</div>';
  }
  function phead(t, sub) { return '<header class="phead pad"><div style="min-width:0"><h1>' + t + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + heads() + '</header>'; }
  function rango() {
    var min = null, max = null;
    S.reservas.forEach(function (r) { [r.fecha, r.fecha_fin].forEach(function (f) { if (!f) return; if (!min || f < min) min = f; if (!max || f > max) max = f; }); });
    return min ? fdate(min) + ' – ' + fdate(max) + ' · todo en soles' : 'Todo en soles';
  }

  /* ================= ACCESO ================= */
  function authHero(t, sub) { return '<header class="hero">' + leaves('flores') + '<div class="chip-mango">Cuentas Hermanizzz</div><div class="brand">' + t + '</div><div class="sub">' + sub + '</div></header>'; }
  function authView(modo, msg) {
    var redirect = location.origin + location.pathname;
    var h = '<div class="auth">' + authHero('Gastos del viaje, claros para todas', 'Anotamos, la app suma y dice quién le debe a quién.') + '<div class="auth-wrap"><form id="authForm" novalidate>';
    if (modo === 'entrar' || modo === 'crear') {
      h += '<div class="seg" role="group" aria-label="Acceso"><button type="button" data-auth="entrar" aria-pressed="' + (modo === 'entrar') + '">Entrar</button><button type="button" data-auth="crear" aria-pressed="' + (modo === 'crear') + '">Crear cuenta</button></div>' +
        '<label class="f" for="aEmail">Correo<input class="in" id="aEmail" type="email" autocomplete="email" required></label>' +
        '<label class="f" for="aPass">Contraseña<input class="in" id="aPass" type="password" autocomplete="' + (modo === 'crear' ? 'new-password' : 'current-password') + '" minlength="6" required></label>' +
        (modo === 'crear' ? '<p class="muted small" style="margin:0">Mínimo 6 caracteres.</p>' : '') +
        '<button class="btn block" type="submit">' + (modo === 'crear' ? 'Crear cuenta' : 'Entrar') + '</button>' +
        (modo === 'entrar' ? '<button type="button" class="link" data-auth="olvido">Olvidé mi contraseña</button>' : '');
    } else if (modo === 'olvido') {
      h += '<h2>Recuperar contraseña</h2><label class="f" for="aEmail">Correo<input class="in" id="aEmail" type="email" autocomplete="email" required></label>' +
        '<button class="btn block" type="submit">Enviarme el enlace</button><button type="button" class="link" data-auth="entrar">Volver</button>';
    } else if (modo === 'nueva') {
      h += '<h2>Nueva contraseña</h2><label class="f" for="aPass">Contraseña nueva<input class="in" id="aPass" type="password" autocomplete="new-password" minlength="6" required></label><button class="btn block" type="submit">Guardar contraseña</button>';
    }
    h += '<div id="authMsg" class="small" role="alert">' + (msg ? '<span class="warn">' + esc(msg) + '</span>' : '') + '</div></form></div></div>';
    app.innerHTML = h;
    var form = document.getElementById('authForm');
    form.addEventListener('click', function (e) { var b = e.target.closest('[data-auth]'); if (b) authView(b.dataset.auth); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = (document.getElementById('aEmail') || {}).value, pass = (document.getElementById('aPass') || {}).value;
      var out = document.getElementById('authMsg'), btn = form.querySelector('button[type=submit]');
      btn.disabled = true; out.textContent = '';
      try {
        if (modo === 'entrar') { var r = await sb.auth.signInWithPassword({ email: email, password: pass }); if (r.error) throw r.error; }
        else if (modo === 'crear') {
          var r2_ = await sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: redirect } });
          if (r2_.error) throw r2_.error;
          if (!r2_.data.session) { out.innerHTML = '<span class="good">Listo. Te enviamos un correo a ' + esc(email) + ': ábrelo para confirmar y luego entra aquí.</span>'; btn.disabled = false; return; }
        } else if (modo === 'olvido') {
          var r3 = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect }); if (r3.error) throw r3.error;
          out.innerHTML = '<span class="good">Te enviamos un enlace a ' + esc(email) + ' para crear una contraseña nueva.</span>'; btn.disabled = false; return;
        } else if (modo === 'nueva') {
          var r4 = await sb.auth.updateUser({ password: pass }); if (r4.error) throw r4.error; toast('Contraseña actualizada.'); boot(); return;
        }
      } catch (err) { out.innerHTML = '<span class="warn">' + esc(errTxt(err)) + '</span>'; btn.disabled = false; }
    });
    var first = form.querySelector('input'); if (first) first.focus();
  }

  function joinView(msg) {
    app.innerHTML = '<div class="auth">' + authHero('Únete al viaje', 'Escribe el código que te pasaron por WhatsApp.') + '<div class="auth-wrap"><form id="joinForm" novalidate>' +
      '<label class="f" for="jCode">Código del viaje<input class="in" id="jCode" autocomplete="off" autocapitalize="characters" placeholder="SELVA-XXXX" required></label>' +
      '<button class="btn block" type="submit">Unirme</button>' +
      '<button type="button" class="link" id="jOut">Salir de esta cuenta</button>' +
      '<div id="jMsg" class="small" role="alert">' + (msg ? '<span class="warn">' + esc(msg) + '</span>' : '') + '</div></form></div></div>';
    document.getElementById('jOut').onclick = function () { sb.auth.signOut(); };
    document.getElementById('joinForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var c = document.getElementById('jCode').value.trim();
      if (!c) return;
      var r = await sb.rpc('unirse', { p_codigo: c });
      if (r.error) { joinView(/no encontrado/i.test(r.error.message) ? 'No encontramos ese código. Revisa que esté igual que en el mensaje.' : errTxt(r.error)); return; }
      store('viaje', r.data); boot();
    });
    document.getElementById('jCode').focus();
  }

  function whoView(msg) {
    var mine = yo();
    var opts = S.personas.filter(function (p) { return p.tipo === 'paga' && (!p.user_id || (S.user && p.user_id === S.user.id)); });
    app.innerHTML = '<div class="auth">' + authHero('¿Quién eres?', 'Elige tu nombre. Así la app sabe cuáles son tus cuentas.') + '<div class="auth-wrap"><div class="box">' +
      (opts.length ? '<div class="pick" style="flex-direction:column">' + opts.map(function (p) {
        return '<button type="button" data-soy="' + p.id + '" aria-pressed="' + (!!(mine && mine.id === p.id)) + '" style="width:100%;justify-content:flex-start;padding:8px">' + av(p, 40) + '<span style="font-size:18px">' + esc(p.nombre) + '</span></button>';
      }).join('') + '</div>' : '<p class="muted">Todas las personas ya tienen cuenta vinculada. Pídele a una hermana que te agregue en la pestaña Personas.</p>') +
      (mine ? '<button class="btn ghost block" type="button" id="wBack">Volver</button>' : '') +
      '<div class="small" role="alert">' + (msg ? '<span class="warn">' + esc(msg) + '</span>' : '') + '</div></div></div></div>';
    app.onclick = async function (e) {
      var b = e.target.closest('[data-soy]');
      if (b) { var r = await sb.rpc('soy', { p_persona: b.dataset.soy }); if (r.error) { whoView(errTxt(r.error)); return; } app.onclick = null; await loadData(); render(); toast('Listo, eres ' + nom(b.dataset.soy) + '.'); primeraVez(); return; }
      if (e.target.id === 'wBack') { app.onclick = null; render(); }
    };
  }

  /* ================= DATOS ================= */
  var booting = false;
  async function boot() {
    if (booting) return; booting = true;
    try { await bootIn(); } finally { booting = false; }
  }
  async function bootIn() {
    var s = await sb.auth.getSession();
    S.session = s.data.session; S.user = S.session && S.session.user;
    if (!S.session) { authView('entrar'); return; }
    var v = await sb.from('viajes').select('*').order('created_at');
    if (v.error) { authView('entrar', errTxt(v.error)); return; }
    S.viajes = v.data || [];
    if (!S.viajes.length) { joinView(); return; }
    var want = store('viaje');
    S.viaje = S.viajes.find(function (x) { return x.id === want; }) || S.viajes[0];
    store('viaje', S.viaje.id);
    await loadData();
    suscribir();
    if (!yo()) { whoView(); return; }
    render();
    if (!abrirHash(location.hash)) primeraVez();
    refrescarPush();
  }
  function primeraVez() { if (!store('guiaVista')) { store('guiaVista', '1'); guia(); } }

  /* ================= AVISOS EN EL CELULAR (Web Push) ================= */
  var PUSH = { estado: '' }; // instalar | no-soportado | bloqueado | off | on
  function esIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function instalada() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.abrir != null) abrirHash(e.data.abrir); });
  }
  async function estadoPush() {
    if (esIOS() && !instalada()) return 'instalar';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return esIOS() ? 'instalar' : 'no-soportado';
    if (Notification.permission === 'denied') return 'bloqueado';
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      var sub = reg && await reg.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    } catch (e) { return 'off'; }
  }
  async function refrescarPush() {
    var antes = PUSH.estado;
    PUSH.estado = await estadoPush();
    if (PUSH.estado === 'on') guardarSub(); // por si cambió de persona o se renovó
    if (antes !== PUSH.estado && document.querySelector('.shell') && sheet.hidden && (S.tab === 'resumen' || S.tab === 'ajustes')) { var y = window.scrollY; render(); window.scrollTo(0, y); }
  }
  function b64u8(s) { var p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  async function guardarSub(sub) {
    try {
      if (!sub) { var reg = await navigator.serviceWorker.getRegistration(); sub = reg && await reg.pushManager.getSubscription(); }
      if (!sub || !yo()) return false;
      var j = sub.toJSON();
      var r = await sb.from('push_subs').upsert({ viaje_id: S.viaje.id, persona_id: yo().id, user_id: S.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, dispositivo: esIOS() ? 'iPhone' : (navigator.platform || 'web') }, { onConflict: 'endpoint' });
      if (r.error) { toast(errTxt(r.error)); return false; }
      return true;
    } catch (e) { return false; }
  }
  async function activarPush(btn) {
    // En iPhone el permiso hay que pedirlo apenas se toca el botón.
    var perm;
    try { perm = await Notification.requestPermission(); } catch (e) { perm = 'default'; }
    if (perm !== 'granted') { PUSH.estado = perm === 'denied' ? 'bloqueado' : 'off'; render(); toast(perm === 'denied' ? 'Bloqueaste los avisos. Puedes permitirlos en los Ajustes del celular.' : 'No se activaron los avisos.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Activando…'; }
    try {
      var reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u8(window.CONFIG.vapidPublic) });
      if (!(await guardarSub(sub))) throw new Error('No se pudo guardar');
      PUSH.estado = 'on'; render(); toast('¡Avisos activados! Te mandamos uno de prueba.');
      probarPush(true);
    } catch (e) { PUSH.estado = await estadoPush(); render(); toast('No se pudieron activar los avisos: ' + errTxt(e)); }
  }
  async function probarPush(silencioso) {
    var r = await sb.functions.invoke('avisos', { body: { accion: 'prueba' } });
    if (silencioso) return;
    if (r.error) { toast('No se pudo mandar la prueba.'); return; }
    toast(r.data && r.data.enviados ? 'Listo: revisa tu celular en unos segundos.' : 'No encontramos tu celular. Desactiva y vuelve a activar los avisos.');
  }
  async function desactivarPush() {
    try {
      var reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    } catch (e) {}
    PUSH.estado = 'off'; render(); toast('Avisos desactivados en este celular.');
  }
  function tarjetaPush() {
    var e = PUSH.estado, h = '<section class="section"><h2>Avisos en tu celular</h2><div class="card">';
    var que = '<span class="muted small">Te avisa el check-in un día antes, la hora de salir al aeropuerto, cuando otra anota un gasto y a quién le conviene pagar ese día.</span>';
    if (e === 'on') h += '<div style="display:flex;align-items:center;gap:10px"><span class="pill ok">✓ Activados</span><span class="small">en este celular</span></div>' + que +
      '<div class="actions"><button class="btn sm soft" type="button" data-pushprueba="1">Mandar aviso de prueba</button><button class="btn sm ghost" type="button" data-pushoff="1">Desactivar</button></div>';
    else if (e === 'instalar') h += '<b>Primero, agrega la app a tu pantalla de inicio</b><ol class="pasos">' +
      '<li>Abre este link en <b>Safari</b>.</li><li>Toca <b>Compartir</b> <span aria-hidden="true">(el cuadrado con la flecha ↑)</span>.</li>' +
      '<li>Elige <b>Agregar a inicio</b> y luego <b>Agregar</b>.</li><li>Abre <b>Hermanizzz</b> desde el ícono nuevo, entra a Ajustes y toca <b>Activar avisos</b>.</li></ol>' +
      '<span class="muted xs">En iPhone los avisos solo funcionan desde el ícono de inicio (iOS 16.4 o más nuevo).</span>';
    else if (e === 'bloqueado') h += '<b>Los avisos están bloqueados</b><span class="small">' + (esIOS() ? 'En el iPhone ve a <b>Ajustes → Notificaciones → Hermanizzz</b> y activa <b>Permitir notificaciones</b>. Luego vuelve aquí.' : 'Permite las notificaciones de esta página en la configuración del navegador y vuelve aquí.') + '</span>';
    else if (e === 'no-soportado') h += '<span class="small">Este navegador no permite avisos. En iPhone usa Safari; en Android, Chrome.</span>';
    else h += que + '<button class="btn mango block" type="button" data-pushon="1">🔔 Activar avisos</button>';
    return h + '</div></section>';
  }
  function abrirHash(h) {
    h = String(h || '');
    if (!h || h === '#') return false;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    var m;
    if ((m = /^#res=(.+)$/.exec(h)) && S.reservas.some(function (r) { return r.id === m[1]; })) { cerrarSheet(); S.tab = 'viaje'; render(); verRes(m[1]); return true; }
    if ((m = /^#mov=(.+)$/.exec(h)) && S.movs.some(function (x) { return x.id === m[1]; })) { cerrarSheet(); S.tab = 'movs'; render(); verMov(m[1]); return true; }
    if (/^#(viaje|resumen|movs|personas|ajustes)$/.test(h)) { cerrarSheet(); S.tab = h.slice(1); render(); return true; }
    return false;
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && yo()) refrescarPush(); });
  async function loadData() {
    var id = S.viaje.id;
    var r = await Promise.all([
      sb.from('viajes').select('*').eq('id', id).single(),
      sb.from('personas').select('*').eq('viaje_id', id).order('orden').order('created_at'),
      sb.from('movimientos').select('*').eq('viaje_id', id).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('reservas').select('*').eq('viaje_id', id).order('fecha').order('hora', { nullsFirst: false }),
      sb.from('reserva_fotos').select('*').eq('viaje_id', id).order('created_at')
    ]);
    if (r[0].data) S.viaje = r[0].data;
    if (r[1].data) S.personas = r[1].data;
    if (r[2].data) S.movs = r[2].data;
    if (r[3].data) S.reservas = r[3].data;
    if (r[4].data) S.fotos = r[4].data;
    var err = r[0].error || r[1].error || r[2].error || r[3].error || r[4].error;
    if (err) toast(errTxt(err));
  }
  function refrescar() {
    if (!yo() || !document.querySelector('.shell')) return;
    var y = window.scrollY; render(); window.scrollTo(0, y);
    if (S.abierta && !sheet.hidden) {
      if (S.abierta.k === 'res' && S.reservas.some(function (r) { return r.id === S.abierta.id; })) verRes(S.abierta.id);
      if (S.abierta.k === 'mov' && S.movs.some(function (m) { return m.id === S.abierta.id; })) verMov(S.abierta.id);
    }
  }
  function suscribir() {
    if (S.channel) sb.removeChannel(S.channel);
    var id = S.viaje.id, t;
    var again = function () { clearTimeout(t); t = setTimeout(async function () { await loadData(); refrescar(); }, 350); };
    var ch = sb.channel('viaje-' + id);
    ['movimientos', 'personas', 'reservas', 'reserva_fotos'].forEach(function (tb) { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: tb, filter: 'viaje_id=eq.' + id }, again); });
    S.channel = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'viajes', filter: 'id=eq.' + id }, again).subscribe();
  }
  document.addEventListener('visibilitychange', async function () { if (!document.hidden && S.viaje && yo()) { await loadData(); refrescar(); } });

  /* ================= VISTA PRINCIPAL ================= */
  function proxCheckin() {
    var h = hoy();
    return S.reservas.filter(function (r) { return r.checkin_requerido && !r.checkin_hecho && r.fecha >= h; })
      .sort(function (a, b) { return (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99')); })[0];
  }
  function codigosDe(r) { return (r.codigos || []).map(function (c) { return c && c.codigo; }).filter(Boolean); }

  function render() {
    var tabs = [['resumen', 'Resumen'], ['movs', 'Movimientos'], ['plus'], ['viaje', 'Viaje'], ['personas', 'Personas']];
    var pc = proxCheckin(), dot = pc && pc.recordar_checkin && diasHasta(pc.fecha) <= 1;
    app.innerHTML = '<div class="shell"><main id="main">' + vista() + '</main>' +
      '<nav class="tabbar" aria-label="Secciones"><div class="tabbar-in">' + tabs.map(function (t) {
        if (t[0] === 'plus') return '<button class="tab" type="button" data-nuevo="1" aria-label="Registrar gasto o pago"><span class="fab">' + ICON.plus + '</span>Registrar</button>';
        return '<button class="tab" type="button" data-go="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + ICON[t[0]] + t[1] + (t[0] === 'viaje' && dot ? '<span class="dot" aria-label="Check-in pendiente"></span>' : '') + '</button>';
      }).join('') + '</div></nav></div>';
  }
  function vista() {
    if (S.tab === 'movs') return vistaMovs();
    if (S.tab === 'viaje') return vistaViaje();
    if (S.tab === 'personas') return vistaPersonas();
    if (S.tab === 'ajustes') return vistaAjustes();
    return vistaResumen();
  }

  /* ---------- Resumen ---------- */
  function vistaResumen() {
    var o = Calc.saldos(S.viaje, S.personas, S.movs), me = yo(), h = '';
    var x = (me && o[me.id]) || { pago: 0, toca: 0, propio: 0, cubre: 0, env: 0, rec: 0, net: 0 }, n = r2(x.net);
    var pb = pcts(true), misma = mismaCobertura();
    h += '<header class="hero">' + leaves() +
      '<div class="top"><div class="trip">' + esc(S.viaje.nombre) + '<small>' + esc(rango()) + '</small></div>' + heads() + '</div>' +
      '<div><div class="who-big">' + av(me, 30) + esc(me ? me.nombre : '') + (n > 0.009 ? ', te deben' : n < -0.009 ? ', debes' : ', estás a mano') + '</div>' +
      '<div class="big num">' + fmt(Math.abs(n)) + '</div></div>' +
      '<div class="breakdown num"><div class="t">De dónde sale</div>' +
      '<div class="r"><span>Pagaste</span><b>' + fmt(x.pago) + '</b></div>' +
      '<div class="r"><span>Te toca</span><b>− ' + fmt(x.toca) + '</b></div>' +
      '<div class="r sub"><span>Lo tuyo</span><span>' + fmt(x.propio) + '</span></div>' +
      (x.cubre > 0.004 ? '<div class="r sub"><span>Tu ' + (misma && me && pb[me.id] ? pctTxt(pb[me.id]) : 'parte') + ' de ' + esc(nombresCub()) + '</span><span>' + fmt(x.cubre) + '</span></div>' : '') +
      (x.env > 0.004 ? '<div class="r"><span>Ya pasaste a tus hermanas</span><b>+ ' + fmt(x.env) + '</b></div>' : '') +
      (x.rec > 0.004 ? '<div class="r"><span>Ya te pasaron</span><b>− ' + fmt(x.rec) + '</b></div>' : '') +
      '</div></header><div class="pad" style="display:flex;flex-direction:column;gap:18px">';

    var pc = proxCheckin();
    if (pc && diasHasta(pc.fecha) <= 1) {
      var cs = codigosDe(pc);
      h += '<button class="ckin" type="button" data-res="' + pc.id + '">' + ICON.bell + '<span class="mid"><b>' + (diasHasta(pc.fecha) === 0 ? 'Hoy' : 'Mañana') + ': check-in de ' + esc(pc.titulo) + '</b><span>' + (cs.length ? 'Código ' + esc(cs.join(' · ')) : 'Abre la reserva') + '</span></span><span class="go">Ver</span></button>';
    }

    var l = Calc.liquidar(o);
    h += '<section class="section"><h2>Para quedar a mano</h2><div class="card" style="padding:4px 14px">' + (l.length ? l.map(function (t) {
      var txt, btn, quien;
      if (me && t.a === me.id) { quien = per(t.de); txt = esc(nom(t.de)) + ' te pasa'; btn = 'Ya me pagó'; }
      else if (me && t.de === me.id) { quien = per(t.a); txt = 'Le pasas a ' + esc(nom(t.a)); btn = 'Ya le pagué'; }
      else { quien = per(t.de); txt = esc(nom(t.de)) + ' le pasa a ' + esc(nom(t.a)); btn = 'Ya se pagó'; }
      return '<div class="liq">' + av(quien, 38) + '<div class="t"><span>' + txt + '</span><b class="num">' + fmt(t.v) + '</b></div><button class="btn sm soft" type="button" data-liq="' + t.de + '|' + t.a + '|' + t.v + '">' + btn + '</button></div>';
    }).join('') : '<div class="empty">Están a mano. 🎉</div>') + '</div></section>';

    if (PUSH.estado && PUSH.estado !== 'on' && PUSH.estado !== 'no-soportado' && !store('pushOculto')) {
      h += '<div class="tip">' + ICON.bell + '<div style="flex:1"><b>Activa los avisos en tu celular</b><span>Te avisamos el check-in un día antes, la hora de salir y cuando otra anota un gasto.</span>' +
        '<div class="actions" style="margin-top:8px"><button class="btn sm mango" type="button" data-go="ajustes">' + (PUSH.estado === 'instalar' ? 'Ver cómo' : 'Activar') + '</button><button class="btn sm ghost" type="button" data-pushoculto="1">Ahora no</button></div></div></div>';
    }

    var deb = pagan().map(function (p) { return { p: p, v: -r2((o[p.id] || {}).net) }; }).filter(function (d) { return d.v >= 50; }).sort(function (a, b) { return b.v - a.v; })[0];
    if (deb) {
      var mine = me && deb.p.id === me.id;
      h += '<div class="tip">' + ICON.bulb + '<div><b>Sugerencia</b><span>' + (mine ? 'Te conviene pagar tú el próximo gasto compartido (una cena, un taxi), así no se te acumula lo que debes.' : 'Que ' + esc(deb.p.nombre) + ' pague el próximo gasto compartido (una cena, un taxi), así no se le acumula lo que debe.') + '</span></div></div>';
    }

    h += '<section class="section"><h2>Las ' + (pagan().length === 3 ? 'tres' : pagan().length) + '</h2><div class="tres">' + pagan().map(function (p) {
      var v = r2((o[p.id] || {}).net);
      return '<button type="button" style="--c:' + esc(p.color) + '" data-pver="' + p.id + '"><b class="n">' + esc(p.nombre) + '</b><span>' + (v > 0.009 ? 'Le deben' : v < -0.009 ? 'Debe' : 'A mano') + '</span><b class="v num ' + (v > 0.009 ? 'good' : v < -0.009 ? 'bad' : '') + '">' + fmt(Math.abs(v)) + '</b></button>';
    }).join('') + '</div></section>';

    var tot = 0, porCat = {};
    S.movs.forEach(function (m) { if (m.tipo === 'pago') return; var v = Calc.enSoles(m, S.viaje); tot += v; var c = CATS[m.categoria] ? m.categoria : 'otros'; porCat[c] = (porCat[c] || 0) + v; });
    var max = Math.max.apply(null, Object.keys(porCat).map(function (k) { return porCat[k]; }).concat([1]));
    h += '<section class="section"><h2>Gasto del viaje</h2><div class="card"><div class="num" style="font-family:var(--display);font-weight:800;font-size:28px">' + fmt(tot) + '</div>' +
      (tot ? '<div class="bars">' + Object.keys(CATS).filter(function (k) { return porCat[k]; }).sort(function (a, b) { return porCat[b] - porCat[a]; }).map(function (k) {
        return '<div class="bar"><span>' + CATS[k][1] + ' ' + CATS[k][0] + '</span><span class="track"><span class="fill" style="width:' + Math.max(2, porCat[k] / max * 100) + '%"></span></span><span class="num small">' + fmt(porCat[k]) + '</span></div>';
      }).join('') + '</div>' : '<p class="muted" style="margin:0">Todavía no hay gastos. Toca <b>Registrar</b> para anotar el primero.</p>') + '</div></section>';
    return h + '</div>';
  }

  /* ---------- Movimientos ---------- */
  function filtrados() {
    var q = S.q.trim().toLowerCase();
    return S.movs.filter(function (m) {
      if (S.filtro === 'pagos' && m.tipo !== 'pago') return false;
      if (CATS[S.filtro] && (m.tipo === 'pago' || m.categoria !== S.filtro)) return false;
      if (S.filtro.indexOf('p:') === 0) {
        var pid = S.filtro.slice(2);
        if (m.tipo === 'pago') { if (m.de_id !== pid && m.a_id !== pid) return false; }
        else { var c = Calc.partes(m, S.viaje, S.personas); if (m.pagador_id !== pid && !(c[pid] > 0.004)) { var cg = Calc.carga(m, S.viaje, S.personas); if (!(cg[pid] > 0.004)) return false; } }
      }
      if (q) { var t = ((m.descripcion || '') + ' ' + (m.nota || '') + ' ' + nom(m.pagador_id) + ' ' + nom(m.de_id) + ' ' + nom(m.a_id)).toLowerCase(); if (t.indexOf(q) < 0) return false; }
      return true;
    });
  }
  function listaMovs() {
    var list = filtrados(), h = '';
    if (!list.length) return '<div class="list empty">' + (S.movs.length ? 'No hay movimientos con ese filtro.' : 'Todavía no hay movimientos. Toca <b>Registrar</b> para anotar el primero.') + '</div>';
    var tot = 0; list.forEach(function (m) { if (m.tipo !== 'pago') tot += Calc.enSoles(m, S.viaje); });
    h += '<div class="muted small num">' + list.length + (list.length === 1 ? ' movimiento' : ' movimientos') + (tot ? ' · gastos ' + fmt(tot) : '') + '</div>';
    var byDay = {}, order = [];
    list.forEach(function (m) { if (!byDay[m.fecha]) { byDay[m.fecha] = []; order.push(m.fecha); } byDay[m.fecha].push(m); });
    order.forEach(function (d) { h += '<div class="day">' + esc(fday(d)) + '</div><div class="list">' + byDay[d].map(itemHtml).join('') + '</div>'; });
    return h;
  }
  function vistaMovs() {
    var chips = [['todos', 'Todos'], ['pagos', '🤝 Pagos']].concat(Object.keys(CATS).map(function (k) { return [k, CATS[k][1] + ' ' + CATS[k][0]]; }));
    if (S.filtro.indexOf('p:') === 0) chips.unshift([S.filtro, nom(S.filtro.slice(2)) + ' ✕']);
    return phead('Movimientos', 'Todo lo que se pagó, día por día. Toca uno para ver cómo se reparte.') +
      '<section class="section pad"><div class="search"><input class="in" id="q" type="search" placeholder="Buscar: Laguna, cena, Camila…" value="' + esc(S.q) + '" aria-label="Buscar movimientos"></div>' +
      '<div class="chips" role="group" aria-label="Filtrar">' + chips.map(function (c) { return '<button type="button" class="chip" data-filtro="' + c[0] + '" aria-pressed="' + (S.filtro === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<div id="movList" style="display:flex;flex-direction:column;gap:10px">' + listaMovs() + '</div></section>';
  }
  function itemHtml(m) {
    if (m.tipo === 'pago') {
      return '<button class="item" type="button" data-ver="' + m.id + '"><span class="ico">🤝</span><span style="min-width:0"><div class="d">' + esc(nom(m.de_id)) + ' → ' + esc(nom(m.a_id)) + '</div><div class="m">' + esc(m.nota || 'Pago entre hermanas') + '</div></span><span class="a num">' + fmt(m.monto) + '</span></button>';
    }
    var cat = CATS[m.categoria] || CATS.otros;
    return '<button class="item" type="button" data-ver="' + m.id + '"><span class="ico">' + cat[1] + '</span><span style="min-width:0"><div class="d">' + esc(m.descripcion) + '</div><div class="m">Pagó ' + esc(nom(m.pagador_id)) + ' · ' + esc(modoTxt(m)) + '</div></span>' +
      '<span class="a num">' + fmt(Calc.enSoles(m, S.viaje)) + (m.moneda === 'USD' ? '<small>US$ ' + Number(m.monto).toFixed(2) + '</small>' : '') + '</span></button>';
  }
  function modoTxt(m) {
    if (m.modo === 'todos') return 'Todos por igual';
    if (m.modo === 'tope') return 'Tope S/ ' + (m.tope || S.viaje.tope) + ' × ' + (m.noches || 1) + (Number(m.noches) === 1 ? ' noche' : ' noches');
    if (m.modo === 'detalle') return 'Monto por persona';
    if (m.modo === 'cubiertas') return 'Solo ' + nombresCub();
    if (m.modo === 'entre') return 'Entre ' + lista((m.entre || []).map(nom));
    if (m.modo === 'invito') return 'Invitó ' + nom(m.pagador_id);
    return '';
  }

  /* ---------- Viaje ---------- */
  function rutaTxt(r) {
    if (!r.origen && !r.destino) return '';
    var c = function (x) { x = (x || '').toUpperCase(); return CIUDAD[x] || x; };
    return c(r.origen) + ' → ' + c(r.destino);
  }
  function evHtml(r, salida) {
    var t = TIPOS[r.tipo] || TIPOS.otro, cs = codigosDe(r), nf = S.fotos.filter(function (f) { return f.reserva_id === r.id; }).length;
    var hora = salida ? '<span class="h none">Salida</span>' : r.hora ? '<span class="h num">' + hhmm(r.hora) + '</span>' : '<span class="h none">' + (r.tipo === 'hospedaje' ? 'Llegada' : 'Sin hora') + '</span>';
    var titulo = (salida ? 'Dejar ' : '') + r.titulo + (rutaTxt(r) ? ' · ' + rutaTxt(r) : '');
    var sub = [quienesTxt(r.quienes), cs.join(' · '), r.lugar, nf ? '📷 ' + nf : ''].filter(Boolean).join(' · ');
    var pill = !salida && r.checkin_requerido ? (r.checkin_hecho ? '<span class="pill ok">Check-in ✓</span>' : '<span class="pill">Check-in</span>') : '<span></span>';
    return '<button class="ev" type="button" data-res="' + r.id + '" style="--k:' + t[2] + '">' + hora + '<span class="mid"><b>' + t[1] + ' ' + esc(titulo) + '</b><span>' + esc(sub || t[0]) + '</span></span>' + pill + '</button>';
  }
  function vistaViaje() {
    var pc = proxCheckin(), h = '<header class="hero">' + leaves() +
      '<div class="top"><div style="min-width:0"><h1>El viaje</h1><div class="sub">Vuelos, hospedajes y tours, con sus códigos</div></div>' + heads() + '</div>';
    if (pc) {
      var d = diasHasta(pc.fecha), cs = codigosDe(pc);
      h += '<button class="ckin" type="button" data-res="' + pc.id + '">' + ICON.bell + '<span class="mid"><b>' + (d === 0 ? '¡Hoy! ' : d === 1 ? '¡Mañana! ' : '') + 'Check-in pendiente · ' + esc(pc.titulo) + ' ' + esc(fdate(pc.fecha)) + '</b><span>' + esc([cs.length ? 'Código ' + cs.join(' · ') : '', quienesTxt(pc.quienes)].filter(Boolean).join(' · ')) + '</span></span><span class="go">Ver</span></button>';
    } else if (S.reservas.length) {
      h += '<div class="ckin ok">' + ICON.check + '<span class="mid"><b>Sin check-ins pendientes</b><span>Cuando falte uno, aparece aquí.</span></span></div>';
    }
    h += '</header><div class="pad" style="display:flex;flex-direction:column;gap:12px">';
    var ev = [];
    S.reservas.forEach(function (r) {
      ev.push({ f: r.fecha, k: hhmm(r.hora) || (r.tipo === 'hospedaje' ? '98' : '97'), html: evHtml(r) });
      if (r.tipo === 'hospedaje' && r.fecha_fin && r.fecha_fin !== r.fecha) ev.push({ f: r.fecha_fin, k: '00', html: evHtml(r, true) });
    });
    ev.sort(function (a, b) { return (a.f + a.k).localeCompare(b.f + b.k); });
    if (!ev.length) h += '<div class="tip">' + ICON.bulb + '<div><b>Aquí va la agenda</b><span>Agrega vuelos, hospedajes y tours con su fecha, hora y código. La app te avisa cuándo toca hacer check-in.</span></div></div>';
    var dia = null, h0 = hoy();
    ev.forEach(function (e) {
      if (e.f !== dia) { if (dia) h += '</div>'; dia = e.f; h += '<div class="day"' + (e.f < h0 ? ' style="opacity:.6"' : '') + '>' + esc(fdayL(e.f)) + (e.f === h0 ? ' · hoy' : '') + '</div><div class="tl">'; }
      h += e.html;
    });
    if (dia) h += '</div>';
    h += '<button class="dashed" type="button" data-nres="1">+ Agregar vuelo, hospedaje o tour</button></div>';
    return h;
  }

  /* ---------- Personas ---------- */
  function splitBar(pc) {
    return '<div class="split">' + pagan().filter(function (p) { return pc[p.id] > 0; }).map(function (p) {
      var v = pc[p.id];
      return '<div style="flex:' + v + ';--c:' + esc(p.color) + '">' + (v >= 20 ? esc(p.nombre) + ' ' : '') + pctTxt(v) + '</div>';
    }).join('') + '</div>';
  }
  function vistaPersonas() {
    var o = Calc.saldos(S.viaje, S.personas, S.movs), me = yo(), cubs = cubiertas();
    var h = phead('Personas', cubs.length ? 'Cada una paga lo suyo. A ' + esc(nombresCub()) + ' los cubrimos entre todas.' : 'Cada una paga lo suyo.') + '<div class="pad" style="display:flex;flex-direction:column;gap:10px">';
    h += pagan().map(function (p) {
      var x = o[p.id] || { pago: 0, toca: 0, net: 0 }, n = r2(x.net);
      return '<button class="pcard" type="button" data-pver="' + p.id + '">' + av(p) + '<span class="mid"><b>' + esc(p.nombre) + (me && me.id === p.id ? ' <span class="badge you">Tú</span>' : '') + '</b><span class="num">Pagó ' + fmt(x.pago) + ' · Le toca ' + fmt(x.toca) + '</span></span>' +
        '<span class="end"><span>' + (n > 0.009 ? 'Le deben' : n < -0.009 ? 'Debe' : 'A mano') + '</span><b class="num ' + (n > 0.009 ? 'good' : n < -0.009 ? 'bad' : '') + '">' + fmt(Math.abs(n)) + '</b></span></button>';
    }).join('');
    if (cubs.length) {
      var partesTot = 0;
      S.movs.forEach(function (m) { if (m.tipo === 'pago') return; var pp = Calc.partes(m, S.viaje, S.personas); cubs.forEach(function (c) { partesTot += pp[c.id] || 0; }); });
      var misma = mismaCobertura();
      h += '<div class="parents">' + leaves('chica') + '<div class="head"><div class="avatars">' + cubs.map(function (c) { return '<button class="avbtn" type="button" data-editp="' + c.id + '" aria-label="Editar a ' + esc(c.nombre) + '">' + av(c, 38) + '</button>'; }).join('') + '</div>' +
        '<div><b>' + esc(cap(nombresCub())) + '</b><span class="num">Su parte hasta hoy: ' + fmt(partesTot) + '</span></div></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px"><span class="lab">' + (misma ? 'Quién los cubre (todo el viaje)' : 'Pasajes y hospedaje') + '</span>' + splitBar(pcts(true)) + '</div>' +
        (misma ? '' : '<div style="display:flex;flex-direction:column;gap:6px"><span class="lab">Comidas, tours y traslados</span>' + splitBar(pcts(false)) + '</div>') +
        '<button class="btn mango" type="button" data-pct="1">Cambiar porcentajes</button></div>';
    }
    h += '<button class="btn ghost block" type="button" data-editp="nueva">+ Agregar persona</button></div>';
    return h;
  }

  /* ---------- Ajustes ---------- */
  function vistaAjustes() {
    var v = S.viaje, me = yo();
    return phead('Ajustes', 'Avisos, reglas del viaje, invitación y tu cuenta.') + '<div class="pad" style="display:flex;flex-direction:column;gap:18px">' + tarjetaPush() +
      '<section class="section"><h2>Reglas del viaje</h2><form class="card" id="cfg" novalidate>' +
      '<label class="f" for="cNombre">Nombre del viaje<input class="in" id="cNombre" value="' + esc(v.nombre) + '"></label>' +
      '<div class="row"><label class="f" for="cTope">Tope por noche (S/)<input class="in" id="cTope" inputmode="decimal" value="' + esc(v.tope) + '"></label>' +
      '<label class="f" for="cTc">Tipo de cambio (S/ por US$)<input class="in" id="cTc" inputmode="decimal" value="' + esc(v.tc) + '"></label></div>' +
      '<label class="f" for="cAbs">Quién pone lo que pase del tope<select class="in" id="cAbs">' + pagan().map(function (p) { return '<option value="' + p.id + '"' + (absorbe() && absorbe().id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select></label>' +
      '<p class="muted small" style="margin:0">El tipo de cambio aplica a los gastos nuevos en dólares. Los porcentajes de ' + esc(nombresCub()) + ' se cambian en Personas.</p>' +
      '<button class="btn" type="submit">Guardar reglas</button></form></section>' +
      '<section class="section"><h2>Invitar</h2><div class="card"><p style="margin:0">Pásales este código a tus hermanas. Entran a esta misma página, crean su cuenta y lo escriben.</p>' +
      '<div class="code num">' + esc(v.codigo) + '</div><button class="btn mango" type="button" id="copyCode">Copiar invitación</button>' +
      '<p class="muted small" style="margin:0;overflow-wrap:anywhere">Link: ' + esc(location.origin + location.pathname) + '</p></div></section>' +
      '<section class="section"><h2>Tu cuenta</h2><div class="card"><div class="small muted">Entraste como</div><div style="overflow-wrap:anywhere"><b>' + esc(S.user && S.user.email) + '</b>' + (me ? ' · eres <b>' + esc(me.nombre) + '</b>' : '') + '</div>' +
      '<div class="actions"><button class="btn sm ghost" type="button" id="cambiarYo">Cambiar quién soy</button><button class="btn sm ghost" type="button" id="salir">Cerrar sesión</button></div></div></section></div>';
  }

  /* ================= HOJAS ================= */
  function abrirSheet(html, flush, abierta) {
    S.abierta = abierta || null;
    sheet.innerHTML = '<div class="sheet-in' + (flush ? ' flush' : '') + '">' + html + '</div>';
    sheet.hidden = false; document.body.style.overflow = 'hidden';
    var f = sheet.querySelector('input,select,textarea'); if (f && window.matchMedia('(min-width:700px)').matches) f.focus();
  }
  function ponerSheet(html, flush, abierta) {
    if (sheet.hidden) { abrirSheet(html, flush, abierta); return; }
    S.abierta = abierta || null;
    var el = sheet.querySelector('.sheet-in'); var y = el.scrollTop;
    el.className = 'sheet-in' + (flush ? ' flush' : ''); el.innerHTML = html; el.scrollTop = y;
  }
  function cerrarSheet() { sheet.hidden = true; sheet.innerHTML = ''; F = null; P = null; Q = null; R = null; S.abierta = null; document.body.style.overflow = ''; }
  var X = '<button class="x" type="button" data-cerrar="1" aria-label="Cerrar">✕</button>';

  /* ---------- Guía ---------- */
  function guia() {
    var pb = pcts(true), misma = mismaCobertura(), a = absorbe(), tope = Number(S.viaje.tope);
    var otro = pagan().find(function (p) { return !a || p.id !== a.id; });
    var cubs = cubiertas(), nCub = cubs.length;
    var otrosNombres = S.personas.filter(function (p) { return !a || p.id !== a.id; }).map(function (p) { return p.nombre; });
    var h = '<div class="shero ghero">' + leaves('flores') + '<div class="top"><span class="chip-mango">Guía rápida</span>' + X + '</div>' +
      '<h2 id="sheetTitle">Así funcionan nuestras cuentas</h2><div class="sub">Cinco reglas. La app hace las sumas.</div></div><div class="rules">';
    h += '<div class="rule"><div class="h"><span class="n">1</span><div><b>Cada una paga lo suyo</b><span>Tu pasaje, tu cama, tu comida y tus tours.</span></div></div></div>';
    if (nCub) {
      var pTxt = pagan().map(function (p) { return Math.round(pb[p.id] || 0); }).join(' / ');
      h += '<div class="rule"><div class="h"><span class="n">2</span><div><b>' + esc(cap(nombresCub())) + ': ' + pTxt + '</b><span>Lo de ' + (nCub > 1 ? 'ellos' : 'esa persona') + ' lo cubrimos entre ' + (pagan().length === 3 ? 'las tres' : 'todas') + '.</span></div></div>' + splitBar(pb) +
        (misma ? '' : '<span class="small muted">En comidas, tours y traslados es distinto:</span>' + splitBar(pcts(false))) + '</div>';
    }
    if (tope && a) {
      var ej = '';
      if (otro) { var cub = tope * nCub * (pb[otro.id] || 0) / 100; ej = '<div class="ex num"><b>Ejemplo · 1 noche</b><br>' + esc(otro.nombre) + ': ' + fmt(tope) + ' su noche' + (cub > 0 ? ' + ' + fmt(cub) + ' de ' + esc(nombresCub()) : '') + ' = <b>' + fmt(tope + cub) + '</b></div>'; }
      h += '<div class="rule"><div class="h"><span class="n">3</span><div><b>Hospedaje con tope de ' + fmt(tope).replace('.00', '') + '</b><span>' + esc(lista(otrosNombres)) + ' cuentan hasta ' + fmt(tope).replace('.00', '') + ' por noche. ' + esc(a.nombre) + ' pone lo que pase.</span></div></div>' + ej + '</div>';
    }
    h += '<div class="rule"><div class="h"><span class="n">4</span><div><b>Quien paga, lo anota</b><span>Toca el botón amarillo (+). La app dice quién le debe a quién. Cuando se pasen plata, lo marcan como pagado.</span></div></div></div>';
    h += '<div class="rule"><div class="h"><span class="n">5</span><div><b>En Viaje están los códigos</b><span>Vuelos, hospedajes y tours con fecha, hora y código. Guarda la foto de los pases. Y si activas los avisos (en Ajustes), te llega al celular el check-in, la hora de salir y los gastos nuevos.</span></div></div></div>';
    h += '</div><button class="btn block" type="button" data-cerrar="1">Entendido</button>';
    abrirSheet(h, true);
  }

  /* ---------- Registrar gasto/pago ---------- */
  function nuevoF(base) {
    var me = yo(), ps = pagan(), otra = ps.find(function (p) { return !me || p.id !== me.id; });
    return Object.assign({
      id: null, tipo: 'gasto', monto: '', moneda: 'PEN', tc: '', descripcion: '', pagador_id: me ? me.id : (ps[0] && ps[0].id), categoria: 'comidas', fecha: hoy(),
      modo: 'todos', noches: '1', detalle: {}, entre: ps.map(function (p) { return p.id; }), de_id: me ? me.id : (ps[0] && ps[0].id), a_id: otra ? otra.id : '', nota: '', verModos: false
    }, base || {});
  }
  function MODOS() {
    var a = absorbe();
    return [
      ['todos', '👨‍👩‍👧', 'Todos por igual', 'Se divide entre todos. La parte de ' + nombresCub() + ' la cubren las hermanas según sus porcentajes.'],
      ['tope', '🛏️', 'Hospedaje con tope · S/ ' + S.viaje.tope + ' por noche', 'Cada uno cuenta hasta S/ ' + S.viaje.tope + ' por noche; ' + (a ? a.nombre : 'una hermana') + ' pone lo que pase del tope.'],
      ['detalle', '✍️', 'Monto por persona', 'Para cuartos de distinto precio o pasajes de cada quien.'],
      ['cubiertas', '💛', 'Solo para ' + nombresCub(), 'Lo pagan las hermanas según los porcentajes de Personas.'],
      ['entre', '👯', 'Entre algunas personas', 'Se divide por igual solo entre quienes marques.'],
      ['invito', '🎁', 'Invité yo', 'No se divide: lo asume quien pagó.']
    ];
  }
  function lbl(t) { return '<span class="f">' + t + '</span>'; }
  function formHtml() {
    var isP = F.tipo === 'pago', h = '<div class="sheet-head"><h2 id="sheetTitle">' + (F.id ? 'Editar' : isP ? 'Pago entre hermanas' : 'Nuevo gasto') + '</h2>' + X + '</div>';
    if (!F.id) h += '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-ftipo="gasto" aria-pressed="' + !isP + '">Gasto</button><button type="button" data-ftipo="pago" aria-pressed="' + isP + '">Pago entre hermanas</button></div>';
    h += '<form id="fReg" novalidate style="display:flex;flex-direction:column;gap:14px">';
    if (!isP) {
      h += '<div class="amount"><select id="fMoneda" name="moneda" aria-label="Moneda"><option value="PEN"' + (F.moneda === 'PEN' ? ' selected' : '') + '>S/</option><option value="USD"' + (F.moneda === 'USD' ? ' selected' : '') + '>US$</option></select>' +
        '<input id="fMonto" name="monto" inputmode="decimal" placeholder="0.00" value="' + esc(F.monto) + '" aria-label="Monto" autocomplete="off"></div>' +
        (F.moneda === 'USD' ? '<label class="f" for="fTc">Tipo de cambio<input class="in" id="fTc" name="tc" inputmode="decimal" value="' + esc(F.tc || S.viaje.tc) + '"></label>' : '') +
        '<label class="f" for="fDesc">Qué fue<input class="in" id="fDesc" name="descripcion" placeholder="Ej.: cena del cumple de papá" value="' + esc(F.descripcion) + '" autocomplete="off"></label>' +
        '<div class="f">Quién pagó<div class="pick" role="group">' + pagan().map(function (p) { return '<button type="button" data-fpag="' + p.id + '" aria-pressed="' + (F.pagador_id === p.id) + '">' + av(p) + esc(p.nombre) + '</button>'; }).join('') + '</div></div>' +
        '<div class="f">Categoría<div class="pick cats" role="group">' + Object.keys(CATS).map(function (k) { return '<button type="button" data-fcat="' + k + '" aria-pressed="' + (F.categoria === k) + '">' + CATS[k][1] + ' ' + CATS[k][0] + '</button>'; }).join('') + '</div></div>' +
        '<label class="f" for="fFecha">Fecha<input class="in" id="fFecha" name="fecha" type="date" value="' + esc(F.fecha) + '"></label>';
      var ms = MODOS(), sel = ms.find(function (m) { return m[0] === F.modo; }) || ms[0];
      var mostrar = F.verModos ? ms : [sel];
      h += '<div class="f">Cómo se divide<div class="modes" role="group">' + mostrar.map(function (m) {
        return '<button type="button" class="mode" data-fmodo="' + m[0] + '" aria-pressed="' + (F.modo === m[0]) + '"><span class="ic">' + m[1] + '</span><b>' + esc(m[2]) + '</b><span class="desc">' + esc(m[3]) + '</span></button>';
      }).join('') + (F.verModos ? '' : '<button type="button" class="more" data-fvermodos="1">Ver las otras ' + (ms.length - 1) + ' formas ›</button>') + '</div></div>';
      if (F.modo === 'tope') h += '<label class="f" for="fNoches">Noches<input class="in" id="fNoches" name="noches" inputmode="numeric" value="' + esc(F.noches) + '"></label>';
      if (F.modo === 'detalle') h += '<div class="det">' + S.personas.map(function (p) { return '<label class="f" for="fd_' + p.id + '">' + esc(p.nombre) + '<input class="in" id="fd_' + p.id + '" data-fdet="' + p.id + '" inputmode="decimal" placeholder="0.00" value="' + esc(F.detalle[p.id] == null ? '' : F.detalle[p.id]) + '"></label>'; }).join('') + '</div>';
      if (F.modo === 'entre') h += '<div class="pick" role="group" aria-label="Entre quiénes">' + S.personas.map(function (p) { return '<button type="button" data-fentre="' + p.id + '" aria-pressed="' + (F.entre.indexOf(p.id) >= 0) + '">' + av(p) + esc(p.nombre) + '</button>'; }).join('') + '</div>';
      h += '<div class="preview num" id="fPrev" aria-live="polite"></div>';
    } else {
      h += '<div class="amount"><span class="cur">S/</span><input id="fMonto" name="monto" inputmode="decimal" placeholder="0.00" value="' + esc(F.monto) + '" aria-label="Monto" autocomplete="off"></div>' +
        '<div class="row"><label class="f" for="fDe">Quién pasa la plata<select class="in" id="fDe" name="de_id">' + pagan().map(function (p) { return '<option value="' + p.id + '"' + (F.de_id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select></label>' +
        '<label class="f" for="fA">A quién<select class="in" id="fA" name="a_id">' + pagan().map(function (p) { return '<option value="' + p.id + '"' + (F.a_id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="f" for="fFecha">Fecha<input class="in" id="fFecha" name="fecha" type="date" value="' + esc(F.fecha) + '"></label>' +
        '<label class="f" for="fNota">Nota<input class="in" id="fNota" name="nota" placeholder="Ej.: su parte del depa de Lima" value="' + esc(F.nota) + '" autocomplete="off"></label>' +
        '<div id="fPrev" class="warn"></div>';
    }
    h += '<button class="btn block" type="submit" id="fSave">' + (F.id ? 'Guardar cambios' : isP ? 'Guardar pago' : 'Guardar gasto') + '</button></form>';
    return h;
  }
  function borrador() {
    if (F.tipo === 'pago') return { tipo: 'pago', monto: num(F.monto), moneda: 'PEN', de_id: F.de_id, a_id: F.a_id, fecha: F.fecha || hoy(), nota: F.nota.trim() || null };
    var m = { tipo: 'gasto', descripcion: F.descripcion.trim(), monto: num(F.monto), moneda: F.moneda, tc: F.moneda === 'USD' ? (num(F.tc) || Number(S.viaje.tc)) : null, pagador_id: F.pagador_id, categoria: F.categoria, fecha: F.fecha || hoy(), modo: F.modo, noches: null, tope: null, detalle: null, entre: null };
    if (F.modo === 'tope') { m.noches = Math.max(1, Math.round(num(F.noches) || 1)); m.tope = Number(S.viaje.tope); }
    if (F.modo === 'detalle') { m.detalle = {}; S.personas.forEach(function (p) { m.detalle[p.id] = num(F.detalle[p.id]); }); }
    if (F.modo === 'entre') m.entre = F.entre.slice();
    return m;
  }
  function problema(m) {
    if (!(m.monto > 0)) return 'Escribe el monto.';
    if (m.tipo === 'pago') return m.de_id === m.a_id ? 'Elige dos personas distintas.' : '';
    if (!m.descripcion) return 'Escribe qué fue el gasto.';
    if (!m.pagador_id) return 'Elige quién pagó.';
    if (m.modo === 'detalle') { var s = 0; Object.keys(m.detalle).forEach(function (k) { s += m.detalle[k]; }); var d = r2(m.monto - s); if (Math.abs(d) > 0.05) return (d > 0 ? 'Falta repartir ' : 'Te pasaste por ') + (m.moneda === 'USD' ? 'US$ ' : 'S/ ') + Math.abs(d).toFixed(2) + '.'; }
    if (m.modo === 'entre' && !m.entre.length) return 'Marca al menos una persona.';
    return '';
  }
  // Etiquetas de lo "propio" de cada hermana según el modo.
  function propioTxt(m, pid) {
    if (m.modo === 'tope') {
      var a = absorbe(), n = Number(m.noches) || 1;
      if (a && a.id === pid) return 'Su parte y lo que pasa del tope';
      return n === 1 ? 'Su noche (tope)' : 'Sus ' + n + ' noches (tope)';
    }
    if (m.modo === 'invito') return 'Invitó';
    return 'Lo suyo';
  }
  function prev() {
    var el = document.getElementById('fPrev'), btn = document.getElementById('fSave'); if (!el) return;
    var m = borrador(), pr = problema(m);
    btn.disabled = !!pr;
    if (m.tipo === 'pago') { el.textContent = m.monto > 0 ? pr : ''; return; }
    if (!(m.monto > 0)) { el.innerHTML = '<div class="t">Así queda · antes de guardar</div><span class="muted">Escribe el monto para ver cuánto le toca a cada una.</span>'; return; }
    var d = Calc.detalleCarga(Calc.partes(m, S.viaje, S.personas), S.personas, m.categoria);
    el.innerHTML = '<div class="t">Así queda · antes de guardar' + (m.moneda === 'USD' ? ' · total ' + fmt(Calc.enSoles(m, S.viaje)) : '') + '</div>' +
      pagan().map(function (x) {
        var v = d[x.id] || { propio: 0, cubre: 0 }, parts = [];
        if (v.propio > 0.004) parts.push(propioTxt(m, x.id) + ' ' + fmt(v.propio));
        if (v.cubre > 0.004) parts.push(nombresCub() + ' ' + fmt(v.cubre));
        return '<div class="l"><span style="display:flex;align-items:center;gap:8px;min-width:0">' + av(x) + '<span>' + esc(x.nombre) + (parts.length ? '<small>' + esc(parts.join(' + ')) + '</small>' : '') + '</span></span><b>' + fmt(v.propio + v.cubre) + '</b></div>';
      }).join('') + (pr ? '<div class="warn">' + esc(pr) + '</div>' : '');
  }
  function abrirForm(base) { F = nuevoF(base); abrirSheet(formHtml()); prev(); }
  function repintarForm() { ponerSheet(formHtml()); prev(); }
  async function guardarForm() {
    var m = borrador(), pr = problema(m); if (pr) { toast(pr); return; }
    var btn = document.getElementById('fSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    var r = F.id ? await sb.from('movimientos').update(m).eq('id', F.id) : await sb.from('movimientos').insert(Object.assign({ viaje_id: S.viaje.id }, m));
    if (r.error) { btn.disabled = false; btn.textContent = 'Guardar'; toast(errTxt(r.error)); return; }
    var edit = !!F.id; cerrarSheet(); await loadData(); render(); toast(edit ? 'Cambios guardados.' : 'Registrado.');
  }

  /* ---------- Detalle de un movimiento ---------- */
  function verMov(id, confirmar) {
    var m = S.movs.find(function (x) { return x.id === id; }); if (!m) return;
    var autor = S.personas.find(function (p) { return p.user_id && p.user_id === m.creado_por; }), h;
    if (m.tipo === 'pago') {
      h = '<div class="shero">' + leaves('chica') + '<div class="top"><span class="tag">🤝 Pago · ' + esc(fdate(m.fecha)) + '</span>' + X + '</div>' +
        '<h2 id="sheetTitle">' + esc(nom(m.de_id)) + ' le pasó a ' + esc(nom(m.a_id)) + '</h2><div class="amt num">' + fmt(m.monto) + '</div>' + (m.nota ? '<div class="sub">' + esc(m.nota) + '</div>' : '') + '</div>' +
        '<div class="note">Con esto baja lo que ' + esc(nom(m.de_id)) + ' debe y lo que le deben a ' + esc(nom(m.a_id)) + '.</div>';
    } else {
      var p = Calc.partes(m, S.viaje, S.personas), d = Calc.detalleCarga(p, S.personas, m.categoria), cat = CATS[m.categoria] || CATS.otros;
      var totCub = 0; cubiertas().forEach(function (c) { totCub += p[c.id] || 0; });
      h = '<div class="shero">' + leaves('chica') + '<div class="top"><span class="tag">' + cat[1] + ' ' + cat[0] + ' · ' + esc(fdate(m.fecha)) + '</span>' + X + '</div>' +
        '<h2 id="sheetTitle">' + esc(m.descripcion) + '</h2><div class="amt num">' + fmt(Calc.enSoles(m, S.viaje)) + '</div>' +
        '<div class="sub">Pagó ' + esc(nom(m.pagador_id)) + ' · ' + esc(modoTxt(m)) + (m.moneda === 'USD' ? ' · US$ ' + Number(m.monto).toFixed(2) + ' × ' + Number(m.tc || S.viaje.tc).toFixed(2) : '') + '</div></div>' +
        '<h2 class="h2">Cómo se reparte</h2>';
      var ps = pagan().slice().sort(function (a, b) { var A = d[a.id] || {}, B = d[b.id] || {}; return ((A.propio || 0) + (A.cubre || 0)) - ((B.propio || 0) + (B.cubre || 0)); });
      h += ps.map(function (x) {
        var v = d[x.id] || { propio: 0, cubre: 0 }, t = v.propio + v.cubre;
        if (t < 0.005 && (m.modo === 'entre' || m.modo === 'invito')) return '';
        var pc = totCub > 0.004 ? v.cubre / totCub * 100 : 0;
        return '<div class="share num"><div class="h">' + av(x, 30) + '<b>' + esc(x.nombre) + '</b><b>' + fmt(t) + '</b></div>' +
          (v.propio > 0.004 ? '<div class="r"><span>' + esc(propioTxt(m, x.id)) + '</span><span>' + fmt(v.propio) + '</span></div>' : '') +
          (v.cubre > 0.004 ? '<div class="r"><span>' + pctTxt(pc) + ' de ' + esc(nombresCub()) + ' (' + fmt(totCub) + ')</span><span>' + fmt(v.cubre) + '</span></div>' : '') + '</div>';
      }).join('');
      if (totCub > 0.004) h += '<div class="note num">' + esc(lista(cubiertas().filter(function (c) { return p[c.id] > 0.004; }).map(function (c) { return c.nombre + ' cuenta ' + fmt(p[c.id]); }))) + '. Eso se reparte según los porcentajes de Personas.</div>';
    }
    if (autor) h += '<div class="muted small">Registrado por ' + esc(autor.nombre) + '</div>';
    h += confirmar
      ? '<div class="card"><b>¿Borrar este movimiento?</b><span class="muted small">Se recalculan los saldos de todas.</span><div class="actions"><button class="btn danger" type="button" data-borrarok="' + m.id + '">Sí, borrar</button><button class="btn ghost" type="button" data-ver="' + m.id + '">No</button></div></div>'
      : '<div class="actions"><button class="btn" type="button" data-editar="' + m.id + '">Editar</button><button class="btn ghost" type="button" data-borrar="' + m.id + '">Borrar</button></div>';
    ponerSheet(h, true, { k: 'mov', id: m.id });
  }

  /* ---------- Persona: resumen ---------- */
  function verPersona(id) {
    var p = per(id); if (!p) return;
    var o = Calc.saldos(S.viaje, S.personas, S.movs), x = o[id] || { pago: 0, toca: 0, propio: 0, cubre: 0, env: 0, rec: 0, net: 0 }, n = r2(x.net);
    var h = '<div class="sheet-head"><div style="display:flex;align-items:center;gap:10px">' + av(p, 40) + '<h2 id="sheetTitle">' + esc(p.nombre) + '</h2></div>' + X + '</div>' +
      '<div class="card"><dl class="kv num"><dt>Pagó</dt><dd>' + fmt(x.pago) + '</dd><dt>Le toca</dt><dd>− ' + fmt(x.toca) + '</dd>' +
      '<dt class="sub">Lo suyo</dt><dd class="sub">' + fmt(x.propio) + '</dd>' +
      (x.cubre > 0.004 ? '<dt class="sub">Por ' + esc(nombresCub()) + '</dt><dd class="sub">' + fmt(x.cubre) + '</dd>' : '') +
      (x.env > 0.004 ? '<dt>Pasó a hermanas</dt><dd>+ ' + fmt(x.env) + '</dd>' : '') + (x.rec > 0.004 ? '<dt>Recibió</dt><dd>− ' + fmt(x.rec) + '</dd>' : '') +
      '<dt><b>' + (n > 0.009 ? 'Le deben' : n < -0.009 ? 'Debe' : 'A mano') + '</b></dt><dd><b class="' + (n > 0.009 ? 'good' : n < -0.009 ? 'bad' : '') + '">' + fmt(Math.abs(n)) + '</b></dd></dl></div>' +
      '<div class="actions"><button class="btn" type="button" data-hist="' + p.id + '">Ver sus movimientos</button><button class="btn ghost" type="button" data-editp="' + p.id + '">Editar</button></div>';
    ponerSheet(h);
  }

  /* ---------- Persona: editar ---------- */
  function editarPersona(id, confirmar) {
    var base = id === 'nueva' ? null : per(id);
    if (!P || P.id !== (base ? base.id : 'nueva')) P = base ? JSON.parse(JSON.stringify(base)) : { id: 'nueva', nombre: '', tipo: 'paga', color: COLORS[S.personas.length % COLORS.length], cobertura: {} };
    var h = '<div class="sheet-head"><h2 id="sheetTitle">' + (base ? 'Editar persona' : 'Agregar persona') + '</h2>' + X + '</div>' +
      '<form id="fPer" novalidate style="display:flex;flex-direction:column;gap:14px">' +
      '<label class="f" for="pNombre">Nombre<input class="in" id="pNombre" value="' + esc(P.nombre) + '" autocomplete="off"></label>' +
      '<div class="f">Color<div class="colors" role="group">' + COLORS.map(function (c) { return '<button type="button" data-pcolor="' + c + '" style="--c:' + c + '" aria-pressed="' + (P.color === c) + '" aria-label="Color ' + c + '"></button>'; }).join('') + '</div></div>' +
      '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-ptipo="paga" aria-pressed="' + (P.tipo === 'paga') + '">Paga su parte</button><button type="button" data-ptipo="cubierta" aria-pressed="' + (P.tipo === 'cubierta') + '">La cubren otras</button></div>' +
      (P.tipo === 'cubierta' ? '<div class="note">Quién la cubre se cambia en Personas → <b>Cambiar porcentajes</b>.</div>' : '') +
      '<button class="btn block" type="submit">Guardar</button>';
    if (base) h += confirmar
      ? '<div class="card"><b>¿Eliminar a ' + esc(base.nombre) + '?</b><span class="muted small">Solo se puede si no tiene movimientos.</span><div class="actions"><button class="btn danger" type="button" data-pdelok="' + base.id + '">Sí, eliminar</button><button class="btn ghost" type="button" data-pdelno="' + base.id + '">No</button></div></div>'
      : '<button class="btn ghost block" type="button" data-pdel="' + base.id + '">Eliminar persona</button>';
    h += '</form>';
    ponerSheet(h);
  }
  async function guardarPersona() {
    P.nombre = document.getElementById('pNombre').value.trim();
    if (!P.nombre) { toast('Escribe el nombre.'); return; }
    var row = { nombre: P.nombre, tipo: P.tipo, color: P.color };
    if (P.tipo === 'cubierta' && !Object.keys(P.cobertura || {}).length) {
      var otra = cubiertas().find(function (c) { return c.id !== P.id; });
      if (otra) { row.cobertura = otra.cobertura || {}; row.cobertura_otros = otra.cobertura_otros || {}; }
      else { var ps = pagan().filter(function (x) { return x.id !== P.id; }), cob = {}; ps.forEach(function (x) { cob[x.id] = r2(100 / ps.length); }); row.cobertura = cob; }
    }
    var r = P.id === 'nueva' ? await sb.from('personas').insert(Object.assign({ viaje_id: S.viaje.id, orden: S.personas.length + 1 }, row)) : await sb.from('personas').update(row).eq('id', P.id);
    if (r.error) { toast(errTxt(r.error)); return; }
    cerrarSheet(); await loadData(); render(); toast('Guardado.');
  }

  /* ---------- Porcentajes de mamá y papá ---------- */
  function abrirPct() {
    var c = cubiertas()[0]; if (!c) return;
    var b = {}, o = {}, pb = pcts(true), po = pcts(false);
    pagan().forEach(function (p) { b[p.id] = String(Math.round((pb[p.id] || 0) * 100) / 100); o[p.id] = String(Math.round((po[p.id] || 0) * 100) / 100); });
    Q = { b: b, o: o, igual: mismaCobertura() };
    pintarPct();
  }
  function sumaQ(m) { var s = 0; Object.keys(m).forEach(function (k) { s += num(m[k]); }); return Math.round(s * 100) / 100; }
  function grupoPct(key, titulo) {
    var m = Q[key], s = sumaQ(m), ok = Math.abs(s - 100) < 0.01;
    return '<div class="card"><b>' + titulo + '</b>' + pagan().map(function (x) {
      return '<label class="cov" for="q' + key + x.id + '"><span style="display:flex;align-items:center;gap:8px">' + av(x) + esc(x.nombre) + '</span><input class="in num" id="q' + key + x.id + '" data-q="' + key + '|' + x.id + '" inputmode="decimal" value="' + esc(m[x.id]) + '" aria-label="Porcentaje de ' + esc(x.nombre) + '"></label>';
    }).join('') + '<div class="small ' + (ok ? 'muted' : 'warn') + '" id="qsum' + key + '">Suma: ' + s + '% ' + (ok ? '✓' : '(debe ser 100%)') + '</div></div>';
  }
  function pintarPct() {
    var h = '<div class="sheet-head"><h2 id="sheetTitle">Quién cubre a ' + esc(nombresCub()) + '</h2>' + X + '</div>' +
      '<p class="muted small" style="margin:0">Cada número es el porcentaje de la parte de ' + esc(nombresCub()) + ' que pone cada hermana. Se recalculan todos los gastos.</p>' +
      grupoPct('b', Q.igual ? 'Todo el viaje (%)' : 'Pasajes y hospedaje (%)') +
      '<button class="switch" type="button" role="switch" aria-checked="' + Q.igual + '" data-qigual="1"><span>Comidas, tours y traslados con los mismos porcentajes</span><span class="sw"></span></button>' +
      (Q.igual ? '' : grupoPct('o', 'Comidas, tours y traslados (%)')) +
      '<button class="btn block" type="button" data-qsave="1">Guardar porcentajes</button>';
    ponerSheet(h);
  }
  async function guardarPct() {
    function limpio(m) { var o = {}; Object.keys(m).forEach(function (k) { var v = num(m[k]); if (v > 0) o[k] = v; }); return o; }
    if (Math.abs(sumaQ(Q.b) - 100) > 0.01 || (!Q.igual && Math.abs(sumaQ(Q.o) - 100) > 0.01)) { toast('Los porcentajes deben sumar 100%.'); return; }
    var row = { cobertura: limpio(Q.b), cobertura_otros: Q.igual ? {} : limpio(Q.o) };
    var ids = cubiertas().map(function (c) { return c.id; });
    var r = await sb.from('personas').update(row).in('id', ids);
    if (r.error) { toast(errTxt(r.error)); return; }
    cerrarSheet(); await loadData(); render(); toast('Porcentajes guardados. Saldos recalculados.');
  }

  /* ---------- Reserva: ver ---------- */
  function verRes(id) {
    var r = S.reservas.find(function (x) { return x.id === id; }); if (!r) return;
    var t = TIPOS[r.tipo] || TIPOS.otro, cs = r.codigos || [];
    var h = '<div class="shero">' + leaves() + '<div class="top"><span class="tag">' + t[1] + ' ' + t[0] + ' · ' + esc(fdayC(r.fecha)) + '</span>' + X + '</div>';
    if (r.tipo === 'vuelo' && (r.origen || r.destino)) {
      h += '<div class="route"><div><b>' + esc((r.origen || '—').toUpperCase()) + '</b><span>' + esc(hhmm(r.hora) || ' ') + '</span></div>' +
        '<svg viewBox="0 0 90 24" fill="none" stroke="#F2A93B" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12h86" stroke-dasharray="4 5"/><path d="M80 6l8 6-8 6"/></svg>' +
        '<div><b>' + esc((r.destino || '—').toUpperCase()) + '</b><span>' + esc(hhmm(r.hora_fin) || ' ') + '</span></div></div>' +
        '<h2 id="sheetTitle" style="font-size:18px">' + esc(r.titulo) + ' · ' + esc(rutaTxt(r)) + '</h2>';
    } else {
      h += '<h2 id="sheetTitle">' + esc(r.titulo) + '</h2>';
      var cuando = [r.hora ? hhmm(r.hora) : '', r.fecha_fin && r.fecha_fin !== r.fecha ? 'hasta el ' + fday(r.fecha_fin) : '', r.lugar].filter(Boolean).join(' · ');
      if (cuando) h += '<div class="sub">' + esc(cuando) + '</div>';
    }
    h += '<div class="sub">' + esc([quienesTxt(r.quienes), r.nota].filter(Boolean).join(' · ')) + '</div></div>';

    h += '<div class="card">' + (cs.length ? cs.map(function (c, i) {
      return '<div class="codebox"><div class="c"><span>Código de reserva' + (c.quien ? ' · ' + esc(c.quien) : cs.length > 1 ? ' ' + (i + 1) : '') + '</span><b>' + esc(c.codigo) + '</b></div><button class="btn sm soft" type="button" data-copy="' + esc(c.codigo) + '">Copiar</button></div>';
    }).join('') : '<span class="muted">Sin código todavía. Agrégalo con <b>Editar</b>.</span>') + '</div>';

    h += '<div class="card"><b style="font-family:var(--display);font-size:16px">Recordatorios</b>' +
      (r.checkin_requerido ? '<button class="switch" type="button" role="switch" aria-checked="' + !!r.recordar_checkin + '" data-rsw="' + r.id + '"><span>Avisar el check-in · 1 día antes</span><span class="sw"></span></button>' : '') +
      '<label class="cov" for="rsal"><span>Salir ' + (r.tipo === 'vuelo' ? 'al aeropuerto' : 'hacia allá') + ' a las</span><input class="in" id="rsal" type="time" data-rsal="' + r.id + '" value="' + esc(hhmm(r.hora_salida)) + '"></label>' +
      '<span class="muted xs">Te llegan como notificación al celular si activaste los avisos en Ajustes.</span></div>';

    var fs = S.fotos.filter(function (f) { return f.reserva_id === r.id; }), me = yo();
    h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-family:var(--display);font-size:16px">Pases y fotos</b><span class="muted small">' + fs.length + (fs.length === 1 ? ' archivo' : ' archivos') + '</span></div>' +
      '<div class="photos" id="fotosGrid">' + fotosHtml(fs) + '</div>' +
      '<div class="row" style="align-items:flex-end"><label class="f" for="rDe" style="flex:0 0 40%">De quién<select class="in" id="rDe">' + S.personas.map(function (p) { return '<option value="' + p.id + '"' + (me && me.id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '<option value="">Todos</option></select></label>' +
      '<label class="dashed" style="display:grid;place-items:center;cursor:pointer;flex:1">+ Subir foto<input type="file" accept="image/*,application/pdf" data-rfile="' + r.id + '" hidden></label></div></div>';

    if (r.checkin_requerido) h += r.checkin_hecho
      ? '<button class="btn soft block" type="button" data-rck="' + r.id + '|0">' + ICON.check.replace('<svg', '<svg width="20" height="20"') + 'Check-in hecho · deshacer</button>'
      : '<button class="btn block" type="button" data-rck="' + r.id + '|1">Marcar check-in hecho</button>';
    h += '<div class="actions"><button class="btn ghost" type="button" data-redit="' + r.id + '">Editar</button><button class="btn ghost" type="button" data-rdel="' + r.id + '">Borrar</button></div>';
    ponerSheet(h, true, { k: 'res', id: r.id });
    firmar(fs);
  }
  function fotosHtml(fs) {
    if (!fs.length) return '<div class="photo" style="grid-column:1/-1;aspect-ratio:auto;min-height:70px;align-items:center;justify-content:center"><span class="muted small" style="padding:12px;text-align:center">Aún no hay fotos. Sube la tarjeta de embarque o la confirmación.</span></div>';
    return fs.map(function (f) {
      var u = S.urls[f.path] && S.urls[f.path].u, pdf = /\.pdf$/i.test(f.path), quien = f.persona_id ? nom(f.persona_id) : 'Todos';
      return '<div class="photo">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" aria-label="Abrir foto de ' + esc(quien) + '">' + (pdf ? '<span class="pdf">PDF</span>' : '<img src="' + esc(u) + '" alt="" loading="lazy">') + '</a>' : '') +
        '<span class="lbl">' + esc(quien) + '</span><button class="del" type="button" data-fdel="' + f.id + '" aria-label="Borrar foto">✕</button></div>';
    }).join('');
  }
  async function firmar(fs) {
    var ahora = Date.now(), falta = fs.filter(function (f) { var c = S.urls[f.path]; return !c || c.t < ahora; }).map(function (f) { return f.path; });
    if (!falta.length) return;
    var r = await sb.storage.from('fotos').createSignedUrls(falta, 3600);
    if (r.error || !r.data) return;
    r.data.forEach(function (x) { if (x.signedUrl) S.urls[x.path] = { u: x.signedUrl, t: ahora + 50 * 60 * 1000 }; });
    var g = document.getElementById('fotosGrid');
    if (g && S.abierta && S.abierta.k === 'res') g.innerHTML = fotosHtml(S.fotos.filter(function (f) { return f.reserva_id === S.abierta.id; }));
  }
  function achicar(file) {
    return new Promise(function (ok) {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 900000) { ok(file); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1800, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(file); };
      img.src = url;
    });
  }
  async function subirFoto(file, resId, personaId) {
    if (!file) return;
    toast('Subiendo foto…');
    var blob = await achicar(file), type = blob.type || file.type || 'image/jpeg';
    var ext = /pdf/.test(type) ? '.pdf' : /png/.test(type) ? '.png' : /webp/.test(type) ? '.webp' : /hei[cf]/.test(type) ? '.heic' : '.jpg';
    var path = S.viaje.id + '/' + resId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + ext;
    var up = await sb.storage.from('fotos').upload(path, blob, { contentType: type, upsert: false });
    if (up.error) { toast(errTxt(up.error)); return; }
    var ins = await sb.from('reserva_fotos').insert({ viaje_id: S.viaje.id, reserva_id: resId, persona_id: personaId || null, path: path });
    if (ins.error) { await sb.storage.from('fotos').remove([path]); toast(errTxt(ins.error)); return; }
    await loadData(); render(); verRes(resId); toast('Foto guardada.');
  }

  /* ---------- Reserva: formulario ---------- */
  function nuevoR(base) {
    return Object.assign({ id: null, tipo: 'vuelo', titulo: '', fecha: hoy(), hora: '', fecha_fin: '', hora_fin: '', origen: '', destino: '', lugar: '', codigos: '', quienes: S.personas.map(function (p) { return p.id; }), checkin_requerido: true, nota: '' }, base || {});
  }
  function resFormHtml() {
    var t = R.tipo;
    var h = '<div class="sheet-head"><h2 id="sheetTitle">' + (R.id ? 'Editar' : 'Agregar al viaje') + '</h2>' + X + '</div>' +
      '<div class="seg" role="group" aria-label="Tipo">' + Object.keys(TIPOS).map(function (k) { return '<button type="button" data-rtipo="' + k + '" aria-pressed="' + (t === k) + '">' + TIPOS[k][1] + ' ' + TIPOS[k][0] + '</button>'; }).join('') + '</div>' +
      '<form id="fRes" novalidate style="display:flex;flex-direction:column;gap:14px">' +
      '<label class="f" for="rTit">' + (t === 'vuelo' ? 'Aerolínea y número de vuelo' : t === 'hospedaje' ? 'Nombre del hospedaje' : t === 'tour' ? 'Nombre del tour' : 'Qué es') +
      '<input class="in" id="rTit" data-r="titulo" value="' + esc(R.titulo) + '" placeholder="' + (t === 'vuelo' ? 'Ej.: LATAM LA2345' : t === 'hospedaje' ? 'Ej.: Gran Chanewasi' : t === 'tour' ? 'Ej.: Catarata de Gocta' : 'Ej.: Cena del cumple de papá') + '" autocomplete="off"></label>' +
      '<div class="row"><label class="f" for="rFecha">' + (t === 'hospedaje' ? 'Llegada' : 'Fecha') + '<input class="in" id="rFecha" type="date" data-r="fecha" value="' + esc(R.fecha) + '"></label>' +
      '<label class="f" for="rHora">' + (t === 'vuelo' ? 'Sale' : t === 'hospedaje' ? 'Hora de check-in' : 'Hora') + '<input class="in" id="rHora" type="time" data-r="hora" value="' + esc(R.hora) + '"></label></div>';
    if (t === 'vuelo') h += '<div class="row"><label class="f" for="rOri">Desde<input class="in" id="rOri" data-r="origen" value="' + esc(R.origen) + '" placeholder="LIM" autocapitalize="characters" autocomplete="off"></label>' +
      '<label class="f" for="rDes">Hasta<input class="in" id="rDes" data-r="destino" value="' + esc(R.destino) + '" placeholder="TPP" autocapitalize="characters" autocomplete="off"></label>' +
      '<label class="f" for="rHf">Llega<input class="in" id="rHf" type="time" data-r="hora_fin" value="' + esc(R.hora_fin) + '"></label></div>';
    if (t === 'hospedaje') h += '<label class="f" for="rFf">Salida<input class="in" id="rFf" type="date" data-r="fecha_fin" value="' + esc(R.fecha_fin) + '"></label>';
    if (t !== 'vuelo') h += '<label class="f" for="rLug">Lugar<input class="in" id="rLug" data-r="lugar" value="' + esc(R.lugar) + '" placeholder="Ej.: Tarapoto" autocomplete="off"></label>';
    h += '<label class="f" for="rCod">Códigos de reserva<input class="in" id="rCod" data-r="codigos" value="' + esc(R.codigos) + '" placeholder="Ej.: MOGMBJ" autocapitalize="characters" autocomplete="off"><span class="xs muted" style="font-weight:400">Si hay varios, sepáralos con coma.</span></label>' +
      '<div class="f">Quiénes van<div class="pick" role="group">' + S.personas.map(function (p) { return '<button type="button" data-rq="' + p.id + '" aria-pressed="' + (R.quienes.indexOf(p.id) >= 0) + '">' + av(p) + esc(p.nombre) + '</button>'; }).join('') + '</div></div>' +
      '<button class="switch" type="button" role="switch" aria-checked="' + !!R.checkin_requerido + '" data-rckreq="1"><span>' + (t === 'vuelo' ? 'Hay que hacer check-in online' : 'Hay que confirmar o hacer check-in') + '</span><span class="sw"></span></button>' +
      '<label class="f" for="rNota">Nota<input class="in" id="rNota" data-r="nota" value="' + esc(R.nota) + '" placeholder="Ej.: llegar 3 h antes, incluye desayuno" autocomplete="off"></label>' +
      '<button class="btn block" type="submit">' + (R.id ? 'Guardar cambios' : 'Agregar') + '</button></form>';
    return h;
  }
  function abrirRes(base) { R = nuevoR(base); ponerSheet(resFormHtml()); }
  async function guardarRes() {
    if (!R.titulo.trim()) { toast('Escribe qué es (por ejemplo, la aerolínea y el vuelo).'); return; }
    if (!R.fecha) { toast('Elige la fecha.'); return; }
    var codigos = R.codigos.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (c) { return { codigo: c.toUpperCase() }; });
    var vuelo = R.tipo === 'vuelo', hosp = R.tipo === 'hospedaje';
    var row = { tipo: R.tipo, titulo: R.titulo.trim(), fecha: R.fecha, hora: R.hora || null, fecha_fin: hosp ? (R.fecha_fin || null) : null, hora_fin: vuelo ? (R.hora_fin || null) : null,
      origen: vuelo ? (R.origen.trim().toUpperCase() || null) : null, destino: vuelo ? (R.destino.trim().toUpperCase() || null) : null, lugar: vuelo ? null : (R.lugar.trim() || null),
      codigos: codigos, quienes: R.quienes.slice(), checkin_requerido: !!R.checkin_requerido, nota: R.nota.trim() || null };
    if (row.fecha_fin && row.fecha_fin < row.fecha) { toast('La salida no puede ser antes de la llegada.'); return; }
    var res = R.id ? await sb.from('reservas').update(row).eq('id', R.id).select().single() : await sb.from('reservas').insert(Object.assign({ viaje_id: S.viaje.id }, row)).select().single();
    if (res.error) { toast(errTxt(res.error)); return; }
    var id = res.data.id, edit = !!R.id; R = null;
    await loadData(); S.tab = 'viaje'; render(); verRes(id); toast(edit ? 'Cambios guardados.' : 'Agregado al viaje.');
  }
  async function actualizarRes(id, cambios, msg) {
    var r = await sb.from('reservas').update(cambios).eq('id', id);
    if (r.error) { toast(errTxt(r.error)); return; }
    await loadData(); refrescar(); if (msg) toast(msg);
  }

  /* ================= EVENTOS ================= */
  document.addEventListener('click', async function (e) {
    var inSheet = sheet.contains(e.target);
    if (!inSheet && !e.target.closest('.shell')) return;
    if (e.target === sheet) { cerrarSheet(); return; }
    var b = e.target.closest('button'); if (!b) return; var d = b.dataset;

    if (d.cerrar) { cerrarSheet(); return; }
    if (d.guia) { guia(); return; }
    if (d.pushon) { activarPush(b); return; }
    if (d.pushoff) { desactivarPush(); return; }
    if (d.pushprueba) { probarPush(false); return; }
    if (d.pushoculto) { store('pushOculto', '1'); render(); return; }
    if (d.go) { cerrarSheet(); S.tab = d.go; render(); window.scrollTo(0, 0); return; }
    if (d.nuevo) { abrirForm(); return; }
    if (d.filtro) { S.filtro = (S.filtro === d.filtro && d.filtro.indexOf('p:') === 0) ? 'todos' : d.filtro; document.getElementById('main').innerHTML = vista(); return; }
    if (d.ver) { verMov(d.ver); return; }
    if (d.liq) { var q = d.liq.split('|'); abrirForm({ tipo: 'pago', de_id: q[0], a_id: q[1], monto: q[2], nota: 'Para quedar a mano' }); return; }
    if (d.hist) { cerrarSheet(); S.tab = 'movs'; S.filtro = 'p:' + d.hist; render(); window.scrollTo(0, 0); return; }
    if (d.pver) { verPersona(d.pver); return; }
    if (d.editp) { P = null; editarPersona(d.editp); return; }
    if (d.pct) { abrirPct(); return; }
    if (d.res) { verRes(d.res); return; }
    if (d.nres) { abrirRes(); return; }
    if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast('Código ' + d.copy + ' copiado.'); } catch (er) { toast('Código: ' + d.copy); } return; }
    if (b.id === 'copyCode') {
      var txt = '¡Únete a las cuentas del viaje! Entra a ' + location.origin + location.pathname + ' , crea tu cuenta y escribe el código ' + S.viaje.codigo;
      try { await navigator.clipboard.writeText(txt); toast('Invitación copiada. Pégala en WhatsApp.'); } catch (err) { toast('Copia el código: ' + S.viaje.codigo); }
      return;
    }
    if (b.id === 'cambiarYo') { whoView(); return; }
    if (b.id === 'salir') { await sb.auth.signOut(); return; }

    // gasto/pago
    if (F) {
      if (d.ftipo) { F.tipo = d.ftipo; repintarForm(); return; }
      if (d.fpag) { F.pagador_id = d.fpag; sheet.querySelectorAll('[data-fpag]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); prev(); return; }
      if (d.fcat) { F.categoria = d.fcat; sheet.querySelectorAll('[data-fcat]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); if (d.fcat === 'hospedaje' && F.modo === 'todos' && !F.id) { F.modo = 'tope'; repintarForm(); } else prev(); return; }
      if (d.fvermodos) { F.verModos = true; repintarForm(); return; }
      if (d.fmodo) { F.modo = d.fmodo; F.verModos = false; repintarForm(); return; }
      if (d.fentre) { var i = F.entre.indexOf(d.fentre); if (i >= 0) F.entre.splice(i, 1); else F.entre.push(d.fentre); b.setAttribute('aria-pressed', i < 0); prev(); return; }
    }
    if (d.editar) {
      var m = S.movs.find(function (x) { return x.id === d.editar; }); if (!m) return;
      var det = {}; if (m.detalle) Object.keys(m.detalle).forEach(function (k) { det[k] = String(m.detalle[k]); });
      F = nuevoF({ id: m.id, tipo: m.tipo, monto: String(m.monto), moneda: m.moneda || 'PEN', tc: m.tc ? String(m.tc) : '', descripcion: m.descripcion || '', pagador_id: m.pagador_id, categoria: m.categoria || 'otros', fecha: m.fecha, modo: m.modo || 'todos', noches: String(m.noches || 1), detalle: det, entre: (m.entre || []).slice(), de_id: m.de_id, a_id: m.a_id, nota: m.nota || '' });
      S.abierta = null; repintarForm(); return;
    }
    if (d.borrar) { verMov(d.borrar, true); return; }
    if (d.borrarok) { var r = await sb.from('movimientos').delete().eq('id', d.borrarok); if (r.error) { toast(errTxt(r.error)); return; } cerrarSheet(); await loadData(); render(); toast('Borrado.'); return; }

    // personas
    if (P) {
      if (d.pcolor) { P.color = d.pcolor; sheet.querySelectorAll('[data-pcolor]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); return; }
      if (d.ptipo) { P.nombre = document.getElementById('pNombre').value; P.tipo = d.ptipo; editarPersona(P.id); return; }
      if (d.pdel) { P.nombre = document.getElementById('pNombre').value; editarPersona(d.pdel, true); return; }
      if (d.pdelno) { editarPersona(d.pdelno); return; }
      if (d.pdelok) { var r2_ = await sb.from('personas').delete().eq('id', d.pdelok); if (r2_.error) { toast(errTxt(r2_.error)); return; } cerrarSheet(); await loadData(); render(); toast('Persona eliminada.'); return; }
    }
    // porcentajes
    if (Q) {
      if (d.qigual) { Q.igual = !Q.igual; if (!Q.igual) Q.o = Object.assign({}, Q.b); pintarPct(); return; }
      if (d.qsave) { guardarPct(); return; }
    }
    // reservas
    if (R) {
      if (d.rtipo) { R.tipo = d.rtipo; if (!R.id) R.checkin_requerido = d.rtipo === 'vuelo'; ponerSheet(resFormHtml()); return; }
      if (d.rq) { var j = R.quienes.indexOf(d.rq); if (j >= 0) R.quienes.splice(j, 1); else R.quienes.push(d.rq); b.setAttribute('aria-pressed', j < 0); return; }
      if (d.rckreq) { R.checkin_requerido = !R.checkin_requerido; b.setAttribute('aria-checked', R.checkin_requerido); return; }
    }
    if (d.rsw) { var rs = S.reservas.find(function (x) { return x.id === d.rsw; }); if (rs) actualizarRes(rs.id, { recordar_checkin: !rs.recordar_checkin }, rs.recordar_checkin ? 'Aviso apagado.' : 'Te avisamos 1 día antes.'); return; }
    if (d.rck) { var ck = d.rck.split('|'); actualizarRes(ck[0], { checkin_hecho: ck[1] === '1' }, ck[1] === '1' ? '¡Check-in hecho! ✈️' : 'Marcado como pendiente.'); return; }
    if (d.redit) {
      var re = S.reservas.find(function (x) { return x.id === d.redit; }); if (!re) return;
      S.abierta = null;
      abrirRes({ id: re.id, tipo: re.tipo, titulo: re.titulo, fecha: re.fecha, hora: hhmm(re.hora), fecha_fin: re.fecha_fin || '', hora_fin: hhmm(re.hora_fin), origen: re.origen || '', destino: re.destino || '', lugar: re.lugar || '', codigos: codigosDe(re).join(', '), quienes: (re.quienes || []).slice(), checkin_requerido: re.checkin_requerido, nota: re.nota || '' });
      return;
    }
    if (d.rdel) {
      if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez'; b.classList.add('danger'); b.classList.remove('ghost'); return; }
      var paths = S.fotos.filter(function (f) { return f.reserva_id === d.rdel; }).map(function (f) { return f.path; });
      var del = await sb.from('reservas').delete().eq('id', d.rdel);
      if (del.error) { toast(errTxt(del.error)); return; }
      if (paths.length) await sb.storage.from('fotos').remove(paths);
      cerrarSheet(); await loadData(); render(); toast('Borrado de la agenda.'); return;
    }
    if (d.fdel) {
      var f = S.fotos.find(function (x) { return x.id === d.fdel; }); if (!f) return;
      if (!window.confirm('¿Borrar esta foto?')) return;
      var fd = await sb.from('reserva_fotos').delete().eq('id', f.id);
      if (fd.error) { toast(errTxt(fd.error)); return; }
      await sb.storage.from('fotos').remove([f.path]);
      await loadData(); refrescar(); toast('Foto borrada.'); return;
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { S.q = t.value; var ml = document.getElementById('movList'); if (ml) ml.innerHTML = listaMovs(); return; }
    if (!sheet.contains(t)) return;
    if (F) {
      if (t.dataset.fdet) { F.detalle[t.dataset.fdet] = t.value; prev(); return; }
      if (t.name && t.name in F) { F[t.name] = t.value; if (t.name === 'moneda') { repintarForm(); return; } prev(); }
      return;
    }
    if (Q && t.dataset.q) {
      var k = t.dataset.q.split('|'); Q[k[0]][k[1]] = t.value;
      var s = sumaQ(Q[k[0]]), ok = Math.abs(s - 100) < 0.01, el = document.getElementById('qsum' + k[0]);
      el.className = 'small ' + (ok ? 'muted' : 'warn'); el.textContent = 'Suma: ' + s + '% ' + (ok ? '✓' : '(debe ser 100%)');
      return;
    }
    if (R && t.dataset.r) { R[t.dataset.r] = t.value; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.rfile) { var file = t.files && t.files[0], de = document.getElementById('rDe'); subirFoto(file, t.dataset.rfile, de ? de.value : null); t.value = ''; return; }
    if (t.dataset.rsal) { actualizarRes(t.dataset.rsal, { hora_salida: t.value || null }, t.value ? 'Hora de salida guardada.' : 'Hora de salida borrada.'); }
  });
  document.addEventListener('submit', async function (e) {
    var id = e.target.id;
    if (id === 'cfg') {
      e.preventDefault();
      var row = { nombre: document.getElementById('cNombre').value.trim() || S.viaje.nombre, tope: num(document.getElementById('cTope').value) || S.viaje.tope, tc: num(document.getElementById('cTc').value) || S.viaje.tc, absorbe_tope: document.getElementById('cAbs').value || null };
      var r = await sb.from('viajes').update(row).eq('id', S.viaje.id);
      if (r.error) { toast(errTxt(r.error)); return; }
      await loadData(); render(); toast('Reglas guardadas.');
      return;
    }
    if (id === 'fReg') { e.preventDefault(); guardarForm(); }
    if (id === 'fPer') { e.preventDefault(); guardarPersona(); }
    if (id === 'fRes') { e.preventDefault(); guardarRes(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) cerrarSheet(); });

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') { authView('nueva'); return; }
    if (ev === 'SIGNED_OUT') { if (S.channel) sb.removeChannel(S.channel); S = estado0(); cerrarSheet(); authView('entrar'); return; }
    if (ev === 'SIGNED_IN' && !document.querySelector('.shell') && !document.getElementById('joinForm')) { setTimeout(boot, 0); }
  });
  boot();
})();
