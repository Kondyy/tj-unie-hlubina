/* TJ Unie Hlubina – 6/6 aplikace: záložky podle role, vykreslení stránky a start. */
/* =====================================================================
   9. App – záložky podle role (p rodič, c trenér, v vedení, a správce) a vykreslení stránky
   ===================================================================== */
const TABS = {
  p: [ {id:'cal',  label:'📅 Přehled',              view:() => Calendar.view()},
       {id:'chat', label:'💬 Chat',                 view:() => Chat.view()},
       {id:'kid',  label:'🧒 Hráč',                 view:() => KidProfile.view()},
       {id:'pay',  label:'💳 Dokumenty & platby',   view:() => Payments.parentView()},
       {id:'set',  label:'⚙ Nastavení',            view:() => Settings.view()} ],
  c: [ {id:'att',  label:'⚽ Tréninky',             view:() => Attendance.view()},
       {id:'ev',   label:'🏆 Zápasy',               view:() => Events.view()},
       {id:'plan', label:'🏟 Rozvrh hřiště',        view:() => Planner.view()},
       {id:'chat', label:'💬 Chat',                 view:() => Chat.view()},
       {id:'ros',  label:'👥 Soupiska',             view:() => Roster.view()},
       {id:'par',  label:'👪 Rodiče',               view:() => Parents.view()},
       {id:'no',   label:'📝 Poznámky',             view:() => Notes.view()},
       {id:'set',  label:'⚙ Nastavení',            view:() => Settings.view()} ],
  v: [ {id:'plan', label:'🏟 Plánovač',             view:() => Planner.view()},
       {id:'pay',  label:'💳 Platby',               view:() => Payments.managementView()},
       {id:'ovr',  label:'📊 Docházka',             view:() => AttOverview.view()},
       {id:'msg',  label:'✉ Zprávy',                view:() => Messages.view()},
       {id:'usr',  label:'👥 Uživatelé',            view:() => Users.view()},
       {id:'adm',  label:'🛠 Správa',               view:() => Admin.view()},
       {id:'set',  label:'⚙ Nastavení',            view:() => Settings.view()} ]
};

/* Správce = vedení + všechny trenérské záložky (za kategorii vybranou v hlavičce) */
TABS.a = [...TABS.v.filter(t => t.id != 'set'), ...TABS.c.filter(t => t.id != 'plan' && t.id != 'set'), TABS.v.find(t => t.id == 'set')];

class App {
  /** Vykreslí celou stránku (přihlašovací obrazovku, nebo hlavičku + záložky + obsah). */
  static render() {
    const root = $('#app'), keep = App.capture(root);
    if (!UI.user) root.innerHTML = Auth.view();
    else {
      const u = UI.user;
      if (!TABS[u.r].some(t => t.id == UI.tab)) UI.tab = TABS[u.r][0].id;
      const noKid = u.r == 'p' && !u.kids.length;                     // rodič, kterému správce ještě nepřiřadil dítě
      const body = noKid
        ? `<div class="col"><div class="card"><b>Zatím nemáte přiřazené dítě</b><div class="mut" style="margin-top:6px">Správce klubu vám k účtu přiřadí vaše dítě. Potom se tu objeví kalendář, chat a platby.</div></div></div>`
        : TABS[u.r].find(t => t.id == UI.tab).view();                 // nejdřív obsah (označí zprávy jako přečtené)
      const list = Notifs.list(u), unread = list.filter(([n]) => !Notifs.isRead(n, u)).length;
      root.innerHTML = `${App.header(u, list, unread)}<main class="wrap">${noKid ? '' : App.tabBar(u)}${Offline.banner()}${body}</main>${UI.modal ? Calendar.excuseModal() : ''}${UI.profile || Profile.forced(u) ? Profile.modal() : (!u.consent ? Profile.consentModal() : '')}`;
    }
    if (UI.toast) root.insertAdjacentHTML('beforeend', `<div class="toast ${UI.toastOk ? 'good' : ''}" role="status">${esc(UI.toast)}</div>`);
    App.restore(root, keep);
    Look.after(root);                                                 // ikony místo emoji, odpočet akce, přechod záložek (js/vzhled.js)
    if (!UI.user) Captcha.mount();
    // po vykreslení: chat odroluj dolů a případně vrať kurzor do pole zprávy
    const box = $('#chat-box'); if (box) box.scrollTop = box.scrollHeight;
    if (UI.focusChat) { UI.focusChat = false; const i = $('#chat-input'); if (i) i.focus(); }
  }

  /** Překreslení vyvolané změnou ze serveru: počká, pokud uživatel právě píše do pole bez id (např. karta hráče). */
  static refresh() {
    const a = document.activeElement;
    if (a && a.closest && a.closest('#app') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.id) { UI.stale = true; return; }
    App.render();
  }

  /** Zapamatuje si rozepsaná pole s id (aby je překreslení nesmazalo): hodnota, fokus, kurzor. */
  static capture(root) {
    const keep = {}, skip = UI.skipKeep || []; UI.skipKeep = [];
    root.querySelectorAll('input[id],textarea[id],select[id]').forEach(el => {
      if (el.type == 'file' || skip.includes(el.id)) return;
      keep[el.id] = {v: el.type == 'checkbox' ? el.checked : el.value, f: el === document.activeElement, s: el.selectionStart, e: el.selectionEnd};
    });
    return keep;
  }
  static restore(root, keep) {
    for (const id in keep) {
      const el = root.querySelector('#' + CSS.escape(id)), k = keep[id]; if (!el) continue;
      if (el.type == 'checkbox') el.checked = k.v; else if (el.value !== k.v) el.value = k.v;
      if (k.f) { el.focus(); try { if (k.s != null) el.setSelectionRange(k.s, k.e); } catch (x) {} }
    }
  }

  /** Hlavička: název, role, výběr dítěte (rodič), zvonek, odhlášení, panel notifikací. */
  static header(u, list, unread) {
    const kid = u.r == 'p' && u.kids.length
      ? (u.kids.length > 1
          ? `<select onchange="App.switchKid(this.value)">${u.kids.map(k => `<option value="${esc(k)}" ${k == UI.kid ? 'selected' : ''}>${esc(k)} · ${esc(Model.team(k))}</option>`).join('')}</select>`
          : `<span class="pill ok">${esc(UI.kid)} · ${esc(Model.team(UI.kid))}</span>`)
      : u.r == 'a'
        ? `<select onchange="App.switchTeam(this.value)" title="Kategorie, za kterou pracujete jako trenér">${CONFIG.planner.teams.map(t => `<option ${t == u.team ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
        : '';
    return `<header class="hd"><div class="wrap hdi"><img class="lg" src="${LOGO}" alt="${CLUB}">
      <div class="ttl"><b>${CLUB}</b><span>${u.role} · ${esc(u.name)}${u.team ? ' · ' + esc(u.team) : ''}</span></div>${kid}
      <button class="ib" onclick="Profile.open()" title="Můj profil">👤</button>
      <button class="ib" onclick="App.toggleBell()">🔔${unread ? `<i>${unread}</i>` : ''}</button>
      <button class="ib" onclick="Auth.logout()">Odhlásit</button></div>${UI.bell ? Notifs.panel(u, list) : ''}</header>`;
  }

  /** Lišta záložek s odznakem nepřečtených u chatu a červenou tečkou u dluhu. */
  static tabBar(u) {
    const all = TABS[u.r], split = t => { const m = t.label.match(/^(\S+)\s+(.*)$/); return m ? [m[1], m[2]] : ['•', t.label]; };
    const short = {'Dokumenty & platby': 'Platby', 'Rozvrh hřiště': 'Rozvrh'};
    const bd = t => (t.id == 'chat' ? Util.badge(Model.unreadAll(u)) : '') + (u.r == 'p' && t.id == 'pay' && Model.member(UI.kid) && Model.debt(Model.member(UI.kid)) ? ' 🔴' : '');
    const pin = {p: ['cal', 'chat', 'kid']}[u.r];                       // rodič: dole Přehled, Chat, Hráč; Platby pod „Více“
    const main = pin ? all.filter(t => pin.includes(t.id)) : all.length > 5 ? all.slice(0, 4) : all, more = all.filter(t => !main.includes(t));
    const btn = (t, cls) => { const [ic, tx] = split(t); return `<button class="${UI.tab == t.id ? 'on' : ''}" onclick="App.go('${t.id}')"><span class="ic">${ic}</span><span class="tx">${esc(short[tx] || tx)}</span>${bd(t)}</button>`; };
    const moreOn = more.some(t => UI.tab == t.id);
    const bottom = `<nav class="bnav">${main.map(btn).join('')}${more.length ? `<button class="${moreOn || UI.more ? 'on' : ''}" onclick="App.toggleMore()"><span class="ic">☰</span><span class="tx">Více</span>${more.some(t => bd(t).includes('🔴')) ? '🔴' : ''}</button>` : ''}</nav>`
      + (UI.more && more.length ? `<div class="msheet" onclick="if(event.target==this)App.toggleMore()"><div class="mg">${more.map(btn).join('')}</div></div>` : '');
    return bottom + `<nav class="tabs">${TABS[u.r].map(t => `<button class="chip ${UI.tab == t.id ? 'on' : ''}" onclick="App.go('${t.id}')">${t.label}${t.id == 'chat' ? Util.badge(Model.unreadAll(u)) : ''}${u.r == 'p' && t.id == 'pay' && Model.member(UI.kid) && Model.debt(Model.member(UI.kid)) ? ' 🔴' : ''}</button>`).join('')}</nav>`;
  }

  // ----- navigace -----
  static go(tab)         { UI.tab = tab; UI.bell = false; UI.more = false; App.render(); }
  static toggleMore()    { UI.more = !UI.more; App.render(); }
  static toggleBell()    { UI.bell = !UI.bell; App.render(); }
  /** Rodič přepne dítě → přepne se celý dashboard i chat. */
  /** Správce přepne kategorii, za kterou pracuje jako trenér. */
  static switchTeam(t) { UI.asTeam = t; UI.user.team = t; UI.player = ''; UI.attEvent = 0; UI.resEvent = ''; UI.nomEvent = 0; App.render(); }
  static switchKid(name) { UI.kid = name; UI.chatTeam = Model.team(name); UI.qr = null; App.render(); }
}

/* Když uživatel dopíše pole (opustí ho) a mezitím přišla změna ze serveru, překreslí se stránka. */
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (UI.stale && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.id)) { UI.stale = false; App.render(); }
}, 120));

/* ---------- START ---------- */
Auth.init();
