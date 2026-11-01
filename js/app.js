'use strict';
// Phone-first screens for the test cup. Everything a person reads is plain Spanish; every write goes through DemoStore -> real engine.
(function (root) {
  var D = root.DemoStore, doc = root.document;
  var app = doc.getElementById('app'), live = doc.getElementById('aviso'), flash = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fecha(k) { // "2026-11-21T09:00" -> "Sábado 21 de noviembre"
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(k || ''); if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var dia = DIAS[d.getUTCDay()];
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + (+m[3]) + ' de ' + MESES[+m[2] - 1];
  }
  function hora(k) { var m = /T(\d{2}):(\d{2})$/.exec(k || ''); if (!m) return ''; var h = +m[1], ap = h < 12 ? 'a. m.' : 'p. m.'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }
  function cuando(f) { return [hora(f.kickoff), f.pitch].filter(Boolean).join(' · '); }

  function say(msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }

  function teamName(st, id) { return st.teams[id] ? st.teams[id].name : ''; }
  function fixturesSorted(st) { return Object.values(st.fixtures).sort(function (a, b) { return (a.kickoff || '').localeCompare(b.kickoff || '') || a.id.localeCompare(b.id); }); }
  function pending(snap, fid) { return !!(snap.st.reports[fid] && snap.st.reports[fid].length) && !snap.v.validApproved[fid]; }
  function lastReport(snap, fid) { var r = snap.st.reports[fid] || []; return r[r.length - 1]; }
  function yellows(rep) { return (rep.cards || []).filter(function (c) { return c.kind === 'amarilla'; }).length; }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  // Group fixtures by day: [{day, items}]
  function byDay(list) {
    var out = [];
    list.forEach(function (f) { var d = fecha(f.kickoff), last = out[out.length - 1]; if (last && last.day === d) last.items.push(f); else out.push({ day: d, items: [f] }); });
    return out;
  }

  function top(title) {
    return '<header class="barra"><a class="volver" href="#inicio" data-go="inicio">‹ Inicio</a><h1>' + esc(title) + '</h1></header>';
  }
  function bottom() {
    return '<footer class="pie"><button type="button" class="reiniciar" data-act="reiniciar">Reiniciar la prueba</button></footer>';
  }

  // ---------- Inicio ----------
  function inicio() {
    return '<main class="inicio">' +
      '<div class="balon" aria-hidden="true">⚽</div>' +
      '<h1>Copa de prueba</h1>' +
      '<p class="lead">Esto es una prueba con equipos inventados. Toca y prueba.</p>' +
      '<nav class="roles">' +
      '<a class="rol org" href="#organizador" data-go="organizador"><b>Soy el organizador</b><span>Equipos, partidos y aprobar resultados</span></a>' +
      '<a class="rol arb" href="#arbitro" data-go="arbitro"><b>Soy el árbitro</b><span>Anotar goles y tarjetas</span></a>' +
      '<a class="rol fam" href="#familia" data-go="familia"><b>Soy una familia</b><span>Ver la tabla y los resultados</span></a>' +
      '</nav>' +
      '<p class="reglas">Reglas de prueba; las del 21 de noviembre las confirmamos contigo.</p>' +
      '</main>' + bottom();
  }

  // ---------- Árbitro ----------
  function arbitro() {
    var snap = D.snapshot(), st = snap.st, dr = D.drafts();
    var mine = fixturesSorted(st).filter(function (f) { return f.refereeId === D.REF.id; });
    var html = top('Soy el árbitro') + '<main><p class="ayuda">Toca el partido que vas a pitar.</p>';
    byDay(mine).forEach(function (g) {
      html += '<h2 class="dia">' + esc(g.day) + '</h2>';
      g.items.forEach(function (f) {
        var h = teamName(st, f.home), a = teamName(st, f.away), ok = snap.v.validApproved[f.id];
        var estado, abre = false;
        if (ok) estado = '<span class="estado fin">Terminado ' + ok.hg + ' – ' + ok.ag + '</span>';
        else if (pending(snap, f.id)) estado = '<span class="estado espera">Cerrado, falta que lo apruebe el organizador</span>';
        else if (dr[f.id]) { estado = '<span class="estado vivo">En juego</span>'; abre = true; }
        else { estado = '<span class="estado">Por jugar</span>'; abre = true; }
        var inner = '<span class="vs"><b>' + esc(h) + '</b> vs <b>' + esc(a) + '</b></span><span class="cuando">' + esc(cuando(f)) + '</span>' + estado;
        html += abre ? '<a class="partido toca" href="#arbitro/' + esc(f.id) + '" data-go="arbitro/' + esc(f.id) + '">' + inner + '<span class="flecha" aria-hidden="true">›</span></a>'
          : '<div class="partido">' + inner + '</div>';
      });
    });
    return html + '</main>' + bottom();
  }

  function marcador(fid, paso) {
    var snap = D.snapshot(), st = snap.st, f = st.fixtures[fid];
    if (!f) return arbitro();
    var h = teamName(st, f.home), a = teamName(st, f.away);
    if (paso === 'listo') {
      var rep = lastReport(snap, fid) || { hg: 0, ag: 0 };
      return top('Partido cerrado') + '<main class="centro"><div class="check" aria-hidden="true">✓</div>' +
        '<p class="grande">' + esc(h) + ' ' + rep.hg + ' – ' + rep.ag + ' ' + esc(a) + '</p>' +
        '<p>Ya quedó anotado. Ahora el organizador lo revisa y lo aprueba; ahí sale en la tabla para las familias.</p>' +
        '<a class="boton principal" href="#organizador" data-go="organizador">Aprobarlo como organizador</a>' +
        '<a class="boton" href="#familia" data-go="familia">Ver como familia</a>' +
        '<a class="boton" href="#arbitro" data-go="arbitro">Volver a mis partidos</a></main>' + bottom();
    }
    if (snap.v.validApproved[fid] || pending(snap, fid)) return arbitro();
    var d = D.drafts()[fid] || { startedAt: Date.now(), items: [] };
    var count = function (t, side) { return d.items.filter(function (i) { return i.t === t && i.side === side; }).length; };
    var gh = count('gol', 'h'), ga = count('gol', 'a');
    var lado = function (side, name, goles) {
      var am = count('amarilla', side);
      return '<section class="lado" aria-label="' + esc(name) + '"><h2>' + esc(name) + '</h2>' +
        '<div class="goles" data-goles="' + side + '">' + goles + '</div>' +
        '<button type="button" class="boton gol" data-act="gol" data-side="' + side + '">+1 gol</button>' +
        '<button type="button" class="boton amarilla" data-act="amarilla" data-side="' + side + '">Tarjeta amarilla</button>' +
        (am ? '<p class="tarjetas">' + '<span class="tarjeta" aria-hidden="true"></span>'.repeat(am) + ' ' + plural(am, 'amarilla', 'amarillas') + '</p>' : '<p class="tarjetas vacio">Sin tarjetas</p>') +
        '</section>';
    };
    var html = top(h + ' vs ' + a) + '<main><p class="ayuda">' + esc(fecha(f.kickoff)) + ' · ' + esc(cuando(f)) + '</p>' +
      '<div class="tablero">' + lado('h', h, gh) + lado('a', a, ga) + '</div>';
    if (d.items.length) {
      html += '<h2 class="sub">Lo que llevas</h2><ol class="jugadas">' + d.items.map(function (i) {
        var quien = i.side === 'h' ? h : a;
        return '<li>' + (i.t === 'gol' ? '⚽ Gol de ' : '<span class="tarjeta" aria-hidden="true"></span> Amarilla para ') + esc(quien) + '</li>';
      }).join('') + '</ol><button type="button" class="boton" data-act="deshacer">Borrar lo último</button>';
    } else {
      html += '<p class="ayuda">Cuando haya un gol o una tarjeta, toca el botón del equipo.</p>';
    }
    if (paso === 'confirmar') {
      html += '<div class="confirmar" role="alertdialog" aria-labelledby="conf-t"><p id="conf-t" class="grande">¿Cerrar el partido así?</p>' +
        '<p class="grande">' + esc(h) + ' ' + gh + ' – ' + ga + ' ' + esc(a) + '</p>' +
        '<button type="button" class="boton principal" data-act="cerrar-si">Sí, cerrar el partido</button>' +
        '<a class="boton" href="#arbitro/' + esc(fid) + '" data-go="arbitro/' + esc(fid) + '">No, seguir anotando</a></div>';
    } else {
      html += '<a class="boton principal" href="#arbitro/' + esc(fid) + '/confirmar" data-go="arbitro/' + esc(fid) + '/confirmar">Cerrar el partido</a>';
    }
    return html + '</main>' + bottom();
  }

  // ---------- Familia ----------
  function tabla(pub) {
    var rows = (pub.tables.A || []);
    return '<table class="tabla"><caption>Tabla de posiciones</caption><thead><tr><th scope="col">#</th><th scope="col" class="eq">Equipo</th>' +
      '<th scope="col" title="Partidos jugados">PJ</th><th scope="col" title="Ganados">G</th><th scope="col" title="Empatados">E</th><th scope="col" title="Perdidos">P</th>' +
      '<th scope="col" title="Diferencia de goles">DG</th><th scope="col" title="Puntos">Pts</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + r.position + '</td><th scope="row" class="eq">' + esc(r.team) + '</th><td>' + r.played + '</td><td>' + r.won + '</td><td>' + r.drawn + '</td><td>' + r.lost + '</td><td>' +
          (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pts">' + (r.points == null ? '' : r.points) + '</td></tr>';
      }).join('') + '</tbody></table><p class="nota">PJ jugados · G ganados · E empatados · P perdidos · DG diferencia de goles</p>';
  }
  function familia() {
    var snap = D.snapshot(), pub = snap.pub;
    var played = pub.fixtures.filter(function (f) { return f.result; });
    var html = top('Soy una familia') + '<main>' + tabla(pub);
    html += '<h2 class="sub">Resultados</h2>';
    var porConfirmar = pub.fixtures.filter(function (f) { return !f.result && pending(snap, f.id); });
    if (!played.length && !porConfirmar.length) html += '<p class="ayuda">Todavía no hay resultados.</p>';
    porConfirmar.forEach(function (f) {
      html += '<div class="resultado"><span class="eq local">' + esc(f.home) + '</span><span class="score vs-chico">vs</span><span class="eq visita">' + esc(f.away) + '</span>' +
        '<span class="estado espera">Ya se jugó. El resultado sale aquí cuando lo apruebe el organizador.</span></div>';
    });
    played.sort(function (a, b) { return (b.kickoff || '').localeCompare(a.kickoff || ''); }).forEach(function (f) {
      html += '<div class="resultado"><span class="eq local">' + esc(f.home) + '</span><span class="score">' + f.result.hg + ' – ' + f.result.ag + '</span><span class="eq visita">' + esc(f.away) + '</span>' +
        '<span class="cuando">' + esc(fecha(f.kickoff)) + '</span></div>';
    });
    var next = pub.fixtures.filter(function (f) { return !f.result && !pending(snap, f.id); }).sort(function (a, b) { return (a.kickoff || '').localeCompare(b.kickoff || '') || a.id.localeCompare(b.id); });
    if (next.length) {
      html += '<h2 class="sub">Próximos partidos</h2>';
      byDay(next).forEach(function (g) {
        html += '<h3 class="dia">' + esc(g.day) + '</h3>';
        g.items.forEach(function (f) {
          html += '<div class="partido"><span class="vs"><b>' + esc(f.home) + '</b> vs <b>' + esc(f.away) + '</b></span><span class="cuando">' + esc(cuando(f)) + '</span></div>';
        });
      });
    }
    return html + '</main>' + bottom();
  }

  // ---------- Organizador ----------
  function organizador() {
    var snap = D.snapshot(), st = snap.st;
    var html = top('Soy el organizador') + '<main>';
    if (flash) { html += '<div class="hecho" role="status"><p class="grande">✓ ' + esc(flash) + '</p><p>Ya sale en la tabla.</p><a class="boton principal" href="#familia" data-go="familia">Verlo como familia</a></div>'; flash = null; }
    var porAprobar = fixturesSorted(st).filter(function (f) { return pending(snap, f.id); });
    html += '<h2 class="sub">Resultados por aprobar</h2>';
    if (!porAprobar.length) html += '<p class="ayuda">No hay nada por aprobar. Cuando el árbitro cierre un partido, aparece aquí.</p>';
    porAprobar.forEach(function (f) {
      var rep = lastReport(snap, f.id), am = yellows(rep);
      html += '<div class="aprobar"><p class="grande">' + esc(teamName(st, f.home)) + ' ' + rep.hg + ' – ' + rep.ag + ' ' + esc(teamName(st, f.away)) + '</p>' +
        '<p class="cuando">' + esc(fecha(f.kickoff)) + ' · ' + esc(cuando(f)) + (am ? ' · ' + plural(am, 'amarilla', 'amarillas') : '') + '</p>' +
        '<p>Lo anotó el árbitro. Si está bien, apruébalo y sale en la tabla.</p>' +
        '<button type="button" class="boton principal" data-act="aprobar" data-fid="' + esc(f.id) + '">Aprobar resultado</button></div>';
    });
    var teams = Object.values(st.teams);
    html += '<h2 class="sub">Equipos (' + teams.length + ')</h2><ul class="equipos">' + teams.map(function (t) { return '<li>' + esc(t.name) + '</li>'; }).join('') + '</ul>';
    html += '<h2 class="sub">Calendario</h2>';
    byDay(fixturesSorted(st)).forEach(function (g) {
      html += '<h3 class="dia">' + esc(g.day) + '</h3>';
      g.items.forEach(function (f) {
        var ok = snap.v.validApproved[f.id];
        var estado = ok ? '<span class="estado fin">Terminado ' + ok.hg + ' – ' + ok.ag + '</span>' : pending(snap, f.id) ? '<span class="estado espera">Por aprobar</span>' : '<span class="estado">Por jugar</span>';
        html += '<div class="partido"><span class="vs"><b>' + esc(teamName(st, f.home)) + '</b> vs <b>' + esc(teamName(st, f.away)) + '</b></span><span class="cuando">' + esc(cuando(f)) + '</span>' + estado + '</div>';
      });
    });
    return html + '</main>' + bottom();
  }

  // ---------- Reiniciar ----------
  function reiniciar() {
    return top('Reiniciar la prueba') + '<main class="centro"><p class="grande">¿Volver a empezar la prueba?</p>' +
      '<p>Se borra lo que anotaste y todo queda como al principio.</p>' +
      '<button type="button" class="boton principal" data-act="reiniciar-si">Sí, volver a empezar</button>' +
      '<a class="boton" href="#inicio" data-go="inicio">No, dejarlo así</a></main>';
  }

  // ---------- Router ----------
  function route() { return (root.location.hash || '#inicio').slice(1) || 'inicio'; }
  function render() {
    D.load();
    var r = route().split('/');
    var html;
    if (r[0] === 'arbitro' && r[1]) html = marcador(r[1], r[2]);
    else if (r[0] === 'arbitro') html = arbitro();
    else if (r[0] === 'familia') html = familia();
    else if (r[0] === 'organizador') html = organizador();
    else if (r[0] === 'reiniciar') html = reiniciar();
    else html = inicio();
    app.innerHTML = html;
    app.setAttribute('data-pantalla', r[0]);
  }
  function go(where) { if (root.location.hash === '#' + where) render(); else root.location.hash = where; root.scrollTo(0, 0); }

  function minuteOf(d) { return Math.min(130, Math.max(1, Math.floor((Date.now() - d.startedAt) / 60000) + 1)); }
  app.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-go]');
    if (a) { ev.preventDefault(); go(a.getAttribute('data-go')); return; }
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act'), r = route().split('/');
    if (act === 'reiniciar') { go('reiniciar'); return; }
    if (act === 'reiniciar-si') { D.reset(); go('inicio'); say('Listo, la prueba volvió a empezar.'); return; }
    if ((act === 'gol' || act === 'amarilla' || act === 'deshacer') && r[0] === 'arbitro' && r[1]) {
      var all = D.drafts(), d = all[r[1]] || { startedAt: Date.now(), items: [] };
      if (act === 'deshacer') d.items.pop(); else d.items.push({ t: act, side: b.getAttribute('data-side'), minute: minuteOf(d) });
      D.setDraft(r[1], d); render();
      var st = D.snapshot().st, f = st.fixtures[r[1]];
      if (act === 'gol') say('Gol de ' + teamName(st, b.getAttribute('data-side') === 'h' ? f.home : f.away));
      else if (act === 'amarilla') say('Amarilla para ' + teamName(st, b.getAttribute('data-side') === 'h' ? f.home : f.away));
      else say('Se borró lo último');
      return;
    }
    if (act === 'cerrar-si' && r[0] === 'arbitro' && r[1]) {
      var res = D.closeMatch(r[1]);
      if (res.ok) go('arbitro/' + r[1] + '/listo'); else say('No se pudo cerrar. Intenta otra vez.');
      return;
    }
    if (act === 'aprobar') {
      var fid = b.getAttribute('data-fid'), ok = D.approve(fid);
      if (ok.ok) { var s2 = D.snapshot(), f2 = s2.st.fixtures[fid], rp = s2.v.validApproved[fid];
        flash = 'Aprobado: ' + teamName(s2.st, f2.home) + ' ' + rp.hg + ' – ' + rp.ag + ' ' + teamName(s2.st, f2.away);
        var msg = flash; render(); root.scrollTo(0, 0); say(msg + '. Ya sale en la tabla.'); }
      else say('No se pudo aprobar. Intenta otra vez.');
    }
  });
  root.addEventListener('hashchange', render);
  root.addEventListener('storage', function (e) { if (e.key === D.LS_LOG || e.key === D.LS_DRAFT) render(); });
  render();
})(window);
