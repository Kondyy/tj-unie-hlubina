/* TJ Unie Hlubina – 2/5 data: Model, notifikace, přihlášení, Sync (načítání, ukládání, Realtime). */
/* =====================================================================
   5. Model – dotazy nad daty (nic nevykresluje, jen odpovídá)
   ===================================================================== */
class Model {
  static member(name)    { return DB.members.find(m => m.n == name); }
  static byId(id)        { return DB.members.find(m => m.id == id); }
  static team(kid)       { const m = Model.member(kid); return m ? m.t : ''; }
  static membersOf(team) { return DB.members.filter(m => m.t == team); }
  static event(id)       { return DB.events.find(e => e.id == id); }
  /** Docházka trenéra na tréninky: {p: přítomen, t: celkem, pct, abs: [data absencí od nejnovější]}.
   *  Počítají se tréninky s potvrzeným „přijdu“ / „nemohu“ a navíc proběhlé tréninky jeho kategorie
   *  (zapsaná docházka hráčů), kde účast nepotvrdil – ty se počítají jako absence, aby nechyběly v celkovém počtu. */
  static coachStats(uid) {
    const u0 = DB.users[uid] || {}; let p = u0.ap || 0, t = u0.at || 0; const abs = [];      // dosavadní docházka z importu + potvrzené tréninky
    Object.keys(DB.coachAtt).forEach(k => {
      if (!k.startsWith(uid + '|')) return;
      const ev = DB.coachEv[k] || {k: 't', d: ''};
      if (ev.k != 't') return;
      t++; if (DB.coachAtt[k] == 'y') p++; else abs.push(ev.d);
    });
    if (u0.r == 'c' && u0.team) {
      const held = new Set(Object.keys(DB.att).map(k => k.slice(0, k.indexOf('|'))));          // tréninky, kde se zapsala docházka hráčů
      DB.pastT.forEach(e => { if (e.tm == u0.team && held.has(String(e.id)) && !DB.coachAtt[uid + '|' + e.id]) { t++; abs.push(e.d); } });
    }
    abs.sort().reverse();
    return {p, t, pct: t ? Math.round(p / t * 100) : 0, abs};
  }
  /** Příjmení trenérů, kteří potvrdili účast na události (bez potvrzení: příjmení určeného trenéra). */
  static coachSurnames(e) {
    const L = Object.keys(DB.coachAtt).filter(k => DB.coachAtt[k] == 'y' && k.slice(k.indexOf('|') + 1) == String(e.id)).map(k => DB.coachNm[k]).filter(Boolean);
    return [...new Set(L)].sort((a, b) => a.localeCompare(b, 'cs')).join(', ') || Util.surname(e.c);
  }
  static eventsOf(team)  { return DB.events.filter(e => e.tm == team).sort((a, b) => a.d - b.d); }

  /** Dluh člena v Kč (součet nezaplacených příspěvků). */
  static debt(m) { return DB.payItems.reduce((s, x, i) => s + (m.p[i] ? 0 : x.a), 0); }

  /** Kategorie, do jejichž chatu uživatel patří (rodič = kategorie dětí, trenér = svoje, vedení = žádná). */
  /** Trenér nebo správce (ten pracuje za trenéra zvolené kategorie). */
  static coachLike(u) { return u.r == 'c' || u.r == 'a'; }
  /** Vedení nebo správce. */
  static mgmt(u) { return u.r == 'v' || u.r == 'a'; }
  static teamsOf(u) { return u.r == 'p' ? [...new Set(u.kids.map(k => Model.team(k)).filter(Boolean))] : Model.coachLike(u) ? [u.team] : []; }
  /** Oprávnění: smí uživatel psát do chatu kategorie? */
  static canChat(u, team) { return Model.teamsOf(u).includes(team) || (Model.coachLike(u) && team == 'T-' + u.team); }   // 'T-U9' = interní chat trenérů

  /** Zprávy chatu kategorie (vytvoří prázdný chat, pokud ještě neexistuje). */
  static chat(team) {
    const L = DB.chats[team] || (DB.chats[team] = []), d = (DB.chatDays || {})[team.replace(/^T-/, '')];
    if (!d) return L;
    const min = Date.now() - d * 864e5, i = L.findIndex(m => !(m.ts < min));   // starší zprávy skryje hned (v databázi je smaže noční úklid)
    if (i > 0) L.splice(0, i); else if (i < 0 && L.length) L.length = 0;
    return L;
  }
  /** Zprávy od klubu, které uživatel smí vidět (hromadné, trenérské, osobní). */
  static inbox(u) {
    return DB.messages.filter(m => m.fid != u.id &&
      (m.kind == 'all' || (m.kind == 'trainers' && Model.coachLike(u)) || (m.kind == 'user' && m.to == u.id)));
  }
  static unreadChat(u, team) { const s = DB.seen[team] || 0; return Model.chat(team).filter(m => m.id > s && m.fid != u.id).length; }
  static unreadInbox(u)      { const s = DB.seen.inbox || 0; return Model.inbox(u).filter(m => m.id > s).length; }
  /** Konverzace soukromých zpráv: [{id, name, last, unread, msgs}] od nejnovější. */
  static dmThreads(u) {
    const by = {};
    DB.dm.forEach(m => { const pid = m.fid == u.id ? m.tid : m.fid; (by[pid] = by[pid] || {id: pid, name: m.fid == u.id ? m.tn : m.fn, msgs: []}).msgs.push(m); });
    return Object.values(by).map(t => { t.last = t.msgs[t.msgs.length - 1]; t.unread = t.msgs.filter(m => m.fid != u.id && m.id > (DB.seen['dm:' + t.id] || 0)).length; return t; })
      .sort((a, b) => b.last.id - a.last.id);
  }
  static unreadDm(u)         { return Model.dmThreads(u).reduce((s, t) => s + t.unread, 0); }
  static unreadAll(u)        { return Model.unreadDm(u) + Model.teamsOf(u).reduce((s, t) => s + Model.unreadChat(u, t), 0) + (Model.coachLike(u) ? Model.unreadChat(u, 'T-' + u.team) : 0) + Model.unreadInbox(u); }

  /** Docházka hráče v %: základ z minulosti + vše, co trenér označil v aplikaci. */
  /** [počet účastí, počet tréninků] hráče (historie + označené tréninky). */
  static attCount(m) {
    let p = m.a[0], t = m.a[1];
    Object.entries(DB.att).forEach(([k, v]) => { if (k.slice(k.indexOf('|') + 1) == m.n) { t++; if (v == 'P') p++; } });
    return [p, t];
  }
  /** Součty z celé zaznamenané docházky hráče: {p: přítomen, o: omluven, n: neomluven, t: celkem}. */
  static attStates(m) {
    const r = {p: m.a[0], o: Math.max(0, m.a[1] - m.a[0]), n: 0, t: m.a[1]};          // starší historie nezná důvod absence → počítá se jako omluvená
    Object.entries(DB.att).forEach(([k, v]) => { if (k.slice(k.indexOf('|') + 1) != m.n) return; r.t++; if (v == 'P') r.p++; else if (v == 'O') r.o++; else if (v == 'N') r.n++; });
    return r;
  }
  static attPct(m) {
    const [p, t] = Model.attCount(m);
    return t ? Math.round(p / t * 100) : 0;
  }
  /** Doplní chybějící pole profilu hráče výchozími hodnotami (kvůli importu z Excelu). */
  static fillProfile(m) {
    const d = {full:m.n, no:'', by:'', par:[{n:'',ph:'',em:''}], al:'', lim:'', tn:'', mp:0, gl:0};
    for (const k in d) if (m[k] === undefined) m[k] = d[k];
    return m;
  }
}


/* =====================================================================
   6. Notifs – notifikace (zvonek v hlavičce)
   ===================================================================== */
class Notifs {
  /** Odešle notifikaci přes databázi. Adresát (aud): a všem · T všem trenérům · V vedení ·
      C trenérům kategorie (extra.team) · P rodičům kategorie (extra.team) · K rodičům dítěte (extra.kid) · U jednomu uživateli (extra.to). */
  static send(aud, text, extra) { return Sync.notify(Object.assign({aud, text}, extra)); }
  /** Seznam už databáze omezila jen na notifikace určené tomuto uživateli; vlastní odeslané se nezobrazují. */
  static forUser(n, u) { return n.by != u.id; }
  /** Přečtení se eviduje zvlášť pro každého uživatele (kvůli hromadným zprávám). */
  static isRead(n, u)   { return !!(n.rd && n.rd[u.id]); }
  static markRead(n, u) { if (Notifs.isRead(n, u)) return; (n.rd = n.rd || {})[u.id] = 1; Sync.queueRead(n.id); }
  static markAllRead()  { DB.notifs.forEach(n => { if (Notifs.forUser(n, UI.user)) Notifs.markRead(n, UI.user); }); App.render(); }
  /** Seznam dvojic [notifikace, id] pro uživatele (nejnovější první). */
  static list(u) { return DB.notifs.filter(n => Notifs.forUser(n, u)).map(n => [n, n.id]); }

  /** Klik na notifikaci: označí jako přečtenou a otevře odpovídající záložku (u rodiče i správné dítě). */
  static open(id) {
    const n = DB.notifs.find(x => x.id == id), u = UI.user;
    if (!n) return;
    Notifs.markRead(n, u);
    if (n.tab && TABS[u.r].some(t => t.id == n.tab)) {
      UI.tab = n.tab;
      if (n.sub) UI.chatSub = n.sub;
      if (n.sub == 'dm' && n.by) UI.dmWith = n.by;
      if (u.r == 'p') {
        if (n.team) { UI.chatTeam = n.team; const k = u.kids.find(k => Model.team(k) == n.team); if (k) UI.kid = k; }
        if (n.kid && u.kids.includes(n.kid)) { UI.kid = n.kid; UI.chatTeam = Model.team(n.kid); }
      }
    }
    UI.bell = false;
    App.render();
  }

  /** HTML panelu notifikací. */
  static panel(u, list) {
    return `<div class="panel glass"><div class="pay"><b>Notifikace</b><button class="chip" style="flex:none" onclick="Notifs.markAllRead()">Označit přečtené</button></div>
      ${list.map(([n, i]) => `<div class="nt ${Notifs.isRead(n, u) ? '' : 'un'}" onclick="Notifs.open(${i})">${esc(n.x)}</div>`).join('') || '<div class="mut">Nic nového.</div>'}</div>`;
  }
}


/* =====================================================================
   7. Auth – přihlášení e-mailem a heslem (Supabase Auth)
   Účty zakládá správce v záložce Uživatelé – registrace "zvenku" není povolena.
   ===================================================================== */
class Auth {
  /** HTML přihlašovací obrazovky. */
  static view() {
    if (UI.boot) return `<div class="wrap" style="max-width:440px;padding-top:12vh"><div class="hero"><img class="lg" src="${LOGO}" alt="${CLUB}"><div><b style="font-size:20px">${CLUB}</b><div class="mut">Načítám…</div></div></div></div>`;
    return `<div class="wrap" style="max-width:440px;padding-top:8vh">
      <div class="hero"><img class="lg" src="${LOGO}" alt="${CLUB}"><div><b style="font-size:20px">${CLUB}</b><div class="mut">Klubový systém · pilotní provoz U9</div></div></div>
      <form class="card" onsubmit="Auth.login();return false">
        <b>Přihlášení</b>
        ${SUPABASE_KEY.startsWith('YOUR_') ? '<div class="warn">⚠ V kódu doplňte SUPABASE_KEY (Supabase → Project Settings → API → publishable key).</div>' : ''}
        <label class="mut">E-mail<input id="lg-email" type="email" autocomplete="username" placeholder="vas@email.cz" required></label>
        <label class="mut">Heslo<span class="pw"><input id="lg-pass" type="password" autocomplete="current-password" required><button type="button" class="eye" id="lg-eye" onclick="Auth.peek()" aria-label="Zobrazit heslo" title="Zobrazit / skrýt heslo">👁</button></span></label>
        <label class="keep"><input type="checkbox" id="lg-keep" ${authStorage.keep() ? 'checked' : ''}> Zůstat přihlášený</label>
        ${Captcha.html()}
        ${UI.authMsg ? `<div class="warn">${esc(UI.authMsg)}</div>` : ''}
        <button class="btn ok" id="lg-btn" type="submit" style="width:100%;margin-top:10px">Přihlásit se</button>
        <div class="mut" style="margin-top:10px">Přihlašovací údaje vám vytvořil správce klubu. <a href="#" onclick="Auth.forgot();return false" style="color:var(--ac,#6ee7b7)">Zapomněli jste heslo?</a></div>
        ${UI.authInfo ? `<div class="cg" style="margin-top:6px">${esc(UI.authInfo)}</div>` : ''}
      </form></div>`;
  }

  /** Při startu: je už někdo přihlášený (uložená relace)? */
  static async init() {
    App.render();
    if (/type=recovery/.test(location.hash)) UI.recovery = true;           // návrat z e-mailu „zapomenuté heslo“
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) await Sync.boot(data.session.user.id);
      else { UI.boot = false; App.render(); }
    } catch (e) { UI.boot = false; UI.authMsg = 'Nepodařilo se spojit se serverem.'; App.render(); }
    Captcha.init(); ErrLog.init();
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && UI.user) Auth.reset(); if (ev === 'PASSWORD_RECOVERY') { UI.recovery = true; if (UI.user) App.render(); } });
    Push.init();
  }

  /** Zobrazí / skryje zadané heslo. */
  static peek() { const i = $('#lg-pass'); if (i) i.type = i.type == 'password' ? 'text' : 'password'; }
  static async login() {
    const email = ($('#lg-email').value || '').trim(), password = $('#lg-pass').value || '';
    try { localStorage.setItem(KEEP_KEY, $('#lg-keep') && !$('#lg-keep').checked ? '0' : '1'); } catch (e) {}
    if (!email || !password) return;
    if (Captcha.need()) { UI.skipKeep = ['lg-pass']; return App.render(); }
    $('#lg-btn').disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({email, password, options: Captcha.opts()});
    Captcha.reset();
    if (error || !data || !data.user) {
      UI.authMsg = error && /invalid login|credentials/i.test(error.message) ? 'Nesprávný e-mail nebo heslo.'
                 : error && /api key/i.test(error.message) ? 'Neplatný SUPABASE_KEY v kódu aplikace.'
                 : error && /captcha/i.test(error.message) ? 'Ověření „nejsem robot“ se nezdařilo – zkuste to znovu.' : (error ? error.message : 'Přihlášení se nezdařilo.');
      UI.skipKeep = ['lg-pass'];
      return App.render();
    }
    UI.authMsg = ''; UI.authInfo = '';
    await Sync.boot(data.user.id);
  }

  /** Pošle e-mail s odkazem pro nastavení nového hesla. */
  static async forgot() {
    const email = ($('#lg-email').value || '').trim();
    if (!email) { UI.authMsg = 'Napište výše svůj e-mail a klikněte znovu na „Zapomněli jste heslo?“.'; UI.authInfo = ''; UI.skipKeep = ['lg-pass']; return App.render(); }
    if (Captcha.need()) { UI.authInfo = ''; UI.skipKeep = ['lg-pass']; return App.render(); }
    const { error } = await sb.auth.resetPasswordForEmail(email, Object.assign({redirectTo: location.origin + location.pathname}, Captcha.opts()));
    Captcha.reset();
    UI.authMsg = error ? (/rate|seconds/i.test(error.message) ? 'Příliš brzy – zkuste to za minutu.' : error.message) : '';
    UI.authInfo = error ? '' : 'Pokud účet s tímto e-mailem existuje, poslali jsme na něj odkaz pro nastavení nového hesla.';
    UI.skipKeep = ['lg-pass'];
    App.render();
  }

  static async logout() { try { await sb.auth.signOut(); } catch (e) {} Photos.clear(); Offline.clear(); Auth.reset(); }

  /** Vyčistí paměť aplikace a vrátí přihlašovací obrazovku. */
  static reset() {
    Sync.stop();
    Object.assign(DB, {users:{}, members:[], docs:{}, events:[], results:[], payItems:[], plan:[], messages:[], chats:{}, notifs:[], links:[], settings:{}, dm:[], dmContacts:[], tcoaches:[], aper:[], calTok:undefined,
                       att:{}, coachAtt:{}, coachNm:{}, coachEv:{}, pastT:[], nominations:{}, carpool:{}, responses:{}, notes:{}, seen:{},
                       venues:[], ecom:{}, eplans:{}, ttpl:[], tpls:[], cpool:{}, cpPeers:{}, subPl:null});
    UI.user = null; UI.asTeam = ''; UI.imp = null; UI.recovery = false; UI.more = false; UI.bell = false; UI.modal = null; UI.profile = false; UI.profMsg = ''; UI.pkSel = {}; UI.player = ''; UI.boot = false; UI.kid = ''; UI.editUser = ''; UI.dmWith = ''; UI.dmSearch = ''; UI.ai = null; UI.calTok = undefined; UI.calMsg = '';
    UI.offlineAt = 0; UI.usage = undefined; UI.errs = undefined; UI.subEvent = 0; UI.ecOpen = 0; UI.kidEdit = false;
    UI.skipKeep = ['lg-pass', 'lg-email'];
    App.render();
  }
}


/* =====================================================================
   7b. Sync – načítání a ukládání dat do Supabase + Realtime
   Pravidlo: akce v modulech nejdřív upraví paměť (DB), pak zavolají Sync.* a překreslí stránku.
   Když uložení selže, ukáže se hlášení a data se znovu načtou ze serveru.
   ===================================================================== */
class Sync {
  static me = '';                 // id přihlášeného uživatele
  static ch = null;               // kanál Realtime
  static pending = 0;             // rozepsané / probíhající zápisy (během nich se nenačítá zpět ze serveru)
  static timers = {};             // odložené ukládání karet hráčů (podle id hráče)
  static reloads = new Set();     // co je třeba znovu načíst
  static reloadTimer = 0;
  static readQ = new Set();       // notifikace čekající na zapsání "přečteno"
  static readTimer = 0;
  static subscribed = false;

  // ---------- start a konec ----------
  /** Po přihlášení: načte data, nastaví výchozí pohled a spustí Realtime. */
  static async boot(uid) {
    UI.boot = true; Sync.me = uid; App.render();
    if (!navigator.onLine && Offline.load(uid)) { Sync.start(DB.users[uid]); UI.boot = false; return App.render(); }   // bez internetu hned z uložených dat
    try {
      await Sync.loadAll();
      const u = DB.users[uid];
      if (!u) throw new Error('Váš účet nemá profil. Kontaktujte správce klubu.');
      UI.offlineAt = 0; Sync.start(u);
      Sync.subscribe();
      setTimeout(() => Photos.migrate(), 1500);
      Offline.save(); OfflineQ.flush();
    } catch (e) {
      console.error(e);
      if (OfflineQ.isNet(e) && Offline.load(uid)) { Sync.start(DB.users[uid]); UI.boot = false; return App.render(); }   // bez internetu: poslední uložená data
      try { await sb.auth.signOut(); } catch (x) {}
      Auth.reset(); UI.authMsg = 'Načtení dat se nezdařilo: ' + (e.message || e);
    }
    UI.boot = false; App.render();
  }

  /** Výchozí pohled po přihlášení; záložku lze předat v adrese (?tab=att – zástupci ikony aplikace). */
  static start(u) {
    UI.user = u; UI.tab = TABS[u.r][0].id; UI.chatSub = 'team'; UI.bell = false; UI.player = ''; UI.attEvent = 0; UI.matchEvent = 0; UI.modal = null; UI.subEvent = 0;
    if (u.r == 'p') { UI.kid = u.kids[0] || ''; UI.chatTeam = UI.kid ? Model.team(UI.kid) : ''; }
    const qt = new URLSearchParams(location.search).get('tab');
    if (qt && TABS[u.r].some(t => t.id == qt)) UI.tab = qt;
    else if (qt == 'att' && TABS[u.r].some(t => t.id == 'cal')) UI.tab = 'cal';             // rodič z ikony „Tréninky“ → Přehled
    if (qt) try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }

  static stop() {
    if (Sync.ch) { try { sb.removeChannel(Sync.ch); } catch (e) {} Sync.ch = null; }
    Object.values(Sync.timers).forEach(clearTimeout); Sync.timers = {};
    clearTimeout(Sync.reloadTimer); Sync.reloads.clear(); Sync.readQ.clear(); Sync.pending = 0; Sync.subscribed = false;
  }

  static async loadAll() {
    await Sync.loaders.teams();                                     // kategorie (pro výběry a správce)
    await Sync.loaders.players();                                   // ostatní části potřebují jména hráčů
    await Promise.all(Object.entries(Sync.loaders).filter(([k]) => k != 'players' && k != 'teams').map(([, f]) => f()));
  }

  // ---------- načítání ----------
  /** Stránkované načtení celé tabulky (Supabase vrací max. 1000 řádků na dotaz). */
  static async fetchAll(table, build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(sb.from(table).select('*')).range(from, from + 999);
      if (error) throw new Error(table + ': ' + error.message);
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  static async last(table, n, col) {          // posledních n řádků v chronologickém pořadí
    const { data, error } = await sb.from(table).select('*').order(col || 'id', {ascending: false}).limit(n);
    if (error) throw new Error(table + ': ' + error.message);
    return data.reverse();
  }

  static loaders = {
    /** Kategorie klubu (tabulka teams; když tabulka ještě není, zůstanou výchozí) */
    teams: async () => {
      const { data, error } = await sb.from('teams').select('*').order('sort').order('name');
      if (!error && data.length) { CONFIG.planner.teams = data.map(t => t.name); DB.chatDays = Object.fromEntries(data.map(t => [t.name, t.chat_days ?? 0])); }
    },
    /** Veřejná nastavení klubu: číslo účtu pro platby, VAPID klíč pro push */
    settings: async () => {
      const { data, error } = await sb.from('settings').select('*');
      if (error) return;
      DB.settings = Object.fromEntries(data.map(r => [r.key, r.value]));
      CONFIG.account = DB.settings.account || CONFIG.account;
    },
    /** Hráči + platby + soukromé poznámky trenéra → DB.members, DB.payItems, DB.docs */
    players: async () => {
      const [pl, items, pay, pc] = await Promise.all([
        Sync.fetchAll('players', q => q.order('team').order('full_name').order('id')),
        Sync.fetchAll('pay_items', q => q.order('sort').order('id')),
        Sync.fetchAll('player_payments', q => q.order('player_id').order('item_id')),
        Sync.fetchAll('player_coach', q => q.order('player_id'))]);
      DB.payItems = items.map(i => ({id: i.id, n: i.name, a: i.amount}));
      const paid = new Set(pay.filter(x => x.paid).map(x => x.player_id + '|' + x.item_id));
      const note = Object.fromEntries(pc.map(x => [x.player_id, x.trainer_note]));
      DB.docs = {};
      DB.members = pl.map(p => {
        DB.docs[p.short_name] = p.doc_status;
        const par = Array.isArray(p.parents) && p.parents.length ? p.parents.map(x => ({n: x.n || '', ph: x.ph || '', em: x.em || ''})) : [{n:'', ph:'', em:''}];
        return {id: p.id, n: p.short_name, t: p.team, a: [p.att_present, p.att_total], p: DB.payItems.map(i => paid.has(p.id + '|' + i.id) ? 1 : 0), vs: p.vs,
                full: p.full_name, no: p.jersey_no == null ? '' : p.jersey_no, by: p.birth_year == null ? '' : p.birth_year, par,
                al: p.allergies, lim: p.limitations, tn: note[p.id] || '', mp: p.matches, gl: p.goals, ph: p.photo || ''};
      });
    },
    /** Účty + vazby rodič ↔ dítě → DB.users (vedení vidí všechny, ostatní jen sebe) */
    people: async () => {
      const [pr, lk] = await Promise.all([Sync.fetchAll('profiles', q => q.order('name').order('id')), Sync.fetchAll('parent_players', q => q.order('parent_id').order('player_id'))]);
      DB.links = lk;
      DB.users = {};
      pr.forEach(p => DB.users[p.id] = {id: p.id, r: p.role, name: p.name || p.email || '(bez jména)', email: p.email || '', phone: p.phone || '', mc: !!p.must_change_password, ph: p.photo || '', ap: p.att_present || 0, at: p.att_total || 0, role: CONFIG.roles[p.role],
        consent: !('consent_at' in p) || !!p.consent_at, pc: !!p.photo_consent,      // (bez sloupce = SQL ještě nespuštěno → souhlas se nevyžaduje)
        team: p.role == 'a' ? (UI.asTeam || CONFIG.planner.teams[0] || '') : (p.team || ''),
        kids: lk.filter(l => l.parent_id == p.id).map(l => (Model.byId(l.player_id) || {}).n).filter(Boolean).sort()});
      if (UI.user && DB.users[Sync.me]) {                              // přihlášený: obnovit odkaz a případně změněné děti
        UI.user = DB.users[Sync.me];
        if (UI.user.r == 'p' && !UI.user.kids.includes(UI.kid)) { UI.kid = UI.user.kids[0] || ''; UI.chatTeam = UI.kid ? Model.team(UI.kid) : ''; }
      }
    },
    /** Události zobrazovaného týdne */
    events: async () => {
      const a = Util.iso(Util.dayDate(0)), b = Util.iso(Util.dayDate(6));
      try { await sb.rpc('sync_plan_events', {week_start: a}); } catch (e) { console.warn('sync_plan_events', e); }   // tréninky vzniklé z rozvrhu hřišť (idempotentní)
      const ev = await Sync.fetchAll('events', q => q.gte('event_date', a).lte('event_date', b).order('id'));
      DB.events = ev.map(e => ({id: e.id, k: e.kind, tm: e.team, d: Util.dayIndex(e.event_date), t: e.time, pl: e.place, m: e.meet, c: e.coach, o: e.opponent || '', x: e.cancelled ? 1 : 0, nc: e.nom_closed ? 1 : 0,
                                br: e.bring || '', tour: e.tour ? 1 : 0, rank: e.placement || '', sc: e.sub_coach || null}));
      DB.cpool = {};                                                  // spolujízda se dočte znovu u zobrazených zápasů
    },
    /** Diskuse u akcí zobrazovaného týdne */
    ecom: async () => {
      const a = Util.iso(Util.dayDate(0)), b = Util.iso(Util.dayDate(6));
      const { data, error } = await sb.from('event_comments').select('*, events!inner(event_date)').gte('events.event_date', a).lte('events.event_date', b).order('id');
      DB.ecom = {}; if (error || !data) return;
      data.forEach(r => (DB.ecom[r.event_id] = DB.ecom[r.event_id] || []).push(Comments.row(r)));
    },
    /** Plány tréninků zobrazovaného týdne a šablony plánů (jen trenéři; ostatním databáze nic nevrátí) */
    eplans: async () => {
      DB.eplans = {}; DB.ttpl = [];
      const a = Util.iso(Util.dayDate(0)), b = Util.iso(Util.dayDate(6));
      const [p, t] = await Promise.all([sb.from('event_plans').select('event_id, body, events!inner(event_date)').gte('events.event_date', a).lte('events.event_date', b),
                                        sb.from('training_templates').select('id, team, name, body').order('name')]);
      if (!p.error && p.data) p.data.forEach(r => DB.eplans[r.event_id] = r.body);
      if (!t.error && t.data) DB.ttpl = t.data;
    },
    /** Místa s adresou pro navigaci */
    venues: async () => {
      const { data, error } = await sb.from('venues').select('*').order('id');
      if (error || !data) return;
      DB.venues = data;
    },
    results: async () => {
      const { data, error } = await sb.from('results').select('*').order('played_on', {ascending: false}).order('id', {ascending: false}).limit(60);
      if (error) throw new Error('results: ' + error.message);
      DB.results = data.map(r => ({id: r.id, eid: r.event_id, tm: r.team, d: Util.short(r.played_on), o: r.opponent, h: r.home ? 1 : 0, s: [r.score_us, r.score_them], g: r.scorers || {}}));
    },
    plan: async () => {
      const pl = await Sync.fetchAll('plan', q => q.order('id'));
      DB.plan = pl.map(b => ({id: b.id, d: b.day, f: b.field, tm: b.team, s: b.start_min, e: b.end_min}));
    },
    /** Docházka + omluvy + spolujízda → DB.att, DB.responses, DB.carpool */
    attendance: async () => {
      const rows = await Sync.fetchAll('attendance', q => q.order('id'));
      DB.att = {}; DB.responses = {}; DB.carpool = {};
      rows.forEach(r => { const m = Model.byId(r.player_id); if (m) Sync.applyAtt(r, m); });
      OfflineQ.reapply();                                             // značky zapsané bez internetu, které ještě čekají na odeslání
    },
    /** Stálá absence hráčů: {idHráče: [dny 0=Po…6=Ne]} (když tabulka ještě není, zůstane prázdné). */
    pabs: async () => {
      const { data, error } = await sb.from('player_absence').select('*');
      DB.pabs = {}; if (error || !data) return;
      data.forEach(r => (DB.pabs[r.player_id] = DB.pabs[r.player_id] || []).push(r.weekday));
    },
    /** Moje nastavení upozornění. */
    prefs: async () => {
      const { data, error } = await sb.from('user_prefs').select('*');
      DB.prefs = (!error && data && data[0] && data[0].notif) || {};
      DB.tpls = (!error && data && data[0] && Array.isArray(data[0].templates)) ? data[0].templates : [];
    },
    coach: async () => {
      const rows = await Sync.fetchAll('coach_attendance', q => q.order('event_id').order('coach_id')), dt = {};
      const miss = [...new Set(rows.filter(r => !r.ev_date).map(r => r.event_id))];       // starší záznamy bez data: dohledat z událostí
      for (let i = 0; i < miss.length; i += 100) {
        try { const q = await sb.from('events').select('id,kind,event_date').in('id', miss.slice(i, i + 100)); (q.data || []).forEach(e => dt[e.id] = e); } catch (e) {}
      }
      DB.coachAtt = {}; DB.coachNm = {}; DB.coachEv = {};
      rows.forEach(r => { const k = r.coach_id + '|' + r.event_id, e = dt[r.event_id] || {}; DB.coachAtt[k] = r.state; DB.coachNm[k] = Util.surname(r.coach_name);
        DB.coachEv[k] = {k: r.ev_kind || e.kind || 't', d: r.ev_date || e.event_date || ''}; });
      const past = await Sync.fetchAll('events', q => q.eq('kind', 't').eq('cancelled', false).lte('event_date', Util.iso(new Date())).order('id'));
      DB.pastT = past.map(e => ({id: e.id, tm: e.team, d: e.event_date}));
    },
    noms: async () => {
      const rows = await Sync.fetchAll('nominations', q => q.order('event_id').order('player_id'));
      DB.nominations = {};
      rows.forEach(r => { const m = Model.byId(r.player_id); if (m) (DB.nominations[r.event_id] = DB.nominations[r.event_id] || []).push(m.n); });
    },
    notes: async () => {
      const rows = await Sync.fetchAll('notes', q => q.order('id'));
      DB.notes = {};
      rows.forEach(r => { const m = Model.byId(r.player_id); if (!m) return; const d = new Date(r.created_at);
        (DB.notes[m.n] = DB.notes[m.n] || []).push({id: r.id, g: r.tag, x: r.body, d: `${d.getDate()}.${d.getMonth() + 1}.`, sh: !!r.shared, rem: r.remind_on || '', done: !!r.done}); });
    },
    chat: async () => {
      const rows = await Sync.last('chat_messages', 300);
      DB.chats = {}; rows.forEach(r => Model.chat(r.team).push(Sync.chatRow(r)));
    },
    /** Soukromé zprávy a seznam lidí, kterým smí uživatel psát (když tabulka ještě není, zůstane prázdné). */
    dm: async () => {
      try {
        const rows = await Sync.last('direct_messages', 500);
        DB.dm = rows.map(r => ({id: r.id, fid: r.from_id, tid: r.to_id, fn: r.from_name, tn: r.to_name, x: r.body, t: Util.stamp(r.created_at)}));
      } catch (e) { DB.dm = []; }
      DB.dmErr = '';
      try {
        const c = await sb.rpc('dm_contacts'); if (c.error) throw c.error;
        DB.dmContacts = Array.isArray(c.data) ? c.data : [];
      } catch (e) { DB.dmContacts = []; DB.dmErr = String((e && e.message) || e); }
    },
    /** Omluvy na delší dobu (od–do). Když tabulka ještě není, zůstane prázdné. */
    aper: async () => {
      const { data, error } = await sb.from('absence_periods').select('*').order('date_from');
      DB.aper = (!error && data) ? data.map(r => ({id: r.id, pid: r.player_id, from: r.date_from, to: r.date_to, reason: r.reason || '', note: r.note || ''})) : [];
    },
    /** Kontakty na trenéry kategorií dítěte (jen rodič; bez funkce v databázi zůstane prázdné). */
    tcoaches: async () => {
      try { const c = await sb.rpc('team_coaches'); DB.tcoaches = !c.error && Array.isArray(c.data) ? c.data : []; }
      catch (e) { DB.tcoaches = []; }
    },
    club: async () => {
      const rows = await Sync.last('club_messages', 300);
      DB.messages = rows.map(r => ({id: r.id, fid: r.sender_id, f: r.sender_name, role: r.sender_role, kind: r.kind, to: r.recipient_id, s: r.subject, x: r.body, t: Util.stamp(r.created_at)}));
    },
    notifs: async () => {
      const [rows, reads] = await Promise.all([
        sb.from('notifications').select('*').order('id', {ascending: false}).limit(100),
        Sync.fetchAll('notification_reads', q => q.order('notif_id'))]);
      if (rows.error) throw new Error('notifications: ' + rows.error.message);
      const rd = new Set(reads.map(r => r.notif_id));
      DB.notifs = rows.data.map(n => ({id: n.id, aud: n.aud, to: n.to_user, team: n.team, kid: n.kid, x: n.text, tab: n.tab, sub: n.sub, c: n.cnt, by: n.by_user, rd: rd.has(n.id) ? {[Sync.me]: 1} : {}}));
    },
    seen: async () => {
      const rows = await Sync.fetchAll('read_state', q => q.order('key'));
      DB.seen = {}; rows.forEach(r => DB.seen[r.key] = r.cnt);
    }
  };

  static chatRow(r) { return {id: r.id, fid: r.sender_id, f: r.sender_name, role: r.sender_role, x: r.body, t: Util.stamp(r.created_at), ts: Date.parse(r.created_at)}; }

  /** Jeden řádek docházky → DB.att (značka trenéra), DB.responses (omluva rodiče), DB.carpool */
  static applyAtt(r, m) {
    const ke = r.event_id + '|' + m.n, kr = m.n + '|' + r.event_id;
    if (r.state) DB.att[ke] = r.state; else delete DB.att[ke];
    if (r.response) DB.responses[kr] = {s: r.response, r: r.reason || '', x: r.note || ''}; else delete DB.responses[kr];
    if (r.carpool) DB.carpool[kr] = r.carpool; else delete DB.carpool[kr];
  }

  // ---------- Realtime ----------
  /** Která tabulka při změně znovu načte které části paměti. */
  static watch = {
    teams: ['teams'], settings: ['settings'], events: ['events', 'coach'], results: ['results'], plan: ['plan'], nominations: ['noms'], club_messages: ['club'], notifications: ['notifs'],
    coach_attendance: ['coach'], direct_messages: ['dm'], event_comments: ['ecom'], venues: ['venues'], event_plans: ['eplans'], notes: ['notes'], player_absence: ['pabs'], user_prefs: ['prefs'], absence_periods: ['aper'], players: ['players', 'people'], player_payments: ['players'], parent_players: ['people'], profiles: ['people', 'tcoaches']
  };

  static subscribe() {
    Sync.stop();
    const ch = sb.channel('tj-sokol-' + Sync.me);
    ch.on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'chat_messages'}, p => Sync.onChat(p.new));       // chat: hned
    ch.on('postgres_changes', {event: '*', schema: 'public', table: 'attendance'}, p => Sync.onAtt(p));                      // docházka a omluvy: hned
    Object.entries(Sync.watch).forEach(([table, names]) => ch.on('postgres_changes', {event: '*', schema: 'public', table}, () => Sync.queueReload(names)));
    ch.subscribe(status => {
      if (status == 'SUBSCRIBED') { if (Sync.subscribed) Sync.queueReload(Object.keys(Sync.loaders)); Sync.subscribed = true; }   // po výpadku spojení dočíst vše
    });
    Sync.ch = ch;
  }

  static onChat(r) {
    const list = Model.chat(r.team);
    if (list.some(m => m.id == r.id)) return;                        // už máme (vlastní zpráva)
    list.push(Sync.chatRow(r));
    App.refresh();
  }

  static onAtt(p) {
    if (p.eventType == 'DELETE') return Sync.queueReload(['attendance']);
    const r = p.new, m = Model.byId(r.player_id);
    if (!m) return Sync.queueReload(['players', 'attendance']);
    if (DB.cpool[r.event_id] !== undefined && (r.carpool || '') != (DB.carpool[m.n + '|' + r.event_id] || '')) delete DB.cpool[r.event_id];   // změna spolujízdy → seznam znovu načíst
    Sync.applyAtt(r, m);
    App.refresh();
  }

  /** Odložené znovunačtení částí paměti (sloučí rychlé změny; počká, až doběhnou vlastní zápisy). */
  static queueReload(names) {
    names.forEach(n => Sync.reloads.add(n));
    clearTimeout(Sync.reloadTimer);
    Sync.reloadTimer = setTimeout(Sync.flushReloads, 350);
  }
  static async flushReloads() {
    if (!UI.user) return;
    if (Sync.pending > 0) { Sync.reloadTimer = setTimeout(Sync.flushReloads, 500); return; }
    const names = [...Sync.reloads]; Sync.reloads.clear();
    try {
      if (names.includes('players')) await Sync.loaders.players();
      await Promise.all(names.filter(n => n != 'players').map(n => Sync.loaders[n]()));
    } catch (e) { console.error(e); }
    Offline.save();
    App.refresh();
  }

  // ---------- ukládání ----------
  /** Provede zápis do databáze; při chybě ukáže hlášení a znovu načte data. Vrací výsledek, nebo null. */
  static async write(label, query) {
    Sync.pending++;
    try {
      const r = await query;
      if (r.error) throw r.error;
      return r;
    } catch (e) {
      console.error(label, e);
      Sync.toast(`${label}: ${e.message || e}`);
      Sync.queueReload(Object.keys(Sync.loaders));
      return null;
    } finally { Sync.pending--; }
  }

  static toast(msg, ok) {
    UI.toast = msg; UI.toastOk = !!ok; App.refresh();
    clearTimeout(Sync.toastTimer);
    Sync.toastTimer = setTimeout(() => { UI.toast = ''; App.refresh(); }, 5500);
  }

  static notify(n) {
    return Sync.write('Notifikaci se nepodařilo odeslat', sb.from('notifications').insert({
      aud: n.aud, to_user: n.to || null, team: n.team || null, kid: n.kid || null, text: n.text, tab: n.tab || null, sub: n.sub || null}));
  }

  /** Odpověď rodiče (účast / omluva / spolujízda) nebo značka trenéra – jeden řádek hráč × událost. */
  static saveAttendance(kid, eventId, fields) {
    const m = Model.member(kid);
    return Sync.write('Docházku se nepodařilo uložit', sb.from('attendance').upsert(
      Object.assign({event_id: +eventId, player_id: m.id}, fields), {onConflict: 'event_id,player_id'}));
  }

  /** Uloží kartu hráče (odloženě, aby se neukládal každý znak). */
  static savePlayer(id, now) {
    if (!Sync.timers[id]) Sync.pending++;                            // dokud je zápis rozepsaný, nenačítá se zpět ze serveru
    clearTimeout(Sync.timers[id]);
    Sync.timers[id] = setTimeout(async () => {
      delete Sync.timers[id];
      try {
        const m = Model.byId(id);
        if (m) {
          await Sync.write('Hráče se nepodařilo uložit', sb.from('players').update({
            full_name: m.full, jersey_no: m.no === '' ? null : m.no, birth_year: m.by === '' ? null : m.by, allergies: m.al, limitations: m.lim,
            matches: m.mp, goals: m.gl, photo: m.ph || '', doc_status: DB.docs[m.n] || 'wait', parents: m.par}).eq('id', id));
          await Sync.write('Poznámku trenéra se nepodařilo uložit', sb.from('player_coach').upsert({player_id: id, trainer_note: m.tn || ''}));
        }
      } catch (e) { console.error(e); }
      finally { Sync.pending--; }                                    // vždy uvolnit, jinak by se přestala načítat data ze serveru
    }, now ? 0 : 600);
  }

  static queueRead(id) {
    Sync.readQ.add(id);
    clearTimeout(Sync.readTimer);
    Sync.readTimer = setTimeout(Sync.flushReads, 400);
  }
  static async flushReads() {
    const ids = [...Sync.readQ]; Sync.readQ.clear();
    if (!ids.length || !UI.user) return;
    await Sync.write('Přečtení se nepodařilo uložit', sb.from('notification_reads').upsert(
      ids.map(id => ({notif_id: id, user_id: Sync.me})), {onConflict: 'notif_id,user_id', ignoreDuplicates: true}));
  }
  /** Zapamatuje si, kam až uživatel zprávy přečetl (chat kategorie = klíč týmu, zprávy od klubu = "inbox"). */
  static setSeen(key, id) {
    if (!id || (DB.seen[key] || 0) >= id) return;
    DB.seen[key] = id;
    Sync.write('Přečtení se nepodařilo uložit', sb.from('read_state').upsert({user_id: Sync.me, key, cnt: id}, {onConflict: 'user_id,key'}));
  }

  /** Volání Edge Function admin-users (zakládání / úprava / mazání účtů). */
  static async admin(body) {
    const { data, error } = await sb.functions.invoke('admin-users', {body});
    if (error) {
      let msg = error.message || '';
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      if (/FunctionsFetchError|FunctionsRelayError|Failed to send|not found/i.test((error.name || '') + ' ' + msg))
        msg = 'Funkce admin-users není nasazená (viz admin-users-edge-function.ts).';
      throw new Error(msg || 'Akce se nezdařila.');
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
}
