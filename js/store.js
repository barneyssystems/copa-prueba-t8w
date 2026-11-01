'use strict';
// In-browser store that replaces the Node server for the demo. Same write path as server/app.js commit():
//   replay(log) -> rules.checkEvent -> state.append (HMAC chain) -> persist.
// Persists to localStorage on THIS device only. Nothing leaves the phone.
(function (root) {
  var E = root.TournamentEngine, S = E.state, R = E.rules;
  var KEY = 'copa-de-prueba-solo-en-este-telefono';
  var LS_LOG = 'copaPrueba.v1.log', LS_DRAFT = 'copaPrueba.v1.borradores';
  var ORG = { role: 'organizador', id: 'org1' }, REF = { role: 'arbitro', id: 'arb1' };

  // Storage with a coherent in-memory shadow (review D207-R1-01). Every write lands in the shadow first. The first time a read or write of
  // localStorage fails (blocked, full, private mode), the WHOLE store switches to memory for the rest of this page: from then on every read
  // comes from the shadow, so a write that could not be saved is never undone by an older value still readable from localStorage.
  var KEYS = [LS_LOG, LS_DRAFT], shadow = Object.create(null), memOnly = false;
  function has(k) { return Object.prototype.hasOwnProperty.call(shadow, k); }
  function enterMem(justWritten) {
    if (memOnly) return;
    KEYS.forEach(function (k) { // carry over the other keys' current values, if they can still be read
      if (k === justWritten) return;
      try { var v = root.localStorage.getItem(k); if (v != null) shadow[k] = v; } catch (e) { /* keep last known shadow value */ }
    });
    memOnly = true;
  }
  function lsGet(k) {
    if (memOnly) return has(k) ? shadow[k] : null;
    try { var v = root.localStorage.getItem(k); if (v != null) shadow[k] = v; else delete shadow[k]; return v; }
    catch (e) { enterMem(null); return has(k) ? shadow[k] : null; }
  }
  function lsSet(k, v) {
    shadow[k] = v;
    if (memOnly) return;
    try { root.localStorage.setItem(k, v); } catch (e) { enterMem(k); }
  }

  var TEAMS = [['leones', 'Leones'], ['toros', 'Toros'], ['halcones', 'Halcones'], ['condores', 'Cóndores']];
  var FIXTURES = [
    ['p1', 'leones', 'toros', '2026-11-21T09:00', 'Cancha 1'],
    ['p2', 'halcones', 'condores', '2026-11-21T09:00', 'Cancha 2'],
    ['p3', 'leones', 'halcones', '2026-11-28T09:00', 'Cancha 1'],
    ['p4', 'toros', 'condores', '2026-11-28T09:00', 'Cancha 2'],
    ['p5', 'leones', 'condores', '2026-12-05T09:00', 'Cancha 1'],
    ['p6', 'toros', 'halcones', '2026-12-05T09:00', 'Cancha 2'],
  ];

  function commitTo(log, type, actor, payload, ts) {
    var st = S.replay(log);
    var bad = R.checkEvent(st, type, actor, payload, log.length + 1);
    if (bad) return { error: bad.error, detail: bad.detail };
    var next = log.slice();
    var e = S.append(next, type, actor, payload, ts || new Date().toISOString(), KEY);
    return { log: next, e: e };
  }

  function buildSeed() {
    var log = [], t = 0;
    function ts() { t++; return '2026-10-31T12:' + String(t).padStart(2, '0') + ':00.000Z'; }
    function add(type, actor, payload) {
      var r = commitTo(log, type, actor, payload, ts());
      if (r.error) throw new Error('seed: ' + type + ' ' + r.error + ' ' + (r.detail || ''));
      log = r.log; return r.e;
    }
    add('TOURNAMENT_SET', ORG, { name: 'Copa de prueba', date: '2026-11-21' });
    add('RULES_SET', ORG, { points: { win: 3, draw: 1, loss: 0 }, tiebreak: ['gd', 'gf', 'h2h_points', 'sorteo'], walkoverGoals: 3, qualifiersPerGroup: 2 });
    TEAMS.forEach(function (x) { add('TEAM_ADDED', ORG, { id: x[0], name: x[1], groupId: 'A' }); });
    FIXTURES.forEach(function (f) { add('FIXTURE_ADDED', ORG, { id: f[0], stage: 'group', groupId: 'A', home: f[1], away: f[2], refereeId: REF.id, kickoff: f[3], pitch: f[4] }); });
    // One match already played and approved: Halcones 2 - 1 Cóndores.
    var rep = add('REPORT_SUBMITTED', REF, { fixtureId: 'p2', participants: { home: 'halcones', away: 'condores' },
      report: { hg: 2, ag: 1, goals: [{ side: 'h', minute: 12 }, { side: 'a', minute: 31 }, { side: 'h', minute: 67 }], cards: [{ side: 'a', kind: 'amarilla', minute: 40 }] } });
    add('REPORT_APPROVED', ORG, { fixtureId: 'p2', version: rep.seq });
    return log;
  }

  var log = null;
  function load() {
    var raw = lsGet(LS_LOG), parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    if (parsed && R.validateLog(parsed, KEY).ok) { log = parsed; return; }
    reset();
  }
  function save() { lsSet(LS_LOG, JSON.stringify(log)); }
  function reset() { log = buildSeed(); save(); lsSet(LS_DRAFT, '{}'); }

  function commit(type, actor, payload) {
    load(); // re-read: another tab on the same phone may have written
    var r = commitTo(log, type, actor, payload);
    if (r.error) return r;
    log = r.log; save();
    return { ok: true, seq: r.e.seq };
  }

  function snapshot() {
    var st = S.replay(log), v = S.view(st);
    return { st: st, v: v, pub: E.public.publicView(st, v) };
  }

  // Referee draft (match in progress), kept apart from the official log until the referee closes the match.
  function drafts() { try { return JSON.parse(lsGet(LS_DRAFT) || '{}') || {}; } catch (e) { return {}; } }
  function setDraft(fid, d) { var all = drafts(); if (d) all[fid] = d; else delete all[fid]; lsSet(LS_DRAFT, JSON.stringify(all)); }

  function closeMatch(fid) {
    var snap = snapshot(), f = snap.st.fixtures[fid], d = drafts()[fid] || { items: [] };
    var participants = S.participantsOf(snap.st, f, snap.v.bracketById);
    var goals = d.items.filter(function (i) { return i.t === 'gol'; }).map(function (i) { return { side: i.side, minute: i.minute }; });
    var cards = d.items.filter(function (i) { return i.t === 'amarilla'; }).map(function (i) { return { side: i.side, kind: 'amarilla', minute: i.minute }; });
    var report = { hg: goals.filter(function (g) { return g.side === 'h'; }).length, ag: goals.filter(function (g) { return g.side === 'a'; }).length, goals: goals, cards: cards };
    var r = commit('REPORT_SUBMITTED', REF, { fixtureId: fid, report: report, participants: participants });
    if (r.ok) setDraft(fid, null);
    return r;
  }
  function approve(fid) {
    var reps = snapshot().st.reports[fid] || [];
    if (!reps.length) return { error: 'sin_reporte' };
    return commit('REPORT_APPROVED', ORG, { fixtureId: fid, version: reps[reps.length - 1].version });
  }

  load();
  root.DemoStore = { load: load, reset: reset, snapshot: snapshot, drafts: drafts, setDraft: setDraft, closeMatch: closeMatch, approve: approve,
    REF: REF, ORG: ORG, LS_LOG: LS_LOG, LS_DRAFT: LS_DRAFT, _log: function () { return log; }, _key: KEY, _memoryOnly: function () { return memOnly; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
