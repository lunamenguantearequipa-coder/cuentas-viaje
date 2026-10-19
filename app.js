(function () {
  'use strict';
  var sb = window.supabase.createClient(window.CONFIG.supabaseUrl, window.CONFIG.supabaseKey);
  var app = document.getElementById('app');
  var sheet = document.getElementById('sheet');

  var CATS = {
    pasajes: ['Pasajes', '✈️'], hospedaje: ['Hospedaje', '🏡'], traslados: ['Traslados', '🚐'],
    tours: ['Tours', '🧭'], comidas: ['Comidas', '🍽️'], otros: ['Otros', '🧾']
  };
  var COLORS = ['#C2541C', '#6A3FC4', '#0F7A93', '#9A6B12', '#3E6B2C', '#B4235A', '#2F5BB7', '#5B6470'];

  var S = { session: null, user: null, viaje: null, viajes: [], personas: [], movs: [], tab: 'resumen', filtro: 'todos', q: '', channel: null };
  var F = null; // formulario de registro abierto

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { var v = Math.round((Number(n) || 0) * 100) / 100; if (Object.is(v, -0)) v = 0; return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(v) { if (v == null) return 0; var s = String(v).trim().replace(/\s/g, ''); if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/,/g, ''); else s = s.replace(',', '.'); var n = parseFloat(s); return isFinite(n) ? n : 0; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function fdate(s) { if (!s) return ''; var p = s.split('-'); return (+p[2]) + ' ' + MESES[+p[1] - 1]; }
  function fday(s) { if (!s) return ''; var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return DIAS[d.getDay()] + ' ' + (+p[2]) + ' de ' + MESES[+p[1] - 1]; }
  function toast(t) { var x = document.getElementById('toast'); x.textContent = t; x.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { x.hidden = true; }, 3800); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function errTxt(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Falta confirmar tu correo: revisa tu bandeja (y spam) y abre el enlace.';
    if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
    if (/at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
    if (/violates foreign key/i.test(m)) return 'No se puede borrar: tiene movimientos registrados.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
    return m || 'Algo salió mal. Inténtalo otra vez.';
  }
  function pagan() { return S.personas.filter(function (p) { return p.tipo === 'paga'; }); }
  function cubiertas() { return S.personas.filter(function (p) { return p.tipo === 'cubierta'; }); }
  function per(id) { return S.personas.find(function (p) { return p.id === id; }); }
  function nom(id) { var p = per(id); return p ? p.nombre : '—'; }
  function yo() { return S.personas.find(function (p) { return p.user_id && S.user && p.user_id === S.user.id; }); }
  function av(p, size) { if (!p) return ''; return '<span class="avatar" style="--c:' + esc(p.color) + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '" aria-hidden="true">' + esc((p.nombre || '?').trim().charAt(0).toUpperCase()) + '</span>'; }
  function absorbe() { return per(S.viaje && S.viaje.absorbe_tope) || pagan()[0]; }
  function nombresCub() { var c = cubiertas(); return c.length ? c.map(function (p) { return p.nombre.toLowerCase(); }).join(' y ') : 'las personas cubiertas'; }
  function coberturaTxt(p) {
    var cob = p.cobertura || {}; var parts = Object.keys(cob).filter(function (k) { return Number(cob[k]) > 0 && per(k); }).map(function (k) { return nom(k) + ' ' + Number(cob[k]) + '%'; });
    return parts.length ? parts.join(' · ') : 'Entre todas por igual';
  }

  var ICON = {
    resumen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    movs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    personas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 2 5 5.4"/></svg>',
    ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>'
  };

  /* ================= ACCESO ================= */
  function authView(modo, msg) {
    var redirect = location.origin + location.pathname;
    var h = '<div class="auth"><form class="card" id="authForm" novalidate>' +
      '<div><div class="brand">Cuentas Hermanizzz</div><div class="muted small">Gastos del viaje, claros para todas.</div></div>';
    if (modo === 'entrar' || modo === 'crear') {
      h += '<div class="seg" role="group" aria-label="Acceso"><button type="button" data-auth="entrar" aria-pressed="' + (modo === 'entrar') + '">Entrar</button><button type="button" data-auth="crear" aria-pressed="' + (modo === 'crear') + '">Crear cuenta</button></div>' +
        '<label class="f" for="aEmail">Correo<input class="in" id="aEmail" type="email" autocomplete="email" required></label>' +
        '<label class="f" for="aPass">Contraseña<input class="in" id="aPass" type="password" autocomplete="' + (modo === 'crear' ? 'new-password' : 'current-password') + '" minlength="6" required></label>' +
        (modo === 'crear' ? '<p class="muted small" style="margin:0">Mínimo 6 caracteres. Puede que te llegue un correo para confirmar tu cuenta.</p>' : '') +
        '<button class="btn block" type="submit">' + (modo === 'crear' ? 'Crear cuenta' : 'Entrar') + '</button>' +
        (modo === 'entrar' ? '<button type="button" class="link" data-auth="olvido">Olvidé mi contraseña</button>' : '');
    } else if (modo === 'olvido') {
      h += '<h2>Recuperar contraseña</h2><label class="f" for="aEmail">Correo<input class="in" id="aEmail" type="email" autocomplete="email" required></label>' +
        '<button class="btn block" type="submit">Enviarme el enlace</button><button type="button" class="link" data-auth="entrar">Volver</button>';
    } else if (modo === 'nueva') {
      h += '<h2>Nueva contraseña</h2><label class="f" for="aPass">Contraseña nueva<input class="in" id="aPass" type="password" autocomplete="new-password" minlength="6" required></label><button class="btn block" type="submit">Guardar contraseña</button>';
    }
    h += '<div id="authMsg" class="small" role="alert">' + (msg ? esc(msg) : '') + '</div></form></div>';
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
          var r2 = await sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: redirect } });
          if (r2.error) throw r2.error;
          if (!r2.data.session) { out.innerHTML = '<span class="good">Listo. Te enviamos un correo a ' + esc(email) + ': ábrelo para confirmar y luego entra aquí.</span>'; btn.disabled = false; return; }
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
    app.innerHTML = '<div class="auth"><form class="card" id="joinForm" novalidate>' +
      '<div><div class="brand">Únete al viaje</div><p class="muted small" style="margin:4px 0 0">Escribe el código del viaje que te pasaron por WhatsApp.</p></div>' +
      '<label class="f" for="jCode">Código del viaje<input class="in" id="jCode" autocomplete="off" autocapitalize="characters" placeholder="SELVA-XXXX" required></label>' +
      '<button class="btn block" type="submit">Unirme</button>' +
      '<button type="button" class="link" id="jOut">Salir de esta cuenta</button>' +
      '<div id="jMsg" class="small" role="alert">' + (msg ? '<span class="warn">' + esc(msg) + '</span>' : '') + '</div></form></div>';
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
    app.innerHTML = '<div class="auth"><div class="card">' +
      '<div><div class="brand">¿Quién eres?</div><p class="muted small" style="margin:4px 0 0">Elige tu nombre. Así la app sabe cuáles son tus cuentas.</p></div>' +
      (opts.length ? '<div class="pick" style="flex-direction:column">' + opts.map(function (p) {
        return '<button type="button" data-soy="' + p.id + '" aria-pressed="' + (!!(mine && mine.id === p.id)) + '" style="width:100%;justify-content:flex-start;padding:10px">' + av(p, 34) + '<span style="font-size:18px">' + esc(p.nombre) + '</span></button>';
      }).join('') + '</div>' : '<p class="muted">Todas las personas ya tienen cuenta vinculada. Pídele a una hermana que te agregue en la pestaña Personas.</p>') +
      (mine ? '<button class="btn ghost block" type="button" id="wBack">Volver</button>' : '') +
      '<div class="small" role="alert">' + (msg ? '<span class="warn">' + esc(msg) + '</span>' : '') + '</div></div></div>';
    app.onclick = async function (e) {
      var b = e.target.closest('[data-soy]');
      if (b) { var r = await sb.rpc('soy', { p_persona: b.dataset.soy }); if (r.error) { whoView(errTxt(r.error)); return; } app.onclick = null; await loadData(); render(); toast('Listo, eres ' + nom(b.dataset.soy) + '.'); return; }
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
  }
  async function loadData() {
    var id = S.viaje.id;
    var r = await Promise.all([
      sb.from('viajes').select('*').eq('id', id).single(),
      sb.from('personas').select('*').eq('viaje_id', id).order('orden').order('created_at'),
      sb.from('movimientos').select('*').eq('viaje_id', id).order('fecha', { ascending: false }).order('created_at', { ascending: false })
    ]);
    if (r[0].data) S.viaje = r[0].data;
    if (r[1].data) S.personas = r[1].data;
    if (r[2].data) S.movs = r[2].data;
    var err = r[0].error || r[1].error || r[2].error;
    if (err) toast(errTxt(err));
  }
  function suscribir() {
    if (S.channel) sb.removeChannel(S.channel);
    var id = S.viaje.id, t;
    var again = function () { clearTimeout(t); t = setTimeout(async function () { await loadData(); if (yo() && document.querySelector('.shell')) render(); }, 350); };
    S.channel = sb.channel('viaje-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos', filter: 'viaje_id=eq.' + id }, again)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personas', filter: 'viaje_id=eq.' + id }, again)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes', filter: 'id=eq.' + id }, again)
      .subscribe();
  }
  document.addEventListener('visibilitychange', async function () { if (!document.hidden && S.viaje && yo()) { await loadData(); if (document.querySelector('.shell')) render(); } });

  /* ================= VISTA PRINCIPAL ================= */
  function render() {
    var me = yo();
    var tabs = [['resumen', 'Resumen'], ['movs', 'Movimientos'], ['plus', 'Registrar'], ['personas', 'Personas'], ['ajustes', 'Ajustes']];
    app.innerHTML = '<div class="shell">' +
      '<header class="topbar"><div class="topbar-in"><div style="min-width:0"><h1>' + esc(S.viaje.nombre) + '</h1><div class="sub">Cuentas Hermanizzz · todo en soles</div></div>' +
      (me ? '<button class="me" type="button" data-go="ajustes" aria-label="Tu cuenta">' + av(me) + esc(me.nombre) + '</button>' : '') + '</div></header>' +
      '<main id="main">' + vista() + '</main>' +
      '<nav class="tabbar" aria-label="Secciones"><div class="tabbar-in">' + tabs.map(function (t) {
        if (t[0] === 'plus') return '<button class="tab plus" type="button" data-nuevo="1" aria-label="Registrar gasto o pago"><span class="fab">' + ICON.plus + '</span>Registrar</button>';
        return '<button class="tab" type="button" data-go="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + ICON[t[0]] + t[1] + '</button>';
      }).join('') + '</div></nav></div>';
  }
  function vista() {
    if (S.tab === 'movs') return vistaMovs();
    if (S.tab === 'personas') return vistaPersonas();
    if (S.tab === 'ajustes') return vistaAjustes();
    return vistaResumen();
  }

  function vistaResumen() {
    var o = Calc.saldos(S.viaje, S.personas, S.movs), me = yo(), h = '';
    if (me && o[me.id]) {
      var x = o[me.id], n = Math.round(x.net * 100) / 100;
      h += '<section class="hero" aria-label="Tu saldo"><div class="lab">' + (n > 0.009 ? 'Te deben' : n < -0.009 ? 'Debes' : 'Estás a mano') + '</div>' +
        '<div class="big num">' + fmt(Math.abs(n)) + '</div><div class="det num">Pagaste ' + fmt(x.pago) + ' · Te toca ' + fmt(x.toca) +
        (x.env ? ' · Pasaste ' + fmt(x.env) : '') + (x.rec ? ' · Recibiste ' + fmt(x.rec) : '') + '</div></section>';
    }
    var l = Calc.liquidar(o);
    h += '<section class="section"><h2>Para quedar a mano</h2>' + (l.length ? '<div class="card">' + l.map(function (t) {
      return '<div class="liq-row"><span class="t">' + av(per(t.de)) + '<b>' + esc(nom(t.de)) + '</b> le pasa a ' + av(per(t.a)) + '<b>' + esc(nom(t.a)) + '</b> <b class="num">' + fmt(t.v) + '</b></span>' +
        '<button class="btn sm ghost" type="button" data-liq="' + t.de + '|' + t.a + '|' + t.v + '">Ya se pagó</button></div>';
    }).join('') + '</div>' : '<div class="card empty">Están a mano. 🎉</div>') + '</section>';
    h += '<section class="section"><h2>Saldos</h2><div class="saldos">' + pagan().map(function (p) {
      var x = o[p.id] || { pago: 0, toca: 0, env: 0, rec: 0, net: 0 }, n = Math.round(x.net * 100) / 100;
      return '<article class="saldo" style="--c:' + esc(p.color) + '"><div class="who">' + av(p) + esc(p.nombre) + (me && me.id === p.id ? ' <span class="badge you">Tú</span>' : '') + '</div>' +
        '<div><div class="muted small">' + (n > 0.009 ? 'Le deben' : n < -0.009 ? 'Debe' : 'A mano') + '</div><div class="amt num ' + (n > 0.009 ? 'good' : n < -0.009 ? 'bad' : '') + '">' + fmt(Math.abs(n)) + '</div></div>' +
        '<dl class="kv num"><dt>Pagó</dt><dd>' + fmt(x.pago) + '</dd><dt>Le toca</dt><dd>' + fmt(x.toca) + '</dd></dl></article>';
    }).join('') + '</div></section>';
    var tot = 0, porCat = {};
    S.movs.forEach(function (m) { if (m.tipo === 'pago') return; var v = Calc.enSoles(m, S.viaje); tot += v; var c = CATS[m.categoria] ? m.categoria : 'otros'; porCat[c] = (porCat[c] || 0) + v; });
    var max = Math.max.apply(null, Object.keys(porCat).map(function (k) { return porCat[k]; }).concat([1]));
    h += '<section class="section"><h2>Gasto del viaje</h2><div class="card"><div class="num" style="font-family:var(--display);font-weight:800;font-size:26px">' + fmt(tot) + '</div>' +
      (tot ? '<div class="bars">' + Object.keys(CATS).filter(function (k) { return porCat[k]; }).sort(function (a, b) { return porCat[b] - porCat[a]; }).map(function (k) {
        return '<div class="bar"><span>' + CATS[k][1] + ' ' + CATS[k][0] + '</span><span class="track"><span class="fill" style="display:block;width:' + Math.max(2, porCat[k] / max * 100) + '%"></span></span><span class="num small">' + fmt(porCat[k]) + '</span></div>';
      }).join('') + '</div>' : '<p class="muted" style="margin:0">Todavía no hay gastos. Toca <b>Registrar</b> para anotar el primero.</p>') + '</div></section>';
    return h;
  }

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
  function vistaMovs() {
    var chips = [['todos', 'Todos'], ['pagos', '🤝 Pagos']].concat(Object.keys(CATS).map(function (k) { return [k, CATS[k][1] + ' ' + CATS[k][0]]; }));
    if (S.filtro.indexOf('p:') === 0) chips.unshift([S.filtro, '👤 ' + nom(S.filtro.slice(2)) + ' ✕']);
    var list = filtrados(), h = '<section class="section"><h2>Movimientos</h2>' +
      '<div class="search"><input class="in" id="q" type="search" placeholder="Buscar: Laguna, cena, Camila…" value="' + esc(S.q) + '" aria-label="Buscar movimientos"></div>' +
      '<div class="chips" role="group" aria-label="Filtrar">' + chips.map(function (c) { return '<button type="button" class="chip" data-filtro="' + c[0] + '" aria-pressed="' + (S.filtro === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>';
    if (!list.length) return h + '<div class="list empty">' + (S.movs.length ? 'No hay movimientos con ese filtro.' : 'Todavía no hay movimientos. Toca <b>Registrar</b> para anotar el primero.') + '</div></section>';
    var tot = 0; list.forEach(function (m) { if (m.tipo !== 'pago') tot += Calc.enSoles(m, S.viaje); });
    h += '<div class="muted small num">' + list.length + (list.length === 1 ? ' movimiento' : ' movimientos') + (tot ? ' · gastos ' + fmt(tot) : '') + '</div>';
    var byDay = {}, order = [];
    list.forEach(function (m) { if (!byDay[m.fecha]) { byDay[m.fecha] = []; order.push(m.fecha); } byDay[m.fecha].push(m); });
    order.forEach(function (d) {
      h += '<div class="day">' + esc(fday(d)) + '</div><div class="list">' + byDay[d].map(itemHtml).join('') + '</div>';
    });
    return h + '</section>';
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
    if (m.modo === 'entre') return 'Entre ' + (m.entre || []).map(nom).join(', ');
    if (m.modo === 'invito') return 'Invitó ' + nom(m.pagador_id);
    return '';
  }

  function vistaPersonas() {
    var o = Calc.saldos(S.viaje, S.personas, S.movs), me = yo();
    var partesTot = {}; S.personas.forEach(function (p) { partesTot[p.id] = 0; });
    S.movs.forEach(function (m) { if (m.tipo === 'pago') return; var p = Calc.partes(m, S.viaje, S.personas); Object.keys(p).forEach(function (k) { partesTot[k] = (partesTot[k] || 0) + p[k]; }); });
    var h = '<section class="section"><h2>Personas</h2><p class="muted small" style="margin:0">Quienes pagan su parte tienen saldo. A papá y mamá los cubren las hermanas según sus porcentajes.</p>';
    h += S.personas.map(function (p) {
      var x = o[p.id], n = x ? Math.round(x.net * 100) / 100 : 0;
      var badges = (p.tipo === 'paga' ? '<span class="badge">Paga su parte</span>' : '<span class="badge">La cubren</span>') +
        (me && me.id === p.id ? ' <span class="badge you">Tú</span>' : p.user_id ? ' <span class="badge">Con cuenta</span>' : '');
      var body = p.tipo === 'paga'
        ? '<dl class="kv num"><dt>Pagó</dt><dd>' + fmt(x.pago) + '</dd><dt>Le toca</dt><dd>' + fmt(x.toca) + '</dd>' + (x.env ? '<dt>Pasó a hermanas</dt><dd>' + fmt(x.env) + '</dd>' : '') + (x.rec ? '<dt>Recibió</dt><dd>' + fmt(x.rec) + '</dd>' : '') +
          '<dt><b>' + (n > 0.009 ? 'Le deben' : n < -0.009 ? 'Debe' : 'A mano') + '</b></dt><dd><b class="' + (n > 0.009 ? 'good' : n < -0.009 ? 'bad' : '') + '">' + fmt(Math.abs(n)) + '</b></dd></dl>'
        : '<dl class="kv num"><dt>Su parte del viaje</dt><dd>' + fmt(partesTot[p.id]) + '</dd><dt>La cubren</dt><dd>' + esc(coberturaTxt(p)) + '</dd></dl>';
      return '<article class="card persona" style="border-left:6px solid ' + esc(p.color) + '"><div class="persona-head">' + av(p, 36) + '<div style="min-width:0;flex:1"><div class="n">' + esc(p.nombre) + '</div><div>' + badges + '</div></div></div>' + body +
        '<div class="actions"><button class="btn sm ghost" type="button" data-hist="' + p.id + '">Ver movimientos</button><button class="btn sm ghost" type="button" data-editp="' + p.id + '">Editar</button></div></article>';
    }).join('');
    h += '<button class="btn ghost block" type="button" data-editp="nueva">+ Agregar persona</button></section>';
    return h;
  }

  function vistaAjustes() {
    var v = S.viaje, me = yo();
    return '<section class="section"><h2>Reglas del viaje</h2><form class="card" id="cfg" novalidate>' +
      '<label class="f" for="cNombre">Nombre del viaje<input class="in" id="cNombre" value="' + esc(v.nombre) + '"></label>' +
      '<div class="row"><label class="f" for="cTope">Tope de hospedaje (S/ por noche)<input class="in" id="cTope" inputmode="decimal" value="' + esc(v.tope) + '"></label>' +
      '<label class="f" for="cTc">Tipo de cambio (S/ por US$)<input class="in" id="cTc" inputmode="decimal" value="' + esc(v.tc) + '"></label></div>' +
      '<label class="f" for="cAbs">Quién pone lo que pase del tope<select class="in" id="cAbs">' + pagan().map(function (p) { return '<option value="' + p.id + '"' + (absorbe() && absorbe().id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select></label>' +
      '<p class="muted small" style="margin:0">El tipo de cambio aplica a los gastos nuevos en dólares. Los porcentajes de papá y mamá se editan en Personas.</p>' +
      '<button class="btn" type="submit">Guardar reglas</button></form></section>' +
      '<section class="section"><h2>Invitar</h2><div class="card"><p style="margin:0">Pásales este código a tus hermanas. Entran a esta misma página, crean su cuenta y lo escriben.</p>' +
      '<div class="code num" id="codigo">' + esc(v.codigo) + '</div><div class="actions"><button class="btn sm" type="button" id="copyCode">Copiar invitación</button></div>' +
      '<p class="muted small" style="margin:0">Link: <span id="link">' + esc(location.origin + location.pathname) + '</span></p></div></section>' +
      '<section class="section"><h2>Tu cuenta</h2><div class="card"><div class="small muted">Entraste como</div><div><b>' + esc(S.user && S.user.email) + '</b>' + (me ? ' · eres <b>' + esc(me.nombre) + '</b>' : '') + '</div>' +
      '<div class="actions"><button class="btn sm ghost" type="button" id="cambiarYo">Cambiar quién soy</button><button class="btn sm ghost" type="button" id="salir">Cerrar sesión</button></div></div></section>';
  }

  /* ================= HOJA: REGISTRAR ================= */
  function nuevoF(base) {
    var me = yo(), ps = pagan(), otra = ps.find(function (p) { return !me || p.id !== me.id; });
    return Object.assign({
      id: null, tipo: 'gasto', monto: '', moneda: 'PEN', tc: '', descripcion: '', pagador_id: me ? me.id : (ps[0] && ps[0].id), categoria: 'comidas', fecha: hoy(),
      modo: 'todos', noches: '1', detalle: {}, entre: ps.map(function (p) { return p.id; }), de_id: me ? me.id : (ps[0] && ps[0].id), a_id: otra ? otra.id : '', nota: ''
    }, base || {});
  }
  function abrirSheet(html) { sheet.innerHTML = '<div class="sheet-in">' + html + '</div>'; sheet.hidden = false; document.body.style.overflow = 'hidden'; var f = sheet.querySelector('input,select,button:not(.x)'); if (f && window.matchMedia('(min-width:700px)').matches) f.focus(); }
  function cerrarSheet() { sheet.hidden = true; sheet.innerHTML = ''; F = null; document.body.style.overflow = ''; }

  function MODOS() {
    var a = absorbe();
    return [
      ['todos', '👨‍👩‍👧', 'Todos por igual', 'Se divide entre todos. La parte de ' + nombresCub() + ' la cubren las hermanas según sus porcentajes.'],
      ['tope', '🛏️', 'Hospedaje con tope', 'Cada uno cuenta hasta S/ ' + S.viaje.tope + ' por noche; ' + (a ? a.nombre : 'una hermana') + ' pone lo que pase.'],
      ['detalle', '✍️', 'Monto por persona', 'Para cuartos de distinto precio o pasajes de cada quien.'],
      ['cubiertas', '💛', 'Solo para ' + nombresCub(), 'Lo pagan las hermanas según los porcentajes de Personas.'],
      ['entre', '👯', 'Entre algunas personas', 'Se divide por igual solo entre quienes marques.'],
      ['invito', '🎁', 'Invité yo', 'No se divide: lo asume quien pagó.']
    ];
  }
  function formHtml() {
    var isP = F.tipo === 'pago', h = '<div class="sheet-head"><h2 id="sheetTitle">' + (F.id ? 'Editar' : 'Registrar') + '</h2><button class="x" type="button" data-cerrar="1" aria-label="Cerrar">✕</button></div>';
    if (!F.id) h += '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-ftipo="gasto" aria-pressed="' + !isP + '">Gasto</button><button type="button" data-ftipo="pago" aria-pressed="' + isP + '">Pago entre hermanas</button></div>';
    h += '<form id="fReg" novalidate style="display:flex;flex-direction:column;gap:14px">';
    if (!isP) {
      h += '<div class="amount"><select id="fMoneda" name="moneda" aria-label="Moneda"><option value="PEN"' + (F.moneda === 'PEN' ? ' selected' : '') + '>S/</option><option value="USD"' + (F.moneda === 'USD' ? ' selected' : '') + '>US$</option></select>' +
        '<input id="fMonto" name="monto" inputmode="decimal" placeholder="0.00" value="' + esc(F.monto) + '" aria-label="Monto" autocomplete="off"></div>' +
        (F.moneda === 'USD' ? '<label class="f" for="fTc">Tipo de cambio<input class="in" id="fTc" name="tc" inputmode="decimal" value="' + esc(F.tc || S.viaje.tc) + '"></label>' : '') +
        '<label class="f" for="fDesc">Qué fue<input class="in" id="fDesc" name="descripcion" placeholder="Ej.: cena del cumple de papá" value="' + esc(F.descripcion) + '" autocomplete="off"></label>' +
        '<div class="f" style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;color:var(--muted)">Quién pagó<div class="pick" role="group">' + pagan().map(function (p) { return '<button type="button" data-fpag="' + p.id + '" aria-pressed="' + (F.pagador_id === p.id) + '">' + av(p) + esc(p.nombre) + '</button>'; }).join('') + '</div></div>' +
        '<div class="f" style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;color:var(--muted)">Categoría<div class="pick cats" role="group">' + Object.keys(CATS).map(function (k) { return '<button type="button" data-fcat="' + k + '" aria-pressed="' + (F.categoria === k) + '">' + CATS[k][1] + ' ' + CATS[k][0] + '</button>'; }).join('') + '</div></div>' +
        '<label class="f" for="fFecha">Fecha<input class="in" id="fFecha" name="fecha" type="date" value="' + esc(F.fecha) + '"></label>' +
        '<div class="f" style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;color:var(--muted)">Cómo se divide<div class="modes" role="group">' + MODOS().map(function (m) {
          return '<button type="button" class="mode" data-fmodo="' + m[0] + '" aria-pressed="' + (F.modo === m[0]) + '"><span class="ic">' + m[1] + '</span><b>' + esc(m[2]) + '</b><span class="x">' + esc(m[3]) + '</span></button>';
        }).join('') + '</div></div>';
      if (F.modo === 'tope') h += '<label class="f" for="fNoches">Noches<input class="in" id="fNoches" name="noches" inputmode="numeric" value="' + esc(F.noches) + '"></label>';
      if (F.modo === 'detalle') h += '<div class="det">' + S.personas.map(function (p) { return '<label class="f" for="fd_' + p.id + '">' + esc(p.nombre) + '<input class="in" id="fd_' + p.id + '" data-fdet="' + p.id + '" inputmode="decimal" placeholder="0.00" value="' + esc(F.detalle[p.id] == null ? '' : F.detalle[p.id]) + '"></label>'; }).join('') + '</div>';
      if (F.modo === 'entre') h += '<div class="pick" role="group" aria-label="Entre quiénes">' + S.personas.map(function (p) { return '<button type="button" data-fentre="' + p.id + '" aria-pressed="' + (F.entre.indexOf(p.id) >= 0) + '">' + av(p) + esc(p.nombre) + '</button>'; }).join('') + '</div>';
      h += '<div class="preview num" id="fPrev" aria-live="polite"></div>';
    } else {
      h += '<div class="amount"><span style="font-weight:700;font-size:18px">S/</span><input id="fMonto" name="monto" inputmode="decimal" placeholder="0.00" value="' + esc(F.monto) + '" aria-label="Monto" autocomplete="off"></div>' +
        '<div class="row"><label class="f" for="fDe">Quién pasa la plata<select class="in" id="fDe" name="de_id">' + pagan().map(function (p) { return '<option value="' + p.id + '"' + (F.de_id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select></label>' +
        '<label class="f" for="fA">A quién<select class="in" id="fA" name="a_id">' + pagan().map(function (p) { return '<option value="' + p.id + '"' + (F.a_id === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="f" for="fFecha">Fecha<input class="in" id="fFecha" name="fecha" type="date" value="' + esc(F.fecha) + '"></label>' +
        '<label class="f" for="fNota">Nota<input class="in" id="fNota" name="nota" placeholder="Ej.: su parte del depa de Lima" value="' + esc(F.nota) + '" autocomplete="off"></label>' +
        '<div id="fPrev" class="warn"></div>';
    }
    h += '<button class="btn block" type="submit" id="fSave">' + (F.id ? 'Guardar cambios' : 'Guardar') + '</button></form>';
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
    if (m.modo === 'detalle') { var s = 0; Object.keys(m.detalle).forEach(function (k) { s += m.detalle[k]; }); var d = Math.round((m.monto - s) * 100) / 100; if (Math.abs(d) > 0.05) return (d > 0 ? 'Falta repartir ' : 'Te pasaste por ') + (m.moneda === 'USD' ? 'US$ ' : 'S/ ') + Math.abs(d).toFixed(2) + '.'; }
    if (m.modo === 'entre' && !m.entre.length) return 'Marca al menos una persona.';
    return '';
  }
  function prev() {
    var el = document.getElementById('fPrev'), btn = document.getElementById('fSave'); if (!el) return;
    var m = borrador(), pr = problema(m);
    btn.disabled = !!pr;
    if (m.tipo === 'pago') { el.textContent = m.monto > 0 ? pr : ''; return; }
    if (!(m.monto > 0)) { el.innerHTML = '<span class="muted">Escribe el monto para ver cuánto le toca a cada una.</span>'; return; }
    var c = Calc.carga(m, S.viaje, S.personas), p = Calc.partes(m, S.viaje, S.personas), cub = 0;
    cubiertas().forEach(function (x) { cub += p[x.id] || 0; });
    el.innerHTML = '<div class="muted small">Le toca' + (m.moneda === 'USD' ? ' (total ' + fmt(Calc.enSoles(m, S.viaje)) + ')' : '') + '</div>' +
      pagan().map(function (x) { return '<div class="l"><span style="display:flex;align-items:center;gap:8px">' + av(x) + esc(x.nombre) + '</span><b>' + fmt(c[x.id]) + '</b></div>'; }).join('') +
      (cub > 0.004 ? '<div class="muted small">Incluye ' + fmt(cub) + ' de ' + esc(nombresCub()) + ', repartido según sus porcentajes.</div>' : '') +
      (pr ? '<div class="warn">' + esc(pr) + '</div>' : '');
  }
  function abrirForm(base) { F = nuevoF(base); abrirSheet(formHtml()); prev(); }
  function repintarForm() { var y = sheet.querySelector('.sheet-in').scrollTop; sheet.querySelector('.sheet-in').innerHTML = formHtml(); sheet.querySelector('.sheet-in').scrollTop = y; prev(); }
  async function guardarForm() {
    var m = borrador(), pr = problema(m); if (pr) { toast(pr); return; }
    var btn = document.getElementById('fSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    var r = F.id ? await sb.from('movimientos').update(m).eq('id', F.id) : await sb.from('movimientos').insert(Object.assign({ viaje_id: S.viaje.id }, m));
    if (r.error) { btn.disabled = false; btn.textContent = 'Guardar'; toast(errTxt(r.error)); return; }
    var edit = !!F.id; cerrarSheet(); await loadData(); render(); toast(edit ? 'Cambios guardados.' : 'Registrado.');
  }

  /* ================= HOJA: DETALLE ================= */
  function verMov(id, confirmar) {
    var m = S.movs.find(function (x) { return x.id === id; }); if (!m) return;
    var autor = S.personas.find(function (p) { return p.user_id && p.user_id === m.creado_por; });
    var h = '<div class="sheet-head"><h2 id="sheetTitle">' + (m.tipo === 'pago' ? 'Pago entre hermanas' : esc(m.descripcion)) + '</h2><button class="x" type="button" data-cerrar="1" aria-label="Cerrar">✕</button></div>';
    if (m.tipo === 'pago') {
      h += '<div class="hero"><div class="lab">' + esc(nom(m.de_id)) + ' le pasó a ' + esc(nom(m.a_id)) + '</div><div class="big num">' + fmt(m.monto) + '</div><div class="det">' + esc(fday(m.fecha)) + (m.nota ? ' · ' + esc(m.nota) : '') + '</div></div>';
    } else {
      var c = Calc.carga(m, S.viaje, S.personas), p = Calc.partes(m, S.viaje, S.personas), cat = CATS[m.categoria] || CATS.otros;
      h += '<div class="hero"><div class="lab">' + cat[1] + ' ' + cat[0] + ' · ' + esc(fday(m.fecha)) + '</div><div class="big num">' + fmt(Calc.enSoles(m, S.viaje)) + '</div><div class="det">Pagó ' + esc(nom(m.pagador_id)) +
        (m.moneda === 'USD' ? ' · US$ ' + Number(m.monto).toFixed(2) + ' × ' + Number(m.tc || S.viaje.tc).toFixed(2) : '') + '</div></div>' +
        '<div class="card"><b>' + esc(modoTxt(m)) + '</b><div class="muted small">Lo que le toca a cada hermana</div>' +
        pagan().map(function (x) { return '<div class="liq-row" style="padding:8px 10px"><span class="t">' + av(x) + esc(x.nombre) + '</span><b class="num">' + fmt(c[x.id]) + '</b></div>'; }).join('') +
        (cubiertas().some(function (x) { return p[x.id] > 0.004; }) ? '<div class="muted small">Parte de ' + cubiertas().map(function (x) { return esc(x.nombre) + ' ' + fmt(p[x.id]); }).join(' · ') + ', ya incluida arriba.</div>' : '') + '</div>';
    }
    if (autor) h += '<div class="muted small">Registrado por ' + esc(autor.nombre) + '</div>';
    h += confirmar
      ? '<div class="card"><b>¿Borrar este movimiento?</b><span class="muted small">Se recalculan los saldos de todas.</span><div class="actions"><button class="btn danger" type="button" data-borrarok="' + m.id + '">Sí, borrar</button><button class="btn ghost" type="button" data-ver="' + m.id + '">No</button></div></div>'
      : '<div class="actions"><button class="btn" type="button" data-editar="' + m.id + '">Editar</button><button class="btn ghost" type="button" data-borrar="' + m.id + '">Borrar</button></div>';
    if (sheet.hidden) abrirSheet(h); else sheet.querySelector('.sheet-in').innerHTML = h;
  }

  /* ================= HOJA: PERSONA ================= */
  var P = null;
  function editarPersona(id, confirmar) {
    var base = id === 'nueva' ? null : per(id);
    if (!P || P.id !== (base ? base.id : 'nueva')) P = base ? JSON.parse(JSON.stringify(base)) : { id: 'nueva', nombre: '', tipo: 'paga', color: COLORS[S.personas.length % COLORS.length], cobertura: {} };
    var h = '<div class="sheet-head"><h2 id="sheetTitle">' + (base ? 'Editar persona' : 'Agregar persona') + '</h2><button class="x" type="button" data-cerrar="1" aria-label="Cerrar">✕</button></div>' +
      '<form id="fPer" novalidate style="display:flex;flex-direction:column;gap:14px">' +
      '<label class="f" for="pNombre">Nombre<input class="in" id="pNombre" value="' + esc(P.nombre) + '" autocomplete="off"></label>' +
      '<div class="f" style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;color:var(--muted)">Color<div class="colors" role="group">' + COLORS.map(function (c) { return '<button type="button" data-pcolor="' + c + '" style="--c:' + c + '" aria-pressed="' + (P.color === c) + '" aria-label="Color ' + c + '"></button>'; }).join('') + '</div></div>' +
      '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-ptipo="paga" aria-pressed="' + (P.tipo === 'paga') + '">Paga su parte</button><button type="button" data-ptipo="cubierta" aria-pressed="' + (P.tipo === 'cubierta') + '">La cubren otras</button></div>';
    if (P.tipo === 'cubierta') {
      var s = 0;
      h += '<div class="card" style="background:var(--sunk);border:0"><b>Quién la cubre (%)</b>' + pagan().filter(function (x) { return x.id !== P.id; }).map(function (x) { var v = P.cobertura[x.id] == null ? '' : P.cobertura[x.id]; s += num(v); return '<label class="cov" for="cv_' + x.id + '"><span style="display:flex;align-items:center;gap:8px">' + av(x) + esc(x.nombre) + '</span><input class="in" id="cv_' + x.id + '" data-pcov="' + x.id + '" inputmode="decimal" value="' + esc(v) + '"></label>'; }).join('') +
        '<div class="small ' + (Math.abs(s - 100) > 0.01 ? 'warn' : 'muted') + '" id="covSum">Suma: ' + s + '% ' + (Math.abs(s - 100) > 0.01 ? '(debe ser 100%)' : '✓') + '</div></div>';
    }
    h += '<button class="btn block" type="submit">Guardar</button>';
    if (base) h += confirmar
      ? '<div class="card"><b>¿Eliminar a ' + esc(base.nombre) + '?</b><span class="muted small">Solo se puede si no tiene movimientos.</span><div class="actions"><button class="btn danger" type="button" data-pdelok="' + base.id + '">Sí, eliminar</button><button class="btn ghost" type="button" data-pdelno="' + base.id + '">No</button></div></div>'
      : '<button class="btn ghost block" type="button" data-pdel="' + base.id + '">Eliminar persona</button>';
    h += '</form>';
    if (sheet.hidden) abrirSheet(h); else sheet.querySelector('.sheet-in').innerHTML = h;
  }
  async function guardarPersona() {
    P.nombre = document.getElementById('pNombre').value.trim();
    if (!P.nombre) { toast('Escribe el nombre.'); return; }
    var cob = {};
    if (P.tipo === 'cubierta') {
      var s = 0; Object.keys(P.cobertura).forEach(function (k) { var v = num(P.cobertura[k]); if (v > 0 && per(k) && per(k).tipo === 'paga') { cob[k] = v; s += v; } });
      if (Math.abs(s - 100) > 0.01) { toast('Los porcentajes deben sumar 100%.'); return; }
    }
    var row = { nombre: P.nombre, tipo: P.tipo, color: P.color, cobertura: cob };
    var r = P.id === 'nueva' ? await sb.from('personas').insert(Object.assign({ viaje_id: S.viaje.id, orden: S.personas.length + 1 }, row)) : await sb.from('personas').update(row).eq('id', P.id);
    if (r.error) { toast(errTxt(r.error)); return; }
    P = null; cerrarSheet(); await loadData(); render(); toast('Guardado.');
  }

  /* ================= EVENTOS ================= */
  app.addEventListener('click', async function (e) {
    if (!document.querySelector('.shell')) return;
    var b = e.target.closest('button'); if (!b) return; var d = b.dataset;
    if (d.go) { S.tab = d.go; render(); window.scrollTo(0, 0); return; }
    if (d.nuevo) { abrirForm(); return; }
    if (d.filtro) { S.filtro = (S.filtro === d.filtro && d.filtro.indexOf('p:') === 0) ? 'todos' : d.filtro; document.getElementById('main').innerHTML = vista(); return; }
    if (d.ver) { verMov(d.ver); return; }
    if (d.liq) { var q = d.liq.split('|'); abrirForm({ tipo: 'pago', de_id: q[0], a_id: q[1], monto: q[2], nota: 'Para quedar a mano' }); return; }
    if (d.hist) { S.tab = 'movs'; S.filtro = 'p:' + d.hist; render(); window.scrollTo(0, 0); return; }
    if (d.editp) { P = null; editarPersona(d.editp); return; }
    if (b.id === 'copyCode') {
      var txt = '¡Únete a las cuentas del viaje! Entra a ' + location.origin + location.pathname + ' , crea tu cuenta y escribe el código ' + S.viaje.codigo;
      try { await navigator.clipboard.writeText(txt); toast('Invitación copiada. Pégala en WhatsApp.'); } catch (err) { toast('Copia el código: ' + S.viaje.codigo); }
      return;
    }
    if (b.id === 'cambiarYo') { whoView(); return; }
    if (b.id === 'salir') { await sb.auth.signOut(); return; }
  });
  app.addEventListener('input', function (e) { if (e.target.id === 'q') { S.q = e.target.value; var pos = e.target.selectionStart; document.getElementById('main').innerHTML = vista(); var q = document.getElementById('q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) {} } });
  app.addEventListener('submit', async function (e) {
    if (e.target.id !== 'cfg') return; e.preventDefault();
    var row = { nombre: document.getElementById('cNombre').value.trim() || S.viaje.nombre, tope: num(document.getElementById('cTope').value) || S.viaje.tope, tc: num(document.getElementById('cTc').value) || S.viaje.tc, absorbe_tope: document.getElementById('cAbs').value || null };
    var r = await sb.from('viajes').update(row).eq('id', S.viaje.id);
    if (r.error) { toast(errTxt(r.error)); return; }
    await loadData(); render(); toast('Reglas guardadas.');
  });

  sheet.addEventListener('click', async function (e) {
    if (e.target === sheet) { cerrarSheet(); P = null; return; }
    var b = e.target.closest('button'); if (!b) return; var d = b.dataset;
    if (d.cerrar) { cerrarSheet(); P = null; return; }
    if (F) {
      if (d.ftipo) { F.tipo = d.ftipo; repintarForm(); return; }
      if (d.fpag) { F.pagador_id = d.fpag; sheet.querySelectorAll('[data-fpag]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); prev(); return; }
      if (d.fcat) { F.categoria = d.fcat; sheet.querySelectorAll('[data-fcat]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); if (d.fcat === 'hospedaje' && F.modo === 'todos' && !F.id) { F.modo = 'tope'; repintarForm(); } return; }
      if (d.fmodo) { F.modo = d.fmodo; repintarForm(); return; }
      if (d.fentre) { var i = F.entre.indexOf(d.fentre); if (i >= 0) F.entre.splice(i, 1); else F.entre.push(d.fentre); b.setAttribute('aria-pressed', i < 0); prev(); return; }
    }
    if (d.ver) { verMov(d.ver); return; }
    if (d.editar) {
      var m = S.movs.find(function (x) { return x.id === d.editar; }); if (!m) return;
      var det = {}; if (m.detalle) Object.keys(m.detalle).forEach(function (k) { det[k] = String(m.detalle[k]); });
      F = nuevoF({ id: m.id, tipo: m.tipo, monto: String(m.monto), moneda: m.moneda || 'PEN', tc: m.tc ? String(m.tc) : '', descripcion: m.descripcion || '', pagador_id: m.pagador_id, categoria: m.categoria || 'otros', fecha: m.fecha, modo: m.modo || 'todos', noches: String(m.noches || 1), detalle: det, entre: (m.entre || []).slice(), de_id: m.de_id, a_id: m.a_id, nota: m.nota || '' });
      repintarForm(); return;
    }
    if (d.borrar) { verMov(d.borrar, true); return; }
    if (d.borrarok) { var r = await sb.from('movimientos').delete().eq('id', d.borrarok); if (r.error) { toast(errTxt(r.error)); return; } cerrarSheet(); await loadData(); render(); toast('Borrado.'); return; }
    if (P) {
      if (d.pcolor) { P.color = d.pcolor; sheet.querySelectorAll('[data-pcolor]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); return; }
      if (d.ptipo) { P.nombre = document.getElementById('pNombre').value; P.tipo = d.ptipo; if (P.tipo === 'cubierta' && !Object.keys(P.cobertura).length) { var ps = pagan().filter(function (x) { return x.id !== P.id; }); ps.forEach(function (x) { P.cobertura[x.id] = Math.round(100 / ps.length * 100) / 100; }); } editarPersona(P.id); return; }
      if (d.pdel) { P.nombre = document.getElementById('pNombre').value; editarPersona(d.pdel, true); return; }
      if (d.pdelno) { editarPersona(d.pdelno); return; }
      if (d.pdelok) { var r2 = await sb.from('personas').delete().eq('id', d.pdelok); if (r2.error) { toast(errTxt(r2.error)); return; } P = null; cerrarSheet(); await loadData(); render(); toast('Persona eliminada.'); return; }
    }
  });
  sheet.addEventListener('input', function (e) {
    var t = e.target;
    if (F) {
      if (t.dataset.fdet) { F.detalle[t.dataset.fdet] = t.value; prev(); return; }
      if (t.name && t.name in F) { F[t.name] = t.value; if (t.name === 'moneda') { repintarForm(); return; } prev(); }
      return;
    }
    if (P && t.dataset.pcov) {
      P.cobertura[t.dataset.pcov] = t.value;
      var s = 0; Object.keys(P.cobertura).forEach(function (k) { s += num(P.cobertura[k]); });
      var el = document.getElementById('covSum'); el.className = 'small ' + (Math.abs(s - 100) > 0.01 ? 'warn' : 'muted'); el.textContent = 'Suma: ' + Math.round(s * 100) / 100 + '% ' + (Math.abs(s - 100) > 0.01 ? '(debe ser 100%)' : '✓');
    }
  });
  sheet.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'fReg') guardarForm();
    if (e.target.id === 'fPer') guardarPersona();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) { cerrarSheet(); P = null; } });

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') { authView('nueva'); return; }
    if (ev === 'SIGNED_OUT') { if (S.channel) sb.removeChannel(S.channel); S = { session: null, user: null, viaje: null, viajes: [], personas: [], movs: [], tab: 'resumen', filtro: 'todos', q: '', channel: null }; cerrarSheet(); authView('entrar'); return; }
    if (ev === 'SIGNED_IN' && !document.querySelector('.shell') && !document.getElementById('joinForm')) { setTimeout(boot, 0); }
  });
  boot();
})();
