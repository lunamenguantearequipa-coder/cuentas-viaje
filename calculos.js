// Lógica de reparto. Funciones puras: reciben viaje, personas y movimientos.
(function (root) {
  function tasa(m, viaje) { return Number(m.tc) || Number(viaje.tc) || 1; }
  function enSoles(m, viaje) { return m.moneda === 'USD' ? Number(m.monto) * tasa(m, viaje) : Number(m.monto); }

  // Cuánto le corresponde a cada persona (incluidas papá y mamá) de un gasto.
  function partes(m, viaje, personas) {
    var T = enSoles(m, viaje), p = {}, ids = personas.map(function (x) { return x.id; }), n = ids.length || 1;
    ids.forEach(function (id) { p[id] = 0; });
    var f = m.moneda === 'USD' ? tasa(m, viaje) : 1;
    if (m.modo === 'todos') {
      ids.forEach(function (id) { p[id] = T / n; });
    } else if (m.modo === 'tope') {
      var pagan = personas.filter(function (x) { return x.tipo === 'paga'; });
      var abs = viaje.absorbe_tope && p.hasOwnProperty(viaje.absorbe_tope) ? viaje.absorbe_tope : (pagan[0] && pagan[0].id);
      var cap = Math.min((Number(m.tope) || Number(viaje.tope)) * (Number(m.noches) || 1), T / n);
      ids.forEach(function (id) { p[id] = id === abs ? T - cap * (n - 1) : cap; });
    } else if (m.modo === 'detalle') {
      var d = m.detalle || {};
      ids.forEach(function (id) { p[id] = (Number(d[id]) || 0) * f; });
    } else if (m.modo === 'cubiertas') {
      var cub = personas.filter(function (x) { return x.tipo === 'cubierta'; });
      if (!cub.length) cub = personas;
      cub.forEach(function (x) { p[x.id] = T / cub.length; });
    } else if (m.modo === 'entre') {
      var l = (m.entre || []).filter(function (id) { return p.hasOwnProperty(id); });
      if (!l.length) l = ids;
      l.forEach(function (id) { p[id] = T / l.length; });
    } else if (m.modo === 'invito') {
      if (p.hasOwnProperty(m.pagador_id)) p[m.pagador_id] = T;
    }
    return p;
  }

  // Pasajes y hospedaje usan `cobertura`; el resto usa `cobertura_otros` (si no hay, la misma).
  function esBase(cat) { return cat === 'pasajes' || cat === 'hospedaje'; }
  function coberturaDe(x, cat) {
    if (!esBase(cat) && x.cobertura_otros && Object.keys(x.cobertura_otros).length) return x.cobertura_otros;
    return x.cobertura || {};
  }

  // Pasa la parte de las personas cubiertas (papá y mamá) a quienes las cubren.
  // Devuelve {propio, cubre} por hermana: lo suyo y lo que pone por papá y mamá.
  function detalleCarga(p, personas, cat) {
    var pagan = personas.filter(function (x) { return x.tipo === 'paga'; });
    var c = {};
    pagan.forEach(function (x) { c[x.id] = { propio: 0, cubre: 0 }; });
    personas.forEach(function (x) {
      var v = p[x.id] || 0;
      if (!v) return;
      if (x.tipo === 'paga') { if (c[x.id]) c[x.id].propio += v; return; }
      var cob = coberturaDe(x, cat), keys = Object.keys(cob).filter(function (k) { return c.hasOwnProperty(k) && Number(cob[k]) > 0; });
      var tot = keys.reduce(function (s, k) { return s + Number(cob[k]); }, 0);
      if (!keys.length || !tot) { pagan.forEach(function (y) { c[y.id].cubre += v / (pagan.length || 1); }); return; }
      keys.forEach(function (k) { c[k].cubre += v * Number(cob[k]) / tot; });
    });
    return c;
  }
  function cargaDesdePartes(p, personas, cat) {
    var d = detalleCarga(p, personas, cat), c = {};
    Object.keys(d).forEach(function (k) { c[k] = d[k].propio + d[k].cubre; });
    return c;
  }
  function carga(m, viaje, personas) { return cargaDesdePartes(partes(m, viaje, personas), personas, m.categoria); }

  function saldos(viaje, personas, movs) {
    var o = {};
    personas.filter(function (x) { return x.tipo === 'paga'; }).forEach(function (x) { o[x.id] = { pago: 0, toca: 0, propio: 0, cubre: 0, env: 0, rec: 0, net: 0 }; });
    movs.forEach(function (m) {
      if (m.tipo === 'pago') {
        if (o[m.de_id]) o[m.de_id].env += Number(m.monto);
        if (o[m.a_id]) o[m.a_id].rec += Number(m.monto);
        return;
      }
      if (o[m.pagador_id]) o[m.pagador_id].pago += enSoles(m, viaje);
      var d = detalleCarga(partes(m, viaje, personas), personas, m.categoria);
      Object.keys(d).forEach(function (k) { if (o[k]) { o[k].propio += d[k].propio; o[k].cubre += d[k].cubre; o[k].toca += d[k].propio + d[k].cubre; } });
    });
    Object.keys(o).forEach(function (k) { var x = o[k]; x.net = x.pago - x.toca + x.env - x.rec; });
    return o;
  }

  function liquidar(o) {
    var deb = [], acr = [];
    Object.keys(o).forEach(function (k) {
      var n = Math.round(o[k].net * 100) / 100;
      if (n < -0.009) deb.push({ k: k, v: -n }); else if (n > 0.009) acr.push({ k: k, v: n });
    });
    deb.sort(function (a, b) { return b.v - a.v; }); acr.sort(function (a, b) { return b.v - a.v; });
    var out = [], i = 0, j = 0;
    while (i < deb.length && j < acr.length) {
      var x = Math.min(deb[i].v, acr[j].v);
      out.push({ de: deb[i].k, a: acr[j].k, v: Math.round(x * 100) / 100 });
      deb[i].v -= x; acr[j].v -= x;
      if (deb[i].v < 0.01) i++;
      if (acr[j].v < 0.01) j++;
    }
    return out;
  }

  root.Calc = { enSoles: enSoles, partes: partes, carga: carga, cargaDesdePartes: cargaDesdePartes, detalleCarga: detalleCarga, coberturaDe: coberturaDe, esBase: esBase, saldos: saldos, liquidar: liquidar };
  if (typeof module !== 'undefined') module.exports = root.Calc;
})(typeof window !== 'undefined' ? window : globalThis);
