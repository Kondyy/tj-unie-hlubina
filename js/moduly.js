/* TJ Unie Hlubina – 3/5 moduly: jednotlivé obrazovky (kalendář, platby, docházka, zápasy, soupiska, chat…). */
/* =====================================================================
   8. MODULY
   ===================================================================== */

/* ---------------------------------------------------------------------
   Absence – omluva na delší dobu (od–do): tréninky a zápasy v období se hráči automaticky omluví
   --------------------------------------------------------------------- */
class Absence {
  /** Karta s formulářem a seznamem omluv jednoho hráče (rodič svého dítěte, trenér hráče své kategorie). */
  static card(kid, open) {
    const m = Model.member(kid); if (!m) return '';
    const today = Util.iso(new Date()), L = DB.aper.filter(a => a.pid == m.id && a.to >= today);
    return `<details class="card" ${open || UI.apOpen || L.length ? 'open' : ''} ontoggle="UI.apOpen=this.open"><summary><b>🩹 Omluva na delší dobu</b>${L.length ? ` <span class="pill wa">${L.length}</span>` : ''}</summary>
      <div class="mut" style="margin-top:6px">Nemoc, dovolená, zranění… Všechny tréninky a zápasy v období se ${esc(kid)} automaticky omluví (včetně těch, které trenér teprve přidá).</div>
      ${L.map(a => `<div class="pay" style="margin-top:6px"><span>${Util.short(a.from)} – ${Util.short(a.to)} · ${esc(a.reason || '—')}${a.note ? ' (' + esc(a.note) + ')' : ''}</span>
        <button class="btn no" style="flex:none" onclick="Absence.remove(${a.id})">✕ Zrušit</button></div>`).join('')}
      <div class="row" style="margin-top:8px"><label class="mut" style="flex:1">Od<input id="ap-from" type="date" min="${today}" value="${today}"></label>
        <label class="mut" style="flex:1">Do<input id="ap-to" type="date" min="${today}"></label></div>
      <select id="ap-reason">${['Nemoc','Zranění','Dovolená','Škola','Rodinné důvody'].map(r => `<option>${r}</option>`).join('')}</select>
      <input id="ap-note" placeholder="Poznámka (volitelné)" maxlength="120">
      <button class="btn ok" style="width:100%;margin-top:6px" onclick="Absence.add('${Util.q(kid)}')">Omluvit na toto období</button>
      <div id="ap-msg" class="warn" style="margin-top:6px"></div></details>`;
  }

  static async add(kid) {
    const m = Model.member(kid), from = $('#ap-from').value, to = $('#ap-to').value, reason = $('#ap-reason').value, note = $('#ap-note').value.trim(), msg = $('#ap-msg');
    if (!from || !to) { msg.textContent = 'Vyplňte datum od i do.'; return; }
    if (to < from) { msg.textContent = 'Datum „do“ nesmí být dřív než „od“.'; return; }
    if ((new Date(to) - new Date(from)) / 864e5 > 366) { msg.textContent = 'Nejdéle na 1 rok.'; return; }
    const r = await Sync.write('Omluvu se nepodařilo uložit', sb.from('absence_periods').insert({player_id: m.id, date_from: from, date_to: to, reason, note: note || null}).select());
    if (!r) return;
    ['#ap-to', '#ap-note'].forEach(s => { const el = $(s); if (el) el.value = ''; });
    Notifs.send('C', `🩹 Omluva na delší dobu: ${kid} ${Util.short(from)} – ${Util.short(to)} (${reason}${note ? ', ' + note : ''})`, {team: m.t, tab: 'att'});
    await Promise.all([Sync.loaders.aper(), Sync.loaders.attendance()]);
    App.render();
  }

  static async remove(id) {
    if (!confirm('Zrušit tuto omluvu? Automaticky omluvené tréninky a zápasy se vrátí do původního stavu.')) return;
    const r = await Sync.write('Omluvu se nepodařilo zrušit', sb.from('absence_periods').delete().eq('id', id).select());
    if (!r) return;
    await Promise.all([Sync.loaders.aper(), Sync.loaders.attendance()]);
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Calendar – kalendář dítěte, účast, omluvy, spolujízda, historie zápasů (RODIČ)
   --------------------------------------------------------------------- */
class Calendar {
  /** Záložka "Přehled": nadcházející události + odehrané zápasy kategorie dítěte. */
  static view() {
    const team = Model.team(UI.kid), today = Dnes.parent(team);                // nahoře nejbližší akce s odpočtem (js/vzhled.js)
    return `<div class="col">${today}<h2 style="margin-top:${today ? '18px' : '0'}">📅 Nadcházející · ${UI.kid} (${team})</h2>
      ${Model.eventsOf(team).map(e => Calendar.eventCard(e)).join('') || Look.empty('cal', 'Tento týden nic', `${esc(UI.kid)} tento týden nemá žádný trénink ani zápas. Jakmile ho trenér přidá, objeví se tady.`)}${Calendar.history(team)}${Calendar.contacts(team)}</div>`;
  }

  /** Kontakty na trenéry kategorie: jméno, po rozkliknutí telefon a e-mail. */
  static contacts(team) {
    const L = DB.tcoaches.filter(c => c.team == team);
    return `<h2>📞 Kontakt na trenéry</h2>${L.length ? L.map(c => `<details class="card"><summary style="display:flex;gap:10px;align-items:center">${Util.userAvatar({name: c.name, email: c.email, ph: c.photo}, 32)}<b>${esc(c.name || c.email)}</b></summary>
        <div style="margin-top:8px" class="row">${c.phone ? `<a class="btn" href="tel:${esc(Util.phone(c.phone))}">📞 ${esc(c.phone)}</a>` : ''}
        ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}
        ${!c.phone && !c.email ? '<span class="mut">Trenér nemá vyplněný kontakt.</span>' : ''}</div></details>`).join('') : '<div class="card mut">Trenér kategorie zatím není přiřazen.</div>'}`;
  }

  /** Karta jedné události (trénink / zápas / zrušeno) s tlačítky účasti. */
  static eventCard(e) {
    const k = UI.kid + '|' + e.id, r = DB.responses[k], cl = e.x ? 'x' : e.k;
    return `<div class="card ev ${cl}">
      <div class="pay"><b>${e.k == 'z' ? (e.tour ? '🏅 Turnaj: ' : '🏆 Zápas vs. ') + esc(e.o) : '⚽ Trénink'}</b><span class="pill ${cl}">${e.x ? 'Zrušeno' : e.k == 'z' ? (e.tour ? 'Turnaj' : 'Zápas') : 'Trénink'}</span></div>
      <div class="mut">🕒 ${Util.date(e.d)}, ${e.t} · 📍 ${esc(e.pl)}<br>🤝 Sraz: ${esc(e.m)} · 👤 ${esc(Model.coachSurnames(e))}</div>
      ${Weather.line(e)}
      ${e.x ? '' : Calendar.nomState(e)}
      ${e.x || Calendar.notNominated(e) ? '' : `<div class="row" style="margin-top:10px">
          <button class="btn ${r && r.s == 'y' ? 'ok' : ''}" onclick="Calendar.attend('${Util.q(k)}')">✔ Zúčastní se</button>
          <button class="btn ${r && r.s == 'n' ? 'no' : ''}" onclick="Calendar.openExcuse('${Util.q(k)}')">✖ Omluvit se</button></div>
        ${r && r.s == 'n' ? `<div class="mut">Omluven: ${r.r}${r.x ? ' – ' + esc(r.x) : ''}</div>` : ''}
        ${e.k == 'z' ? Calendar.carpoolSelect(k) : ''}`}
      ${e.x ? '' : Bring.parent(e) + Carpool.list(e) + (e.tour ? Tour.summary(e) : '')}
      ${e.x || e.k != 'z' ? '' : `<div class="row" style="margin-top:8px"><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(Venues.target(e.pl))}">🧭 Navigovat</a></div>`}
    </div>`;
  }

  /** Zápas s uzavřenou nominací, na kterou dítě nebylo nominováno. */
  static notNominated(e) { return e.k == 'z' && !!e.nc && !(DB.nominations[e.id] || []).includes(UI.kid); }
  /** Řádek o nominaci u zápasu: nominován / nenominován / nominace ještě není potvrzena. */
  static nomState(e) {
    if (e.k != 'z') return '';
    if (!e.nc) return '<div class="mut" style="margin-top:6px">⏳ Nominaci ještě trenér nepotvrdil.</div>';
    return Calendar.notNominated(e) ? `<div class="mut" style="margin-top:6px"><span class="pill wa">Nenominován(a)</span> ${esc(UI.kid)} na tento zápas není nominován(a).</div>`
      : `<div style="margin-top:6px"><span class="pill ok">🏆 Nominován(a)</span> <span class="mut">Nominaci potvrdil trenér – potvrďte prosím účast.</span></div>`;
  }

  /** Výběr spolujízdy u zápasu. */
  static carpoolSelect(k) {
    const c = DB.carpool[k];
    return `<select onchange="Calendar.setCarpool('${Util.q(k)}',this.value)"><option value="">🚗 Spolujízda…</option>
      ${[1,2,3,4].map(n => `<option value="o${n}" ${c == 'o' + n ? 'selected' : ''}>Mám volná místa v autě (${n})</option>`).join('')}
      <option value="s" ${c == 's' ? 'selected' : ''}>Hledám odvoz</option></select>`;
  }

  /** Odehrané zápasy kategorie + bilance a góly vybraného dítěte. */
  static history(team) {
    const L = DB.results.filter(r => r.tm == team);
    const w = L.filter(r => r.s[0] > r.s[1]).length, d = L.filter(r => r.s[0] == r.s[1]).length;
    const goals = L.reduce((a, r) => a + (r.g[UI.kid] || 0), 0);
    return `<h2>🏁 Odehrané zápasy</h2>
      <div class="card"><div class="pay"><span>Bilance týmu ${team}</span><b>${w}V · ${d}R · ${L.length - w - d}P</b></div><div class="mut">Branky ${UI.kid}: ${goals}</div>${Charts.form(L)}</div>
      ${L.map(r => {
        const c = r.s[0] > r.s[1] ? ['ok','V'] : r.s[0] == r.s[1] ? ['wa','R'] : ['no','P'], k = r.g[UI.kid];
        return `<div class="card"><div class="pay"><div><b>${r.h ? CLUB + ' – ' + r.o : r.o + ' – ' + CLUB}</b>
          <div class="mut">${r.d} · ${r.h ? 'doma' : 'venku'}${k ? ` · ⚽ ${UI.kid} ${k}×` : ''}</div></div>
          <span class="pill ${c[0]}">${r.h ? r.s[0] + ':' + r.s[1] : r.s[1] + ':' + r.s[0]} ${c[1]}</span></div>${ResultImg.btn(r, true)}</div>`;
      }).join('')}`;
  }

  // ----- akce -----
  static attend(k) {
    const [kid, id] = k.split('|');
    DB.responses[k] = {s:'y'}; App.render();
    Sync.saveAttendance(kid, id, {response:'y', reason:null, note:null});
  }
  static setCarpool(k, v) {
    const [kid, id] = k.split('|');
    if (v) DB.carpool[k] = v; else delete DB.carpool[k];
    delete DB.cpool[id];
    App.render();
    Sync.saveAttendance(kid, id, {carpool: v || null});
  }
  static openExcuse(k)    { UI.modal = k; UI.reason = ''; App.render(); }
  static pickReason(r)    { UI.reason = r; App.render(); }
  static closeModal()     { UI.modal = null; App.render(); }

  /** Okno omluvy: důvod + poznámka pro trenéra. */
  static excuseModal() {
    return `<div class="mo" onclick="if(event.target==this)Calendar.closeModal()"><div class="card">
      <b>Omluvit se – ${UI.modal.split('|')[0]}</b>
      <div class="row" style="margin:10px 0">${CONFIG.excuseReasons.map(r => `<button class="chip ${UI.reason == r ? 'on' : ''}" onclick="Calendar.pickReason('${r}')">${r}</button>`).join('')}</div>
      <textarea id="excuse-note" rows="2" placeholder="Poznámka pro trenéra (volitelné)"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="Calendar.closeModal()">Zrušit</button><button class="btn ok" onclick="Calendar.submitExcuse()">Odeslat omluvu</button></div></div></div>`;
  }

  /** Uloží omluvu do databáze a pošle notifikaci trenérům kategorie dítěte. */
  static submitExcuse() {
    if (!UI.reason) return alert('Vyberte důvod');
    const k = UI.modal, [kid, id] = k.split('|'), e = Model.event(id), reason = UI.reason, note = $('#excuse-note').value;
    DB.responses[k] = {s:'n', r:reason, x:note};
    Sync.saveAttendance(kid, id, {response:'n', reason, note: note || null});                 // uloží se a ostatním přijde Realtime
    Notifs.send('C', `🩹 Omluva: ${kid} – ${reason} (${Util.date(e.d)})`, {team: Model.team(kid), tab:'att'});   // notifikace trenérům kategorie
    UI.modal = null;
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Payments – dokumenty a platby dítěte (RODIČ) + přehled plateb a import (VEDENÍ)
   --------------------------------------------------------------------- */
class Payments {
  // ===== pohled rodiče =====
  /** Záložka "Dokumenty & platby": zdravotní prohlídka + příspěvky s QR kódem. */
  static parentView() {
    const m = Model.member(UI.kid), st = DB.docs[UI.kid] || 'wait', L = CONFIG.docStatus[st], d = Model.debt(m);
    return `<div class="g2"><div><h2>Dokumenty</h2>
      <div class="card"><div class="pay"><b>🩺 Zdravotní prohlídka</b><span class="pill ${L[1]}">${L[0]}</span></div>
        <div class="mut">${UI.kid}${st == 'ok' ? ' · platí do 12. 3. 2027' : st == 'exp' ? ' · platnost vypršela, nahrajte novou' : ''}</div>
        <input type="file" onchange="Payments.uploadDoc()">
        <div class="mut" style="margin-top:6px">Po nahrání se stav změní na „Čeká na schválení“. Schvaluje trenér.</div></div></div>
      <div><h2>Platby ${d ? `<span class="pill no">dluh ${d} Kč</span>` : '<span class="pill ok">vše zaplaceno</span>'}</h2>
      ${DB.payItems.map((x, i) => `<div class="card"><div class="pay"><div><b>${x.n}</b><div class="mut">${x.a} Kč</div></div>
        ${m.p[i] ? '<span class="pill ok">✔ Zaplaceno</span>' : `<button class="btn no" onclick="Payments.showQr(${i})">Platební údaje</button>`}</div>
        ${UI.qr === i && !m.p[i] ? `<div style="margin-top:10px"><div class="mut">Částka: <b>${x.a} Kč</b></div>
          <div class="mut">Účet: <b>${CONFIG.account ? esc(CONFIG.account) : 'doplní správce klubu'}</b></div>
          <div class="mut">Variabilní symbol: <b>${m.vs || '–'}</b></div>
          <div class="mut">Zpráva pro příjemce: <b>${esc(m.full || m.n)} – ${esc(x.n)}</b></div>
          ${Payments.qr(m, x)}
          <div class="mut" style="margin-top:6px">Po připsání platby ji vedení klubu označí jako zaplacenou.</div></div>` : ''}</div>`).join('')}</div></div>`;
  }
  /** Český IBAN z čísla účtu "předčíslí-číslo/banka". */
  static iban(acc) {
    const q = String(acc || '').match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/); if (!q) return '';
    const bban = q[3] + (q[1] || '').padStart(6, '0') + q[2].padStart(10, '0'), n = bban + '123500';   // CZ = 12 35, kontrolní číslice 00
    let r = 0; for (const ch of n) r = (r * 10 + +ch) % 97;
    return 'CZ' + String(98 - r).padStart(2, '0') + bban;
  }
  /** QR platba (český standard SPD) – vykreslí se, jen když je zadané číslo účtu a načtená knihovna. */
  static qr(m, x) {
    const iban = Payments.iban(CONFIG.account);
    if (!iban || !window.qrcode) return '';
    const ascii = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .,\-]/g, '').toUpperCase().slice(0, 60);
    const spd = `SPD*1.0*ACC:${iban}*AM:${x.a.toFixed(2)}*CC:CZK*MSG:${ascii((m.full || m.n) + ' ' + x.n)}` + (m.vs ? `*X-VS:${m.vs}` : '');
    const q = window.qrcode(0, 'M'); q.addData(spd); q.make();
    return `<div style="margin-top:8px;background:#fff;padding:8px;border-radius:12px;display:inline-block;line-height:0">${q.createSvgTag(4, 0)}</div><div class="mut">Naskenujte v bankovní aplikaci.</div>`;
  }
  static uploadDoc() {                                                       // nahrání dokumentu → čeká na schválení
    DB.docs[UI.kid] = 'wait'; App.render();
    Sync.write('Stav dokumentu se nepodařilo uložit', sb.rpc('upload_doc', {pid: Model.member(UI.kid).id}));
  }
  static showQr(i)      { UI.qr = UI.qr === i ? null : i; App.render(); }

  // ===== pohled vedení =====
  /** Členové po aplikování filtrů (stav platby, tým, hledání podle jména). */
  static filtered() {
    return DB.members.filter(m =>
      (UI.payFilter == 'all' || (UI.payFilter == 'dl' ? Model.debt(m) > 0 : Model.debt(m) == 0)) &&
      (UI.teamFilter == 'all' || m.t == UI.teamFilter) &&
      Util.norm(m.n + ' ' + (m.full || '')).includes(Util.norm(UI.search)));
  }

  /** Záložka "Platby": souhrn, import z Excelu, hledání, filtry, seznam členů. */
  static managementView() {
    let total = 0, got = 0;
    DB.members.forEach(m => DB.payItems.forEach((x, i) => { total += x.a; if (m.p[i]) got += x.a; }));
    const L = Payments.filtered(), debtors = L.filter(m => Model.debt(m) > 0).length;
    return `<div class="card"><div class="pay"><span>Vybráno</span><b>${got} / ${total} Kč</b></div>
        <div class="bar"><i style="width:${Math.round(got / total * 100)}%"></i></div>
        <div class="mut">Nedoplatky: ${total - got} Kč · ${DB.members.filter(m => Model.debt(m) > 0).length} z ${DB.members.length} členů má dluh</div>
        ${Charts.donut(DB.payItems.map((x, i) => ({l: x.n, v: DB.members.filter(m => !m.p[i]).length * x.a})).filter(x => x.v), ' Kč')}</div>
      <div class="card"><b>Import z Excelu</b>
        <div class="mut">Sloupce: „Jméno“, volitelně „Tým“, další = příspěvky (např. „Dresy (600)“). Zaplaceno = ano / 1 / x / ✔.</div>
        <input type="file" accept=".xlsx,.xls,.csv" onchange="Payments.importExcel(this)">
        ${UI.importMsg ? `<div class="mut cg">${UI.importMsg}</div>` : ''}</div>
      <input id="pay-search" type="search" placeholder="🔍 Hledat hráče…" value="${esc(UI.search)}" oninput="Payments.setSearch(this.value)">
      <div class="row" style="margin:6px 0">${['all', ...new Set(DB.members.map(m => m.t))].map(t => `<button class="chip ${UI.teamFilter == t ? 'on' : ''}" onclick="Payments.setTeam('${t}')">${t == 'all' ? 'Všechny týmy' : t}</button>`).join('')}</div>
      <div class="row" style="margin-bottom:8px">${[['all','Všichni'],['dl','Dlužníci'],['ok','Zaplaceno']].map(([k, l]) => `<button class="chip ${UI.payFilter == k ? 'on' : ''}" onclick="Payments.setFilter('${Util.q(k)}')">${l}</button>`).join('')}</div>
      ${debtors ? `<button class="btn no" style="width:100%;margin-bottom:10px" onclick="Payments.remindFiltered()">📨 Poslat výzvu všem dlužníkům (${debtors})</button>` : ''}
      <div class="g2">${L.map(m => Payments.memberCard(m)).join('')}</div>${L.length ? '' : '<div class="card mut">Nikdo nenalezen.</div>'}`;
  }

  /** Karta člena v přehledu plateb: klepnutím na příspěvek se změní stav. */
  static memberCard(m) {
    const d = Model.debt(m);
    return `<div class="card"><div class="pay"><div><b>${m.n}</b> <span class="mut">${m.t}${m.vs ? ' · VS ' + m.vs : ''}</span></div>${d ? `<b class="cr">dluh ${d} Kč</b>` : '<b class="cg">✔ vše</b>'}</div>
      <div class="row" style="margin-top:8px">${DB.payItems.map((x, i) => `<button class="chip ${m.p[i] ? 'ok' : 'no'}" style="background:rgba(var(--c),.18)" onclick="Payments.toggle('${m.id}',${i})">${m.p[i] ? '✔' : '✗'} ${x.n} · ${x.a}</button>`).join('')}</div>
      ${d ? `<button class="btn" style="width:100%;margin-top:8px" onclick="Payments.remind(['${Util.q(m.n)}'])">Poslat upomínku</button>` : ''}</div>`;
  }

  // ----- akce vedení -----
  static toggle(pid, i) {
    const m = Model.byId(pid); m.p[i] = m.p[i] ? 0 : 1; App.render();
    Sync.write('Platbu se nepodařilo uložit', sb.from('player_payments').upsert(
      {player_id: pid, item_id: DB.payItems[i].id, paid: !!m.p[i]}, {onConflict: 'player_id,item_id'}));
  }
  static setTeam(t)      { UI.teamFilter = t; App.render(); }
  static setFilter(k)    { UI.payFilter = k; App.render(); }
  static setSearch(v) {                      // hledání: po překreslení vrátí kurzor na konec pole
    UI.search = v; App.render();
    const i = $('#pay-search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
  }
  static remindFiltered() { Payments.remind(Payments.filtered().filter(m => Model.debt(m) > 0).map(m => m.n)); }
  /** Pošle výzvu k platbě rodičům zadaných dětí (jen těm s dluhem). */
  static remind(names) {
    let n = 0;
    names.forEach(name => {
      const d = Model.debt(Model.member(name));
      if (d) { n++; Notifs.send('K', `💳 Výzva k platbě: ${name} – dluh ${d} Kč`, {kid:name, tab:'pay'}); }   // dostanou rodiče dítěte
    });
    UI.importMsg = `Výzva k platbě odeslána: ${n} členů.`;
    App.render();
  }

  /** Import příspěvků z Excelu/CSV: nové sloupce = nové příspěvky, nová jména = noví členové. Vše se uloží do databáze. */
  static importExcel(input) {
    const file = input.files[0]; if (!file) return;
    if (!window.XLSX) { UI.importMsg = 'Knihovnu pro Excel se nepodařilo načíst.'; return App.render(); }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb = XLSX.read(e.target.result, {type:'array'}), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
        if (!rows.length) throw 0;
        const keys = Object.keys(rows[0]);
        const keyName = keys.find(k => /^(jmen|hrac|name)/.test(Util.norm(k))), keyTeam = keys.find(k => Util.norm(k).startsWith('tym'));
        if (!keyName) throw 0;
        const payKeys = keys.filter(k => k != keyName && k != keyTeam);
        UI.importMsg = 'Importuji…'; App.render();
        // sloupec → index příspěvku (chybějící příspěvek se založí v databázi)
        const idx = [];
        for (const k of payKeys) {
          const amount = (k.match(CONFIG.priceInHeader) || [])[1], name = k.replace(CONFIG.priceInHeader, '').trim() || k;
          let i = DB.payItems.findIndex(x => Util.norm(x.n) == Util.norm(name));
          if (i < 0) {
            const r = await Sync.write('Příspěvek se nepodařilo založit', sb.from('pay_items').insert({name, amount: amount ? +amount.replace(/\s/g, '') : 0, sort: DB.payItems.length + 1}).select().single());
            if (!r) throw new Error('save');
            DB.payItems.push({id: r.data.id, n: r.data.name, a: r.data.amount}); DB.members.forEach(m => m.p.push(0)); i = DB.payItems.length - 1;
          }
          idx.push(i);
        }
        // členové (noví se založí) + zaplaceno / nezaplaceno
        let added = 0, updated = 0; const pay = [];
        for (const r of rows) {
          const name = String(r[keyName]).trim(); if (!name) continue;
          const team = keyTeam && r[keyTeam] ? String(r[keyTeam]).trim() : '';
          let m = Model.member(name);
          if (!m) {
            const res = await Sync.write('Člena se nepodařilo založit', sb.from('players').insert({short_name: name, full_name: name, team: team || '—'}).select().single());
            if (!res) throw new Error('save');
            m = Model.fillProfile({id: res.data.id, n: name, t: res.data.team, a: [0, 0], p: DB.payItems.map(() => 0), full: name}); DB.members.push(m); added++;
          } else {
            updated++;
            if (team && team != m.t) { m.t = team; await Sync.write('Tým se nepodařilo změnit', sb.from('players').update({team}).eq('id', m.id)); }
          }
          payKeys.forEach((k, j) => { const paid = CONFIG.paidWords.test(String(r[k]).trim()); m.p[idx[j]] = paid ? 1 : 0; pay.push({player_id: m.id, item_id: DB.payItems[idx[j]].id, paid}); });
        }
        if (pay.length && !await Sync.write('Platby se nepodařilo uložit', sb.from('player_payments').upsert(pay, {onConflict: 'player_id,item_id'}))) throw new Error('save');
        UI.importMsg = `Import hotov: ${added} nových, ${updated} aktualizovaných členů, ${payKeys.length} příspěvků.`;
      } catch (x) { UI.importMsg = x && x.message == 'save' ? 'Import se nepodařilo uložit do databáze.' : 'Soubor se nepodařilo přečíst – zkontrolujte sloupec „Jméno“.'; }
      input.value = ''; App.render();
    };
    reader.readAsArrayBuffer(file);
  }
}


/* ---------------------------------------------------------------------
   Attendance – docházka na trénincích a účast samotného trenéra (TRENÉR)
   --------------------------------------------------------------------- */
class Attendance {
  /** Záložka "Tréninky": seznam tréninků (vznikají automaticky z rozvrhu hřišť, lze je i ručně přidat nebo zrušit) → po rozkliknutí docházka hráčů. */
  static view() {
    const team = UI.user.team, trainings = Model.eventsOf(team).filter(e => e.k == 't');
    const e = trainings.find(x => x.id == UI.attEvent), count = Model.membersOf(team).length;
    const se = UI.subEvent && DB.events.find(x => x.id == UI.subEvent && x.sc == UI.user.id);
    if (se) return SubCoach.detail(se);                               // zástup za trenéra jiné kategorie
    if (!e) {                                                         // 1) seznam tréninků
      UI.attEvent = 0;
      return `${Dnes.coach(team)}${Attendance.mine()}${OfflineQ.badge()}${SubCoach.list()}<h2>Tréninky ${team}</h2><div class="g2">${trainings.map(t => {
        const k = Attendance.marked(t);
        return `<div class="card ev ${t.x ? 'x' : 't'}" ${t.x ? '' : `style="cursor:pointer" onclick="Attendance.open('${t.id}')"`}>
          <div class="pay"><b>⚽ ${Util.date(t.d)} · ${t.t}</b><span class="pill ${t.x ? 'x' : k == count ? 'ok' : 'wa'}">${t.x ? 'Zrušeno' : k + '/' + count + ' označeno'}</span></div>
          <div class="mut">📍 ${esc(t.pl)}${t.sc ? ' · 🙋 zástup: ' + esc(t.c) : ''}</div>${Weather.line(t)}${t.x ? '' : '<div class="mut">Klepnutím otevřete docházku →</div>'}
          <div class="row" style="margin-top:8px"><button class="btn" onclick="event.stopPropagation();Events.cancel('${t.id}')">${t.x ? 'Obnovit trénink' : 'Zrušit trénink'}</button><button class="btn" style="flex:none;color:var(--r)" onclick="event.stopPropagation();Events.remove('${t.id}')">🗑 Smazat</button></div></div>`;
      }).join('') || Look.empty('ball', 'Zatím žádné tréninky', 'Tento týden zatím žádný trénink. Tréninky se přidají automaticky podle rozvrhu hřišť, který nastavuje vedení, nebo je přidejte ručně níže.')}</div>
      <h2>+ Přidat trénink ručně</h2><div class="card">
        <div class="row"><select id="tr-day">${CONFIG.days.map((n, i) => `<option value="${i}">${Util.date(i)}</option>`).join('')}</select>
          <input id="tr-time" placeholder="Čas (16:00)"></div>
        ${Venues.select('tr-place')}
        <label class="pl"><span>🔔 Upozornit rodiče na nový trénink</span><input id="tr-notify" type="checkbox"></label>
        <button class="btn ok" style="width:100%" onclick="Events.add('t')">Přidat trénink</button></div>`;
    }
    return `<button class="btn" onclick="Attendance.close()">← Tréninky</button>        <!-- 2) detail tréninku -->
      <h2>${Util.date(e.d)} · ${e.t} · ${esc(e.pl)}</h2>${Weather.line(e)}${Attendance.coachCard(e)}
      <div class="row" style="margin-top:10px">${Events.notifyBtn(e)}</div>${Venues.placeBox(e)}${OfflineQ.badge()}${Attendance.answers(e)}
      <button class="btn ok" style="width:100%;margin-top:10px" onclick="Attendance.allPresent(${e.id})">✔ Všichni ostatní přítomni</button>
      ${!AttGrid.isList() ? AttGrid.view(e) : `<button class="btn" style="width:100%;margin-top:10px" onclick="AttGrid.setList(false)">📷 Mřížka fotek (rychlé klepání)</button>
      <div class="g2" style="margin-top:10px">${Model.membersOf(team).map(m => {
        const a = DB.att[e.id + '|' + m.n], p = Model.attPct(m), [ps, tt] = Model.attCount(m);
        return `<div class="card"><div style="display:flex;gap:10px;align-items:center">${Util.avatar(m, 40)}
            <div style="flex:1;min-width:0"><b>${esc(m.full || m.n)}</b><div class="mut">Účast <b class="${Util.attCls(p)}">${p} %</b> (${ps}/${tt} tréninků)</div></div></div>
          <div style="margin-top:6px"><span class="pill ${Events.answer(m.n, e.id)[0]}" style="white-space:normal">${Events.answer(m.n, e.id)[1]}</span></div>
          <div class="bar" style="margin:8px 0"><i style="width:${p}%;background:${Util.attBg(p)}"></i></div>
          <div class="row">${CONFIG.attStates.map(([c, l, k]) => `<button class="btn ${a == c ? k : ''}" onclick="Attendance.mark('${e.id}','${Util.q(m.n)}','${c}')">${l}</button>`).join('')}</div></div>`;
      }).join('')}</div>`}
      ${TPlan.card(e)}${Bring.coach(e)}${SubCoach.card(e)}`;
  }

  /** Souhrn odpovědí rodičů k tréninku: kolik potvrdilo, omluvilo se a nereagovalo. */
  static answers(e) {
    const L = Model.membersOf(e.tm), c = {ok: 0, no: 0, wa: 0};
    L.forEach(m => c[Events.answer(m.n, e.id)[0]]++);
    return `<div class="card" style="margin-top:10px"><b>📋 Odpovědi rodičů</b>
      <div class="row" style="margin-top:6px"><span class="pill ok">✔ Potvrdilo ${c.ok}</span><span class="pill no">✖ Omluveno ${c.no}</span><span class="pill wa">⏳ Nereagovalo ${c.wa}</span></div>
      <div class="mut" style="margin-top:6px">Omluvený hráč se u tréninku automaticky označí jako „Omluven“ i s důvodem.</div></div>`;
  }

  /** Kolik hráčů už má u tréninku označenou docházku. */
  static marked(e) { return Model.membersOf(e.tm).filter(m => DB.att[e.id + '|' + m.n]).length; }

  /** Karta "Moje účast (trenér)" – trenér potvrdí, jestli přijde (u zrušení se upozorní vedení). */
  /** Karta „Moje docházka“ trenéra: procenta, počet účastí a seznam absencí. */
  static mine() {
    const st = Model.coachStats(UI.user.id), known = st.abs.filter(Boolean), shown = known.slice(0, 8);
    return `<div class="card"><div class="pay"><b>👤 Moje absence a docházka</b>${st.t ? `<span class="pill ${Util.attPill(st.pct)}">${st.p}/${st.t}</span>` : '<span class="pill z">zatím bez údajů</span>'}</div>
      ${st.t ? `<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><b class="${Util.attCls(st.pct)}" style="font-size:26px">${st.pct} %</b><span class="mut">účast na trénincích (${st.p}/${st.t})</span></div>
        <div class="bar" style="margin:6px 0 8px"><i style="width:${st.pct}%;background:${Util.attBg(st.pct)}"></i></div>
        <div>${st.abs.length ? `<b>Moje absence (${st.abs.length}):</b> ` + (shown.length ? shown.map(d => esc(Util.isoShort(d))).join(', ') + (known.length > shown.length ? ` a ${known.length - shown.length} dalších` : '') : 'datum se zobrazí po aktualizaci databáze') : '<span class="cg">Žádná absence 👍</span>'}</div>`
        : '<div class="mut" style="margin-top:6px">Docházka se počítá z toho, co u tréninků potvrdíte („Zúčastním se“ / „Nemohu“), nebo z importu tabulky v Nastavení.</div>'}</div>`;
  }

  static coachCard(e, inline) {
    const v = DB.coachAtt[UI.user.id + '|' + e.id];
    return `<div class="${inline ? '' : 'card'}" style="${inline ? 'margin-top:10px' : ''}">
      <div class="pay"><b>👤 Moje účast (trenér)</b>${v ? `<span class="pill ${v == 'y' ? 'ok' : 'no'}">${v == 'y' ? 'Přijdu' : 'Nemohu'}</span>` : ''}</div>
      <div class="row" style="margin-top:8px"><button class="btn ${v == 'y' ? 'ok' : ''}" onclick="Attendance.coachSet(${e.id},'y')">✔ Zúčastním se</button>
      <button class="btn ${v == 'n' ? 'no' : ''}" onclick="Attendance.coachSet(${e.id},'n')">✖ Nemohu</button></div>
      <div class="mut" style="margin-top:6px">Přijdou trenéři: <b>${esc(Model.coachSurnames(e) || '—')}</b></div></div>`;
  }

  // ----- akce -----
  static open(id)  { UI.attEvent = id; App.render(); }   // id události je číslo i text – srovnává se volně
  static close()   { UI.attEvent = 0; App.render(); }
  static mark(eventId, name, state, quiet) {                         // quiet: stránku nepřekresluje (mřížka fotek si dlaždici upraví sama)
    DB.att[eventId + '|' + name] = state; if (!quiet) App.render();
    OfflineQ.save([{event_id: +eventId, player_id: Model.member(name).id, state}], quiet);   // uloží se (bez internetu později) a trenérům přijde Realtime
  }
  /** Hráčům bez značky dá najednou „Přítomen“ (omluvení a neomluvení zůstanou). */
  static allPresent(id) {
    const e = Model.event(id), L = Model.membersOf(e.tm).filter(m => !DB.att[e.id + '|' + m.n]);
    if (!L.length) return Sync.toast('Všichni hráči už mají docházku označenou.', true);
    if (!confirm(`Označit ${L.length} hráčů bez značky jako „Přítomen“?`)) return;
    L.forEach(m => DB.att[e.id + '|' + m.n] = 'P'); App.render();
    OfflineQ.save(L.map(m => ({event_id: +e.id, player_id: m.id, state: 'P'})));
  }
  static coachSet(id, v) {
    const e = Model.event(id);
    DB.coachAtt[UI.user.id + '|' + id] = v; DB.coachNm[UI.user.id + '|' + id] = Util.surname(UI.user.name); DB.coachEv[UI.user.id + '|' + id] = {k: e.k, d: Util.iso(Util.dayDate(e.d))};
    Sync.write('Účast se nepodařilo uložit', sb.from('coach_attendance').upsert({event_id: +id, coach_id: UI.user.id, state: v}, {onConflict: 'event_id,coach_id'}));
    if (v == 'n') Notifs.send('V', `⚠ Trenér ${UI.user.name} se nezúčastní: ${e.k == 'z' ? 'zápas' : 'trénink'} ${Util.date(e.d)} (${e.tm})`);
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Events – správa tréninků a zápasů, zrušení, nominace hráčů (TRENÉR)
   --------------------------------------------------------------------- */
class Events {
  /** Záložka "Zápasy": seznam zápasů týmu → po rozkliknutí detail (nominace, výsledek, zrušení…), stejně jako u tréninků. */
  static view() {
    const team = UI.user.team, list = Model.eventsOf(team).filter(e => e.k == 'z'), e = list.find(x => x.id == UI.matchEvent);
    if (!e) {
      UI.matchEvent = 0;
      return `<h2 style="margin-top:0">Zápasy ${esc(team)}</h2><div class="g2">${list.map(m => {
        const res = DB.results.find(r => r.eid == m.id || (!r.eid && r.tm == m.tm && r.o == m.o)), noms = (DB.nominations[m.id] || []).length;
        return `<div class="card ev ${m.x ? 'x' : 'z'}" style="cursor:pointer" onclick="Events.openMatch('${m.id}')">
          <div class="pay"><b>${m.tour ? '🏅 Turnaj: ' : '🏆 vs. '}${esc(m.o)}</b><span class="pill ${m.x ? 'x' : 'z'}">${m.x ? 'Zrušeno' : Util.date(m.d)}</span></div>
          <div class="mut">${esc(m.t)} · 📍 ${esc(m.pl)}</div>
          <div class="mut">${m.tour ? (Tour.games(m).length ? '🏁 ' + Tour.games(m).length + ' utkání' + (m.rank ? ' · ' + esc(m.rank) + '. místo' : '') : 'Klepnutím otevřete turnaj →') : res ? '🏁 ' + res.s[0] + ':' + res.s[1] : noms ? (m.nc ? '🔒 Nominace uzavřena' : 'Nominace rozpracována') + ' · ' + noms + ' hráčů · ' + Events.confirmSummary(m) : 'Klepnutím otevřete zápas →'}</div></div>`;
      }).join('') || Look.empty('trophy', 'Zatím žádné zápasy', 'Tento týden zatím žádný zápas. Přidejte ho formulářem níže.')}</div>${Events.form()}`;
    }
    return `<button class="btn" onclick="Events.closeMatch()">← Zápasy</button>
      <h2>${e.tour ? '🏅 Turnaj: ' : '🏆 vs. '}${esc(e.o)} · ${Util.date(e.d)} · ${esc(e.t)}</h2>
      <div class="card ev ${e.x ? 'x' : e.k}"><div class="pay"><b>📍 ${esc(e.pl)} · ${e.tour ? 'turnaj ' : 'vs. '}${esc(e.o)}</b><span class="pill ${e.x ? 'x' : 'z'}">${e.x ? 'Zrušeno' : e.tour ? 'Turnaj' : 'Zápas'}</span></div>
        ${Weather.line(e)}${Venues.placeBox(e)}
        <div class="row" style="margin-top:8px">
          ${!e.x ? `<button class="btn" onclick="Events.toggleNomination('${e.id}')">${e.nc ? '🔒 ' : ''}Nominace (${(DB.nominations[e.id] || []).length})</button>` : ''}
          ${!e.x && !e.tour ? `<button class="btn" onclick="Events.toggleResult('${e.id}')">🏁 Výsledek</button>` : ''}
          ${Events.notifyBtn(e)}
          <button class="btn" onclick="Events.cancel(${e.id})">${e.x ? 'Obnovit' : 'Zrušit'}</button><button class="btn" style="flex:none;color:var(--r)" onclick="Events.remove(${e.id})">🗑 Smazat</button></div>
        ${e.x ? '' : Attendance.coachCard(e, true)}${UI.nomEvent == e.id ? Events.nominationBox(e) : ''}${UI.resEvent == e.id ? Events.resultBox(e) : ''}
        ${e.x ? '' : Carpool.list(e)}</div>
      ${e.x || !e.tour ? '' : Tour.box(e)}${ResultImg.forEvent(e)}
      ${e.x ? '' : Events.confirmBox(e) + Bring.coach(e) + SubCoach.card(e)}`;
  }
  static openMatch(id) { UI.matchEvent = id; UI.nomEvent = 0; UI.resEvent = 0; App.render(); }
  static closeMatch()  { UI.matchEvent = 0; UI.nomEvent = 0; UI.resEvent = 0; App.render(); }

  /** Formulář "+ Přidat zápas". */
  static form() {
    return `<h2>+ Přidat zápas</h2><div class="card">
      <div class="row"><select id="ev-day">${CONFIG.days.map((n, i) => `<option value="${i}">${Util.date(i)}</option>`).join('')}</select></div>
      ${Venues.select('ev-place')}
      <input id="ev-time" placeholder="Čas (16:00)"><input id="ev-opp" placeholder="Soupeř (u turnaje název turnaje)">
      <label class="pl"><span>🏅 Turnaj (víc utkání v jeden den)</span><input id="ev-tour" type="checkbox"></label>
      <label class="pl"><span>🔔 Upozornit rodiče na nový zápas</span><input id="ev-notify" type="checkbox"></label>
      <button class="btn ok" style="width:100%" onclick="Events.add('z')">Přidat zápas</button></div>`;
  }

  /** Seznam hráčů k nominaci na zápas. Po potvrzení je nominace uzavřená (jen k prohlížení), dokud ji trenér znovu neotevře. */
  static nominationBox(e) {
    const L = DB.nominations[e.id] || [], lock = !!e.nc;
    return `<div style="margin-top:10px">${lock ? '<div class="mut" style="margin-bottom:6px">🔒 Nominace je potvrzena a uzavřena. Rodiče nominovaných hráčů o ní vědí.</div>' : ''}
      ${Model.membersOf(e.tm).map(m => `<label class="pl"><span>${m.n}</span>
      <input type="checkbox" ${L.includes(m.n) ? 'checked' : ''} ${lock ? 'disabled' : ''} onchange="Events.toggleNominee(${e.id},'${Util.q(m.n)}',this.checked)"></label>`).join('')}
      ${lock ? `<button class="btn" style="width:100%;margin-top:8px" onclick="Events.reopenNomination(${e.id})">🔓 Znovu otevřít nominaci</button>`
             : `<button class="btn ok" style="width:100%;margin-top:8px" onclick="Events.confirmNomination(${e.id})">✔ Potvrdit nominaci (${L.length})</button>`}</div>`;
  }

  /** Odpověď rodiče u hráče: ✔ potvrdil / ✖ omluven + důvod / ⏳ nepotvrdil. */
  static answer(name, eventId) {
    const r = DB.responses[name + '|' + eventId];
    if (!r) return ['wa', '⏳ Zatím nepotvrdil'];
    if (r.s == 'y') return ['ok', '✔ Potvrdil účast'];
    return ['no', '✖ Omluven' + (r.r ? ' – ' + esc(r.r) : '') + (r.x ? ' (' + esc(r.x) + ')' : '')];
  }
  /** „5 z 8 potvrdilo“ pro nominované hráče. */
  static confirmSummary(e) {
    const L = DB.nominations[e.id] || [], y = L.filter(n => (DB.responses[n + '|' + e.id] || {}).s == 'y').length;
    return `potvrdilo ${y} z ${L.length}`;
  }
  /** Karta pro trenéra: kdo z nominovaných má potvrzenou účast a kdo ne. */
  static confirmBox(e) {
    const L = DB.nominations[e.id] || [];
    if (!L.length) return '';
    const rows = L.map(n => ({n, a: Events.answer(n, e.id)}));
    const ord = {ok: 0, wa: 1, no: 2};
    rows.sort((x, y) => ord[x.a[0]] - ord[y.a[0]] || x.n.localeCompare(y.n, 'cs'));
    return `<div class="card" style="margin-top:10px"><div class="pay"><b>📋 Potvrzení účasti nominovaných</b><span class="pill ${e.nc ? 'ok' : 'wa'}">${e.nc ? 'nominace uzavřena' : 'nominace rozpracována'}</span></div>
      <div class="mut">${Events.confirmSummary(e)}</div>
      ${rows.map(r => `<div class="pay" style="margin-top:6px"><span>${esc(r.n)}</span><span class="pill ${r.a[0]}" style="max-width:62%;white-space:normal;text-align:right">${r.a[1]}</span></div>`).join('')}</div>`;
  }

  /** Zápis výsledku zápasu: skóre + střelci. Rodiče kategorie dostanou upozornění, hráčům se přičtou góly a zápasy. */
  static toggleResult(id) { UI.resEvent = UI.resEvent == id ? '' : id; App.render(); }
  static resultBox(e) {
    const L = Model.membersOf(e.tm);
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px"><b>🏁 ${e.tour ? 'Utkání turnaje ' + esc(e.o) : 'Výsledek vs. ' + esc(e.o)}</b>
      ${e.tour ? '<input id="rs-opp" placeholder="Soupeř v tomto utkání" autocomplete="off" style="margin-top:6px">' : ''}
      <div class="row" style="margin-top:6px"><label class="mut">Naše góly<input id="rs-us" type="number" min="0" value="0"></label><label class="mut">Soupeř<input id="rs-them" type="number" min="0" value="0"></label>
        <label class="mut">Hráno<select id="rs-home"><option value="1">doma</option><option value="0">venku</option></select></label></div>
      <div class="mut" style="margin-top:6px">Střelci (počet gólů):</div>
      ${L.map((m, i) => `<div class="pay" style="margin-top:4px"><span>${esc(m.full || m.n)}</span><input id="rg-${i}" type="number" min="0" value="0" style="width:70px"></div>`).join('')}
      <label class="pl"><span>🔔 Upozornit rodiče na výsledek</span><input id="rs-notify" type="checkbox"></label>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="Events.toggleResult('${e.id}')">Zrušit</button><button class="btn ok" onclick="Events.saveResult('${e.id}')">Uložit výsledek</button></div></div>`;
  }
  static async saveResult(id) {
    const e = Model.event(id), us = +$('#rs-us').value || 0, them = +$('#rs-them').value || 0, home = $('#rs-home').value == '1';
    const opp = e.tour ? (($('#rs-opp') || {}).value || '').trim().slice(0, 80) : e.o;
    if (!opp) return alert('Napište soupeře.');
    const L = Model.membersOf(e.tm), scorers = {};
    L.forEach((m, i) => { const g = +$('#rg-' + i).value || 0; if (g > 0) scorers[m.n] = g; });
    if (Object.values(scorers).reduce((a, b) => a + b, 0) > us) return alert('Střelců je víc gólů, než dal tým.');
    const date = Util.iso(Util.dayDate(e.d));
    const r = await Sync.write('Výsledek se nepodařilo uložit', sb.from('results').insert({team: e.tm, played_on: date, opponent: opp, home, score_us: us, score_them: them, scorers, event_id: e.id}).select().single());
    if (!r) return;
    DB.results.unshift({id: r.data.id, eid: e.id, tm: e.tm, d: Util.short(date), o: opp, h: home ? 1 : 0, s: [us, them], g: scorers});
    Object.entries(scorers).forEach(([n, g]) => { const m = Model.member(n); if (m) { m.gl += g; Sync.savePlayer(m.id, true); } });
    (DB.nominations[id] || []).forEach(n => { const m = Model.member(n); if (m) { m.mp++; Sync.savePlayer(m.id, true); } });
    if ($('#rs-notify') && $('#rs-notify').checked) Notifs.send('P', `🏁 ${e.tour ? 'Turnaj ' + e.o + ' – ' : 'Výsledek '}${e.tm}: ${home ? CLUB + ' ' + us + ':' + them + ' ' + opp : opp + ' ' + them + ':' + us + ' ' + CLUB}`, {team: e.tm, tab: 'cal'});
    UI.resEvent = ''; App.render();
  }

  // ----- akce -----
  static toggleNomination(id) { UI.nomEvent = UI.nomEvent == id ? 0 : id; App.render(); }
  static toggleNominee(id, name, on) {
    if ((Model.event(id) || {}).nc) return alert('Nominace je uzavřena – nejdřív ji znovu otevřete.');
    const L = DB.nominations[id] = (DB.nominations[id] || []).filter(x => x != name), m = Model.member(name);
    if (on) L.push(name);
    App.render();
    Sync.write('Nominaci se nepodařilo uložit', on
      ? sb.from('nominations').upsert({event_id: +id, player_id: m.id}, {onConflict: 'event_id,player_id'})
      : sb.from('nominations').delete().eq('event_id', +id).eq('player_id', m.id));
  }
  /** Potvrdí a uzavře nominaci: rodiče nominovaných dětí dostanou upozornění a mohou potvrdit účast. */
  static async confirmNomination(id) {
    const e = Model.event(id), L = DB.nominations[id] || [];
    if (!L.length) return alert('Nejdřív vyberte aspoň jednoho hráče.');
    const r = await Sync.write('Nominaci se nepodařilo potvrdit', sb.from('events').update({nom_closed: true}).eq('id', +id));
    if (!r) return;
    e.nc = 1;
    L.forEach(n => Notifs.send('K', `🏆 ${n} je nominován(a) na zápas vs. ${e.o} (${Util.date(e.d)}) – potvrďte prosím účast`, {kid:n, tab:'cal'}));   // rodiče nominovaných
    UI.nomEvent = 0;
    App.render();
  }
  /** Znovu otevře uzavřenou nominaci (hráče lze zase měnit). */
  static async reopenNomination(id) {
    const e = Model.event(id);
    const r = await Sync.write('Nominaci se nepodařilo otevřít', sb.from('events').update({nom_closed: false}).eq('id', +id));
    if (!r) return;
    e.nc = 0; App.render();
  }
  /** Zruší / obnoví událost; při zrušení dostanou rodiče notifikaci. */
  /** Upozornění rodičům kategorie na akci (posílá se jen na výběr trenéra – nic automaticky). */
  static notifyParents(e, silent) {
    Notifs.send('P', `📅 ${e.k == 'z' ? 'Zápas vs. ' + e.o : 'Trénink'} ${Util.date(e.d)} v ${e.t} · ${e.pl} (${e.tm})`, {team: e.tm, tab: 'cal'});
    if (!silent) Sync.toast('✔ Rodiče kategorie ' + e.tm + ' upozorněni.', true);
  }
  /** Tlačítko „Upozornit rodiče“ u akce. */
  static notifyBtn(e) {
    return e.x ? '' : `<button class="btn" onclick="event.stopPropagation();Events.notifyParents(Model.event(${e.id}))">🔔 Upozornit rodiče</button>`;
  }
  static cancel(id) {
    const e = Model.event(id), what = e.k == 'z' ? 'Zápas' : 'Trénink';
    let tell = false;
    if (!e.x) {                                                                          // rušení: potvrdit a zvlášť rozhodnout o upozornění
      if (!confirm(`Zrušit ${what.toLowerCase()} ${Util.date(e.d)} (${e.tm})?`)) return;
      tell = confirm('Poslat rodičům upozornění o zrušení?\n\nOK = poslat, Zrušit = neposílat');
    }
    e.x = e.x ? 0 : 1;
    App.render();
    Sync.write('Událost se nepodařilo upravit', sb.from('events').update({cancelled: !!e.x}).eq('id', id));
    if (e.x && tell) Notifs.send('P', `❌ ${what} ${Util.date(e.d)} (${e.tm}) byl zrušen`, {team: e.tm, tab:'cal'});
  }
  /** Smaže událost úplně (včetně docházky, nominací a odpovědí rodičů). Rodiče dostanou upozornění, byla-li ještě platná. */
  static async remove(id) {
    const e = Model.event(id); if (!e) return;
    if (!confirm(`Smazat ${e.k == 'z' ? 'zápas vs. ' + e.o : 'trénink'} ${Util.date(e.d)} (${e.tm}) úplně? Smaže se i docházka a nominace. Nelze vrátit.`)) return;
    const tell = !e.x && confirm('Poslat rodičům upozornění, že akce byla zrušena?\n\nOK = poslat, Zrušit = neposílat');
    const r = await Sync.write('Událost se nepodařilo smazat', sb.from('events').delete().eq('id', e.id).select());
    if (!r) return;
    if (!r.data || !r.data.length) return Sync.toast('Smazání nebylo povoleno.');
    DB.events = DB.events.filter(x => x.id != e.id); delete DB.nominations[e.id]; delete DB.att[e.id]; delete DB.coachAtt[e.id];
    if (UI.attEvent == e.id) UI.attEvent = 0;
    if (!e.x && tell) Notifs.send('P', `❌ ${e.k == 'z' ? 'Zápas' : 'Trénink'} ${Util.date(e.d)} (${e.tm}) byl zrušen`, {team: e.tm, tab:'cal'});
    await Sync.loaders.players(); Sync.toast('✔ Smazáno.', true); App.render();
  }
  /** Přidá novou událost týmu přihlášeného trenéra a upozorní rodiče. */
  static async add(k) {
    const u = UI.user, pf = k == 'z' ? 'ev' : 'tr', d = +$('#' + pf + '-day').value, place = $('#' + pf + '-place').value;
    const o = k == 'z' ? ($('#ev-opp').value.trim() || '?') : '', time = /^\d{1,2}:\d{2}$/.test($('#' + pf + '-time').value.trim()) ? $('#' + pf + '-time').value.trim() : '16:00';
    if (place == '__new') return alert('Vyberte místo.');
    const tour = k == 'z' && !!($('#ev-tour') || {}).checked;
    const r = await Sync.write('Událost se nepodařilo přidat', sb.from('events').insert({
      kind: k, team: u.team, event_date: Util.iso(Util.dayDate(d)), time, place, meet: '15 min předem', coach: u.name, opponent: o, tour}).select().single());
    if (!r) return;
    const ne = {id: r.data.id, k, tm: u.team, d, t: time, pl: place, m: '15 min předem', c: u.name, o, x: 0, br: '', tour: tour ? 1 : 0, rank: '', sc: null};
    if ($('#ev-tour')) $('#ev-tour').checked = false;
    DB.events.push(ne);
    if ($('#' + pf + '-notify').checked) Events.notifyParents(ne);                       // jen když to trenér zvolil
    $('#' + pf + '-notify').checked = false;
    UI.skipKeep = [pf + '-time', 'ev-opp'];
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Roster – soupiska týmu a detailní profil hráče (TRENÉR)
   Profil: fotka, základní údaje, kontakty na rodiče, zdraví a poznámky, statistiky.
   (Údaj o postu hráče se záměrně neeviduje.)
   --------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   Photos – fotky v soukromém úložišti Supabase (bucket "photos"). V tabulkách je jen cesta (players/<id>-<čas>.jpg),
   obrázek se stáhne jednou na zařízení a uloží do paměti prohlížeče (Cache Storage), takže se nestahuje při každém spuštění.
   Dřívější fotky uložené přímo v tabulce (data:image…) se zobrazují dál a po přihlášení se samy převedou do úložiště.
   --------------------------------------------------------------------- */
class Photos {
  static map = {};                 // cesta → blob URL (hotové obrázky)
  static failed = {};              // cesta → 1 (nepodařilo se stáhnout, v tomto sezení se neopakuje)
  static queue = []; static active = 0; static pending = new Set();
  static CACHE = 'unie-photos'; static BASE = 'https://photos.invalid/';
  static isPath(s)   { return /^(players|users)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.jpg$/.test(s || ''); }
  static isLegacy(s) { return /^data:image\//.test(s || ''); }

  /** Adresa obrázku k okamžitému zobrazení. Když ještě není stažený, vrátí '' a stahování se zařadí do fronty. */
  static src(ref) {
    if (Photos.isLegacy(ref)) return ref;
    if (!Photos.isPath(ref)) return '';
    if (Photos.map[ref]) return Photos.map[ref];
    if (!Photos.failed[ref] && !Photos.pending.has(ref)) { Photos.pending.add(ref); Photos.queue.push(ref); Photos.pump(); }
    return '';
  }
  static pump() {
    while (Photos.active < 4 && Photos.queue.length) { Photos.active++; Photos.load(Photos.queue.shift()); }
  }
  static async load(path) {
    try {
      const c = window.caches ? await caches.open(Photos.CACHE) : null, key = Photos.BASE + path;
      const hit = c ? await c.match(key) : null;
      let blob;
      if (hit) blob = await hit.blob();
      else {
        const { data, error } = await sb.storage.from('photos').download(path);
        if (error || !data) throw error || new Error('prázdná odpověď');
        blob = data;
        if (c) { try { await c.put(key, new Response(blob, {headers: {'Content-Type': 'image/jpeg'}})); } catch (e) {} }
      }
      Photos.map[path] = URL.createObjectURL(blob);
      Photos.paint(path);
    } catch (e) { Photos.failed[path] = 1; console.warn('Fotka se nenačetla', path, e); }
    finally { Photos.pending.delete(path); Photos.active--; Photos.pump(); }
  }
  /** Doplní už zobrazené iniciály o fotku (bez překreslení celé stránky). */
  static paint(path) {
    document.querySelectorAll('[data-ph]').forEach(el => {
      if (el.dataset.ph != path) return;
      el.style.background = `center / cover no-repeat url("${Photos.map[path]}")`; el.style.color = 'transparent'; el.textContent = ''; el.removeAttribute('data-ph');
    });
  }
  /** Adresa pro úpravu fotky (Cropper): data URL, nebo stažený obrázek. */
  static url(ref) { return Photos.isLegacy(ref) ? ref : (Photos.map[ref] || ''); }

  static toBlob(dataUrl) {
    const [head, b64] = dataUrl.split(','), bin = atob(b64), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], {type: /data:([^;]+)/.exec(head)[1]});
  }
  /** Nahraje fotku (data URL z Cropperu) do úložiště a vrátí cestu. */
  static async upload(kind, id, dataUrl) {
    const blob = Photos.toBlob(dataUrl), path = `${kind}/${id}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('photos').upload(path, blob, {contentType: 'image/jpeg', upsert: false});
    if (error) throw error;
    Photos.map[path] = URL.createObjectURL(blob);
    if (window.caches) { try { (await caches.open(Photos.CACHE)).put(Photos.BASE + path, new Response(blob, {headers: {'Content-Type': 'image/jpeg'}})); } catch (e) {} }
    return path;
  }
  /** Uloží novou fotku: do úložiště; když ještě není připravené (nespuštěné SQL), dočasně přímo jako data URL. */
  static async store(kind, id, dataUrl) {
    try { return await Photos.upload(kind, id, dataUrl); }
    catch (e) { console.warn('Úložiště fotek není k dispozici, fotka se uloží přímo do tabulky.', e); return dataUrl; }
  }
  /** Smaže starý soubor (když je to cesta); chyby nevadí. */
  static async remove(ref) {
    if (!Photos.isPath(ref)) return;
    try { await sb.storage.from('photos').remove([ref]); } catch (e) {}
    delete Photos.failed[ref];
    if (window.caches) { try { (await caches.open(Photos.CACHE)).delete(Photos.BASE + ref); } catch (e) {} }
  }
  /** Při odhlášení smazat fotky z paměti zařízení (sdílený telefon). */
  static async clear() {
    Object.values(Photos.map).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    Photos.map = {}; Photos.failed = {}; Photos.queue = []; Photos.migrated = false;
    if (window.caches) { try { await caches.delete(Photos.CACHE); } catch (e) {} }
  }
  /** Smaže z paměti zařízení fotky, které už nikdo nepoužívá (po výměně fotky zůstávají staré soubory). */
  static async prune() {
    if (!window.caches) return;
    try {
      const used = new Set([...DB.members.map(m => m.ph), ...Object.values(DB.users).map(u => u.ph)].filter(Photos.isPath));
      const c = await caches.open(Photos.CACHE);
      for (const r of await c.keys()) if (!used.has(r.url.slice(Photos.BASE.length))) await c.delete(r);
    } catch (e) {}
  }

  /** Jednou za přihlášení: převede dřívější fotky z tabulek do úložiště (jen ty, které smí uživatel měnit). */
  static async migrate() {
    const u = UI.user; if (!u || Photos.migrated) return; Photos.migrated = true;
    try {
      const mine = DB.members.filter(m => Photos.isLegacy(m.ph) && (u.r == 'v' || u.r == 'a' || (u.r == 'c' && m.t == u.team)));
      for (const m of mine) {
        const legacy = m.ph, path = await Photos.upload('players', m.id, legacy);
        const { error } = await sb.from('players').update({photo: path}).eq('id', m.id);
        if (error) { await Photos.remove(path); throw error; }
        if (m.ph == legacy) m.ph = path;
      }
      if (Photos.isLegacy(u.ph)) {
        const legacy = u.ph, path = await Photos.upload('users', u.id, legacy);
        const { error } = await sb.rpc('set_my_photo', {p_photo: path});
        if (error) { await Photos.remove(path); throw error; }
        if (u.ph == legacy) u.ph = path;
      }
      if (mine.length || Photos.isPath(u.ph)) App.render();
    } catch (e) { console.warn('Převod fotek do úložiště se nezdařil (spustili jste aktuální schema.sql?)', e); }
    Photos.prune();
  }
}

/** Úprava fotky před uložením: posun (tažení), zvětšení / zmenšení (posuvník, kolečko, dva prsty), otočení a ořez na čtverec. */
class Cropper {
  static V = 280;                                                                   // velikost náhledu v px
  static open(src, done) {
    const im = new Image();
    im.onload = () => Cropper.start(im, done);
    im.onerror = () => Sync.toast('Fotku se nepodařilo načíst.');
    im.src = src;
  }
  static start(im, done) {
    const V = Cropper.V, st = {im, rot: 0, z: 1, ox: 0, oy: 0};
    const el = document.createElement('div');
    el.id = 'cropper';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px';
    el.innerHTML = `<div style="background:#1a2030;color:var(--tx);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:340px;width:100%;text-align:center">
      <b>Upravit fotku</b><div class="mut" style="margin:2px 0 10px">Tažením posunete, posuvníkem nebo dvěma prsty zvětšíte.</div>
      <div style="position:relative;width:${V}px;height:${V}px;margin:0 auto;overflow:hidden;border-radius:10px;touch-action:none;background:#000">
        <canvas id="crop-cv" width="${V}" height="${V}" style="width:${V}px;height:${V}px;touch-action:none;cursor:grab"></canvas>
        <div style="position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 999px rgba(0,0,0,.55);pointer-events:none;border:2px solid rgba(255,255,255,.7)"></div></div>
      <div style="display:flex;gap:8px;align-items:center;margin:12px 0">
        <span>➖</span><input id="crop-z" type="range" min="1" max="4" step="0.01" value="1" style="flex:1;width:auto"><span>➕</span></div>
      <div class="row" style="gap:8px">
        <button class="btn" id="crop-rot" style="flex:none">⟳ Otočit</button>
        <button class="btn" id="crop-no">Zrušit</button>
        <button class="btn ok" id="crop-ok">Uložit</button></div></div>`;
    document.body.appendChild(el);
    const cv = el.querySelector('#crop-cv'), ctx = cv.getContext('2d');
    const dims = () => { const sw = st.rot % 2 ? im.height : im.width, sh = st.rot % 2 ? im.width : im.height, base = V / Math.min(sw, sh); return {sw, sh, s: base * st.z}; };
    const clamp = () => { const d = dims(), mx = Math.max(0, (d.sw * d.s - V) / 2), my = Math.max(0, (d.sh * d.s - V) / 2); st.ox = Math.max(-mx, Math.min(mx, st.ox)); st.oy = Math.max(-my, Math.min(my, st.oy)); };
    const paint = (c, k) => {                                                       // k = měřítko výstupu
      const d = dims(); c.fillStyle = '#000'; c.fillRect(0, 0, V * k, V * k);
      c.save(); c.translate(V * k / 2 + st.ox * k, V * k / 2 + st.oy * k); c.rotate(st.rot * Math.PI / 2); c.scale(d.s * k, d.s * k);
      c.drawImage(im, -im.width / 2, -im.height / 2); c.restore();
    };
    const draw = () => { clamp(); paint(ctx, 1); el.querySelector('#crop-z').value = st.z; };
    const zoom = z => { st.z = Math.max(1, Math.min(4, z)); draw(); };
    const P = new Map(); let last = 0;
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); P.set(e.pointerId, {x: e.clientX, y: e.clientY}); last = 0; cv.style.cursor = 'grabbing'; };
    cv.onpointermove = e => {
      const p = P.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (P.size == 1) { st.ox += dx; st.oy += dy; draw(); }
      else if (P.size == 2) { const [a, b] = [...P.values()], dist = Math.hypot(a.x - b.x, a.y - b.y); if (last) zoom(st.z * dist / last); last = dist; }
    };
    cv.onpointerup = cv.onpointercancel = e => { P.delete(e.pointerId); last = 0; cv.style.cursor = 'grab'; };
    cv.onwheel = e => { e.preventDefault(); zoom(st.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    el.querySelector('#crop-z').oninput = e => zoom(+e.target.value);
    el.querySelector('#crop-rot').onclick = () => { st.rot = (st.rot + 1) % 4; st.ox = st.oy = 0; draw(); };
    el.querySelector('#crop-no').onclick = () => el.remove();
    el.querySelector('#crop-ok').onclick = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256; paint(c.getContext('2d'), 256 / V);
      el.remove(); done(c.toDataURL('image/jpeg', .85));
    };
    draw();
  }
}

class Roster {
  /** Záložka "Soupiska": seznam hráčů týmu, nebo detail vybraného hráče. */
  static view() {
    const team = UI.user.team;
    const L = Model.membersOf(team).map(Model.fillProfile).sort((a, b) => (a.no === '' ? 99 : a.no) - (b.no === '' ? 99 : b.no));
    if (UI.player) {                                                   // detail otevřeného hráče
      const m = Model.byId(UI.player);
      if (m && m.t == team) return Roster.detail(Model.fillProfile(m));
      UI.player = '';
    }
    const withHealth = L.filter(m => m.al || m.lim).length;
    const avg = L.length ? Math.round(L.reduce((s, m) => s + Model.attPct(m), 0) / L.length) : 0;
    return `<div class="col">
      <div class="card"><div class="pay"><b>👥 Soupiska ${team}</b><span class="pill z">${L.length} hráčů</span></div>
        <div class="mut">Průměrná docházka ${avg} % · zdravotní poznámka u ${withHealth} hráčů</div></div>
      ${L.map(m => `<div class="card pcard" onclick="Roster.open('${m.id}')">${Util.avatar(m, 52)}
        <div class="pi"><b>${esc(m.full)}</b><div class="mut">#${m.no === '' ? '–' : m.no} · ${Util.age(m)}</div></div>
        <div class="pr"><b class="${Util.attCls(Model.attPct(m))}">${Model.attPct(m)} %</b><span class="mut" style="font-size:12px">${Model.attCount(m).join('/')}</span>${m.al || m.lim ? '<span title="Zdravotní poznámka">🩹</span>' : ''}</div></div>`).join('')}
      ${UI.addPlayer ? Roster.addForm() : `<button class="btn ok" style="width:100%" onclick="Roster.toggleAdd(true)">+ Přidat hráče</button>`}</div>`;
  }

  /** Formulář nového hráče. */
  static addForm() {
    return `<div class="card"><b>+ Nový hráč</b><input id="pl-name" placeholder="Jméno a příjmení" autocomplete="off">
      <div class="row"><input id="pl-no" type="number" placeholder="Číslo dresu"><input id="pl-year" type="number" placeholder="Ročník (např. 2017)"></div>
      ${UI.playerMsg ? `<div class="mut cr">${UI.playerMsg}</div>` : ''}
      <div class="row" style="margin-top:6px"><button class="btn" onclick="Roster.toggleAdd(false)">Zrušit</button><button class="btn ok" onclick="Roster.add()">Přidat hráče</button></div></div>`;
  }

  /** Karta hráče. Všechna pole se upravují přímo a ukládají se automaticky do databáze (oninput). */
  static detail(m) {
    const st = DB.docs[m.n] || 'wait', doc = CONFIG.docStatus[st], ap = Model.attPct(m), tags = DB.notes[m.n] || [], id = m.id;
    return `<div class="col"><button class="btn" onclick="Roster.close()">← Soupiska ${m.t}</button>

      <!-- a) FOTKA + hlavní údaje -->
      <div class="card" style="margin-top:10px;text-align:center">${Util.avatar(m, 104)}
        <div style="margin-top:8px"><b style="font-size:18px">${esc(m.full)}</b><div class="mut">#${m.no === '' ? '–' : m.no} · ${Util.age(m)} · ${m.t}</div></div>
        <div class="row" style="margin-top:10px;justify-content:center">
          <label class="btn" style="flex:none;cursor:pointer">📷 ${m.ph ? 'Změnit fotku' : 'Nahrát fotku'}<input type="file" accept="image/*" hidden onchange="Roster.photo('${id}',this)"></label>
          ${m.ph ? `<button class="btn" style="flex:none" onclick="Roster.editPhoto('${id}')">✂ Upravit</button><button class="btn" style="flex:none" onclick="Roster.removePhoto('${id}')">Odebrat</button>` : ''}</div>
        <div class="mut" style="margin-top:6px">Fotku nahrávejte jen se souhlasem rodičů.</div></div>

      <!-- e) RYCHLÉ STATISTIKY -->
      <h2 style="margin-top:4px">📊 Rychlé statistiky</h2>
      <div class="row">${[[ap + ' %','Docházka', Util.attCls(ap)], [m.mp,'Odehrané zápasy',''], [m.gl,'Vstřelené góly','']]
        .map(([v, l, c]) => `<div class="card stat"><b class="${c}">${v}</b><span class="mut">${l}</span></div>`).join('')}</div>
      <div class="row" style="margin:8px 0 10px"><button class="chip" onclick="Roster.bump('${id}','mp')">+ odehraný zápas</button><button class="chip" onclick="Roster.bump('${id}','gl')">⚽ + gól</button></div>
      <button class="chip" style="color:var(--r);margin-bottom:10px" onclick="Roster.remove('${id}')">🗑 Smazat hráče</button>

      ${KidProfile.attCard(m)}

      <!-- stálá absence na trénincích -->
      <div class="card"><b>📅 Stálá absence na trénincích</b>
        <div class="mut">Dny, kdy hráč pravidelně nemůže (např. každé úterý). U nových tréninků v ten den se předvyplní „Omluven“, u konkrétního tréninku to můžete opravit.</div>
        <div class="row" style="margin-top:8px;flex-wrap:wrap">${CONFIG.days.map((d, i) => `<button class="chip ${(DB.pabs[id] || []).includes(i) ? 'on' : ''}" onclick="Roster.toggleAbs('${id}',${i})">${d}</button>`).join('')}</div></div>

      ${Absence.card(m.n)}

      <!-- platby hráče (jen ke čtení – upravuje vedení) -->
      <div class="card"><div class="pay"><b>💳 Platby</b><span class="pill ${Model.debt(m) ? 'no' : 'ok'}">${Model.debt(m) ? 'Dluh ' + Model.debt(m) + ' Kč' : 'Vše zaplaceno'}</span></div>
        ${DB.payItems.map((it, i) => `<div class="pl"><span>${esc(it.n)}</span><span><b>${it.a} Kč</b> <span class="pill ${m.p[i] ? 'ok' : 'no'}">${m.p[i] ? 'zaplaceno' : 'nezaplaceno'}</span></span></div>`).join('') || '<div class="mut">Žádné příspěvky.</div>'}
        <div class="mut" style="margin-top:6px">Platby eviduje vedení klubu.</div></div>

      <div class="mut" style="margin:-4px 0 10px">📷 Souhlas rodiče s focením: ${Roster.photoConsent(m)}</div>

      <!-- b) ZÁKLADNÍ ÚDAJE -->
      <div class="card"><b>🪪 Základní údaje</b>
        <label class="mut">Jméno a příjmení<input value="${esc(m.full)}" oninput="Roster.set('${id}','full',this.value)"></label>
        <div class="row"><label class="mut">Číslo dresu<input type="number" min="0" max="99" value="${m.no}" oninput="Roster.setNum('${id}','no',this.value)"></label>
          <label class="mut">Ročník narození<input type="number" min="2005" max="2026" value="${m.by}" oninput="Roster.setNum('${id}','by',this.value)"></label></div></div>

      <!-- c) KONTAKTY NA RODIČE (rychlý prokliknutí: telefon, SMS, e-mail) -->
      <div class="card"><b>👪 Kontakty na rodiče</b>
        ${m.par.map((q, j) => `<div style="margin-top:10px;${j ? 'border-top:1px solid var(--bd);padding-top:10px' : ''}">
          <input value="${esc(q.n)}" placeholder="Jméno rodiče" oninput="Roster.setParent('${id}',${j},'n',this.value)">
          <input type="tel" value="${esc(q.ph)}" placeholder="Telefon" oninput="Roster.setParent('${id}',${j},'ph',this.value)">
          <input type="email" value="${esc(q.em)}" placeholder="E-mail" oninput="Roster.setParent('${id}',${j},'em',this.value)">
          <div class="row" style="margin-top:6px"><a class="btn" id="tl${j}" href="tel:${esc(Util.phone(q.ph))}">📞 Zavolat</a>
            <a class="btn" id="sm${j}" href="sms:${esc(Util.phone(q.ph))}">💬 SMS</a><a class="btn" id="ml${j}" href="mailto:${esc(q.em)}">✉ E-mail</a></div></div>`).join('')}
        <button class="chip" style="margin-top:10px" onclick="Roster.addParent('${id}')">+ Další rodič</button></div>

      <!-- d) ZDRAVÍ A POZNÁMKY -->
      <div class="card"><div class="pay"><b>🩺 Zdraví a poznámky</b><span class="pill ${doc[1]}">Prohlídka: ${doc[0]}</span></div>
        <label class="mut">Alergie<input value="${esc(m.al)}" placeholder="Žádné" oninput="Roster.set('${id}','al',this.value)"></label>
        <label class="mut">Zdravotní omezení<input value="${esc(m.lim)}" placeholder="Žádná" oninput="Roster.set('${id}','lim',this.value)"></label>
        <label class="mut">Zdravotní prohlídka<select onchange="Roster.setDoc('${id}',this.value)">${Object.entries(CONFIG.docStatus).map(([k, v]) => `<option value="${k}" ${k == st ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="mut">Poznámka trenéra<textarea rows="3" placeholder="Např. pochvala za bojovnost, zraněné koleno…" oninput="Roster.set('${id}','tn',this.value)">${esc(m.tn)}</textarea></label>
        <div class="mut" style="margin-top:6px">Ukládá se automaticky. Poznámku trenéra rodiče nevidí.</div>
        ${tags.length ? `<div style="margin-top:10px"><b>📝 Trenérský deník</b>${tags.map(n => `<div class="mut">${CONFIG.noteTags[n.g].slice(0,2)} ${n.d} – ${esc(n.x)}${n.sh ? ' <span title="Vidí rodič">👪</span>' : ''}${n.rem && !n.done ? ' ⏰ ' + Util.short(n.rem) : ''}</div>`).join('')}</div>` : ''}</div></div>`;
  }

  /** Souhlas s focením podle účtů rodičů přiřazených k dítěti. */
  static photoConsent(m) {
    const ps = DB.links.filter(l => l.player_id == m.id).map(l => DB.users[l.parent_id]).filter(Boolean);
    if (!ps.length) return '<b>rodič nemá v aplikaci účet</b>';
    return ps.some(x => x.pc) ? '<b class="cg">ano</b>' : ps.some(x => x.consent) ? '<b class="cr">ne</b>' : '<b>zatím nevyplněno</b>';
  }

  // ----- akce (id = id hráče v databázi) -----
  static open(id)  { UI.player = id; App.render(); }
  static close()   { UI.player = ''; App.render(); }
  /** Smaže hráče včetně docházky, plateb a vazeb na rodiče (rodičovské účty zůstanou). */
  /** Zapne / vypne stálou absenci hráče v daný den týdne (databáze podle ní předvyplní budoucí tréninky). */
  static async toggleAbs(id, day) {
    const set = DB.pabs[id] = DB.pabs[id] || [], on = set.includes(day);
    DB.pabs[id] = on ? set.filter(x => x != day) : [...set, day]; App.render();
    const r = await Sync.write('Stálou absenci se nepodařilo uložit', on
      ? sb.from('player_absence').delete().eq('player_id', id).eq('weekday', day)
      : sb.from('player_absence').insert({player_id: id, weekday: day}));
    if (r) { await Sync.loaders.events(); await Sync.loaders.attendance(); App.render(); }
  }
  static async remove(id) {
    const m = Model.byId(id); if (!m) return;
    if (!confirm(`Smazat hráče ${m.full || m.n} (${m.t}) úplně? Smaže se i jeho docházka, platby a propojení na rodiče. Nelze vrátit.`)) return;
    const r = await Sync.write('Hráče se nepodařilo smazat', sb.from('players').delete().eq('id', id).select());
    if (!r) return;
    if (!r.data || !r.data.length) return Sync.toast('Smazání nebylo povoleno.');
    DB.members = DB.members.filter(x => x.id != id); UI.player = '';
    await Sync.loaders.players(); await Sync.loaders.people(); Sync.toast('✔ Hráč smazán.', true); App.render();
  }
  static toggleAdd(on) { UI.addPlayer = on; UI.playerMsg = ''; App.render(); }
  static bump(id, key) { Model.byId(id)[key]++; App.render(); Sync.savePlayer(id, true); }              // +1 zápas / +1 gól
  static set(id, key, val)    { Model.byId(id)[key] = val; Sync.savePlayer(id); }                       // textové pole (bez překreslení → neztratí se kurzor)
  static setNum(id, key, val) { Model.byId(id)[key] = val === '' ? '' : +val; Sync.savePlayer(id); }    // číselné pole
  static setDoc(id, val)      { DB.docs[Model.byId(id).n] = val; App.render(); Sync.savePlayer(id, true); }   // stav zdravotní prohlídky
  static addParent(id)   { Model.byId(id).par.push({n:'', ph:'', em:''}); App.render(); Sync.savePlayer(id, true); }
  static removePhoto(id) { const m = Model.byId(id), old = m.ph; m.ph = ''; App.render(); Sync.savePlayer(id, true); Photos.remove(old); }

  /** Úprava údaje rodiče; odkazy Zavolat / SMS / E-mail se přepíšou hned. */
  static setParent(id, j, key, val) {
    const q = Model.byId(id).par[j]; q[key] = val;
    const t = Util.phone(q.ph), a = $('#tl' + j), s = $('#sm' + j), e = $('#ml' + j);
    if (a) a.href = 'tel:' + t; if (s) s.href = 'sms:' + t; if (e) e.href = 'mailto:' + q.em;
    Sync.savePlayer(id);
  }

  /** Nahrání fotky: otevře se úprava (posun, zvětšení, otočení, ořez), výsledek je čtverec 256 px (data URL v databázi). */
  static photo(id, input) {
    const f = input.files[0]; input.value = ''; if (!f || !/^image\//.test(f.type)) return;
    const r = new FileReader();
    r.onload = e => Roster.editPhoto(id, e.target.result);
    r.readAsDataURL(f);
  }
  static editPhoto(id, src) {
    src = src || Photos.url(Model.byId(id).ph);
    if (!src) return Sync.toast('Fotka se ještě načítá, zkuste to za chvilku.');
    Cropper.open(src, async url => {
      const m = Model.byId(id), old = m.ph;
      m.ph = await Photos.store('players', id, url); App.render(); Sync.savePlayer(id, true);
      if (old != m.ph) Photos.remove(old);
    });
  }

  /** Přidá nového hráče do týmu přihlášeného trenéra a otevře jeho kartu. */
  static async add() {
    const full = ($('#pl-name').value || '').trim();
    if (!full) { UI.playerMsg = '⚠ Zadejte jméno a příjmení.'; return App.render(); }
    const w = full.split(/\s+/), no = $('#pl-no').value, by = $('#pl-year').value;
    let n = w.length > 1 ? w[0] + ' ' + w.slice(1).join(' ')[0] + '.' : w[0];          // krátké jméno: "Jan T."
    if (Model.member(n)) n += ' (' + (no || DB.members.length) + ')';                  // kdyby už existovalo
    const row = {short_name: n, full_name: full, team: UI.user.team, jersey_no: no === '' ? null : +no, birth_year: by === '' ? null : +by};
    let r = await sb.from('players').insert(row).select().single();
    if (r.error && r.error.code == '23505') {                                          // jméno už existuje (např. v jiném týmu)
      row.short_name += ' (' + (no || Math.floor(Math.random() * 900 + 100)) + ')';
      r = await sb.from('players').insert(row).select().single();
    }
    if (r.error) { UI.playerMsg = '⚠ Hráče se nepodařilo uložit: ' + r.error.message; return App.render(); }
    const p = r.data;
    DB.members.push(Model.fillProfile({id: p.id, n: p.short_name, t: p.team, a: [0, 0], p: DB.payItems.map(() => 0), full: p.full_name, no: p.jersey_no == null ? '' : p.jersey_no, by: p.birth_year == null ? '' : p.birth_year}));
    DB.docs[p.short_name] = 'wait';
    UI.addPlayer = false; UI.playerMsg = ''; UI.player = p.id;
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Notes – trenérský deník: poznámky ke hráčům se štítky (TRENÉR)
   --------------------------------------------------------------------- */
class Notes {
  static view() {
    const q = Util.norm(UI.noteQ || ''), f = UI.noteF || 'all', today = Util.iso(new Date()), L = Model.membersOf(UI.user.team);
    const hit = (m, n) => (f == 'all' || n.g == f) && (!q || Util.norm(n.x).includes(q) || Util.norm(m.n + ' ' + (m.full || '')).includes(q));
    const due = []; L.forEach(m => (DB.notes[m.n] || []).forEach(n => { if (n.rem && n.rem <= today && !n.done) due.push([m, n]); }));
    const shown = L.filter(m => !q && f == 'all' || (DB.notes[m.n] || []).some(n => hit(m, n)) || (q && Util.norm(m.n + ' ' + (m.full || '')).includes(q)));
    return `${due.length ? `<div class="card"><b>⏰ Připomínky na dnes</b>${due.map(([m, n]) => `<div class="pay" style="margin-top:6px"><span><b>${esc(m.n)}</b> – ${esc(n.x)}</span><button class="chip" style="flex:none" onclick="Notes.upd(${n.id},{done:true})">✔ Hotovo</button></div>`).join('')}</div>` : ''}
      <div class="card"><input id="note-q" type="search" placeholder="🔍 Hledat v poznámkách (jméno, text)…" value="${esc(UI.noteQ || '')}" oninput="UI.noteQ=this.value;App.render()">
        <div class="row" style="margin-top:6px"><button class="chip ${f == 'all' ? 'on' : ''}" onclick="Notes.filter('all')">Vše</button>${Object.entries(CONFIG.noteTags).map(([k, l]) => `<button class="chip ${f == k ? 'on' : ''}" onclick="Notes.filter('${k}')">${l}</button>`).join('')}</div>
        <div class="mut" style="margin-top:8px">Štítek nové poznámky:</div>
        <div class="row" style="margin-top:4px">${Object.entries(CONFIG.noteTags).map(([k, l]) => `<button class="chip ${UI.noteTag == k ? 'on' : ''}" onclick="Notes.setTag('${Util.q(k)}')">${l}</button>`).join('')}</div>
        <div class="mut" style="margin-top:6px">👪 = poznámku uvidí rodič v profilu dítěte · ⏰ = ráno přijde připomínka</div></div>
      <div class="g2">${shown.map(m => `<div class="card"><b>${esc(m.n)}</b>
        ${(DB.notes[m.n] || []).filter(n => hit(m, n) || (q && Util.norm(m.n + ' ' + (m.full || '')).includes(q) && (f == 'all' || n.g == f))).map(Notes.item).join('')}
        <div class="row" style="margin-top:6px"><input id="note-${m.id}" placeholder="Nová poznámka (${CONFIG.noteTags[UI.noteTag]})" autocomplete="off">
          <button class="btn" style="flex:0" onclick="Notes.add('${m.id}')">+</button></div></div>`).join('') || '<div class="card mut">Nic nenalezeno.</div>'}</div>`;
  }
  static item(n) {
    return `<div style="margin-top:6px;border-top:1px solid var(--bd);padding-top:6px;${n.done ? 'opacity:.55' : ''}"><div>${CONFIG.noteTags[n.g].slice(0, 2)} <span class="mut">${n.d}</span> ${esc(n.x)}</div>
      ${n.id ? `<div class="row" style="margin-top:4px;gap:4px">
        <button class="chip ${n.sh ? 'on' : ''}" style="flex:none" title="Poznámku uvidí rodič v profilu dítěte" onclick="Notes.upd(${n.id},{shared:${!n.sh}})">👪 ${n.sh ? 'Vidí rodič' : 'Jen trenéři'}</button>
        <label class="chip" style="flex:none" title="Ráno toho dne přijde připomínka">⏰ <input type="date" value="${n.rem || ''}" style="width:auto;min-width:0;padding:0;border:0;background:none;color:inherit;font:inherit" onchange="Notes.upd(${n.id},{remind_on:this.value||null,done:false})"></label>
        ${n.rem ? `<button class="chip ${n.done ? 'on' : ''}" style="flex:none" onclick="Notes.upd(${n.id},{done:${!n.done}})">✔ ${n.done ? 'Splněno' : 'Splnit'}</button>` : ''}
        <button class="chip" style="flex:none" title="Smazat" onclick="Notes.del(${n.id})">🗑</button></div>` : ''}</div>`;
  }
  static setTag(k)  { UI.noteTag = k; App.render(); }
  static filter(k)  { UI.noteF = k; App.render(); }
  static find(id)   { for (const k in DB.notes) { const n = DB.notes[k].find(x => x.id == id); if (n) return [k, n]; } return []; }
  static async add(pid) {
    const m = Model.byId(pid), i = $('#note-' + pid), v = i && i.value.trim(); if (!v || !m) return;
    const n = {g: UI.noteTag, x: v, d: Util.today(), sh: false, rem: '', done: false};
    (DB.notes[m.n] = DB.notes[m.n] || []).push(n);
    UI.skipKeep = ['note-' + pid]; App.render();
    const r = await Sync.write('Poznámku se nepodařilo uložit', sb.from('notes').insert({player_id: m.id, tag: n.g, body: v}).select('id').single());
    if (r) { n.id = r.data.id; App.render(); }
  }
  static async upd(id, f) {
    const [, n] = Notes.find(id); if (!n) return;
    if ('shared' in f) n.sh = f.shared; if ('remind_on' in f) n.rem = f.remind_on || ''; if ('done' in f) n.done = f.done;
    App.render();
    await Sync.write('Poznámku se nepodařilo upravit', sb.from('notes').update(f).eq('id', id));
  }
  static async del(id) {
    const [k, n] = Notes.find(id); if (!n || !confirm('Smazat poznámku?')) return;
    DB.notes[k] = DB.notes[k].filter(x => x !== n); App.render();
    await Sync.write('Poznámku se nepodařilo smazat', sb.from('notes').delete().eq('id', id));
  }
}


/* ---------------------------------------------------------------------
   Chat – týmový chat kategorie + zprávy od klubu (RODIČ i TRENÉR)
   Oprávnění: rodič vidí chaty kategorií svých dětí, trenér jen svou kategorii.
   --------------------------------------------------------------------- */
class Chat {
  /** Záložka "Chat": přepínač kategorií + "Od klubu" a obsah. */
  static view() {
    const u = UI.user, teams = Model.teamsOf(u);
    if (u.r == 'p' && !teams.includes(UI.chatTeam)) UI.chatTeam = Model.team(UI.kid);
    const team = Model.coachLike(u) ? u.team : UI.chatTeam, sub = UI.chatSub == 'club' ? 'club' : UI.chatSub == 'dm' ? 'dm' : UI.chatSub == 'coach' && Model.coachLike(u) ? 'coach' : 'team';
    const inboxUnread = Model.unreadInbox(u), ck = Model.coachLike(u) ? 'T-' + u.team : '';
    // obsah se vykreslí PŘED přepínačem, aby se zprávy označily jako přečtené
    const content = sub == 'team' ? Chat.box(u, team) : sub == 'coach' ? Chat.box(u, ck) : sub == 'dm' ? Dm.view(u) : Chat.inbox(u);
    return `<div class="col"><div class="row" style="margin-bottom:10px">
      ${teams.map(t => `<button class="chip ${sub == 'team' && t == team ? 'on' : ''}" onclick="Chat.show('team','${t}')">💬 ${teams.length > 1 ? t : 'Chat ' + t}${Util.badge(sub == 'team' && t == team ? 0 : Model.unreadChat(u, t))}</button>`).join('')}
      ${Model.coachLike(u) ? `<button class="chip ${sub == 'coach' ? 'on' : ''}" onclick="Chat.show('coach')">🔒 Trenéři ${esc(u.team)}${Util.badge(sub == 'coach' ? 0 : Model.unreadChat(u, ck))}</button>` : ''}
      <button class="chip ${sub == 'dm' ? 'on' : ''}" onclick="Chat.show('dm')">✉ Soukromé${Util.badge(Model.unreadDm(u))}</button>
      <button class="chip ${sub == 'club' ? 'on' : ''}" onclick="Chat.show('club')">📢 Od klubu${Util.badge(sub == 'club' ? 0 : inboxUnread)}</button></div>${content}</div>`;
  }

  /** Okno chatu kategorie (bubliny + pole pro zprávu). */
  static box(u, team) {
    const cl = Model.chat(team); if (cl.length) Sync.setSeen(team, cl[cl.length - 1].id);   // označit jako přečtené
    DB.notifs.forEach(n => { if (n.tab == 'chat' && n.team == team && Notifs.forUser(n, u)) Notifs.markRead(n, u); });
    const ct = team.startsWith('T-');                                  // interní chat trenérů kategorie
    return `<div class="card"><div class="pay"><b>${ct ? '🔒 Chat trenérů ' + team.slice(2) : '💬 Chat ' + team}</b><span class="mut">${ct ? 'jen trenéři kategorie ' + team.slice(2) : 'trenéři a rodiče kategorie ' + team}</span></div>
      <div class="chat" id="chat-box" style="margin-top:10px">${Model.chat(team).map(m => `<div class="bub ${m.fid == u.id ? 'me' : ''}">
        <div class="nm"><b>${esc(m.f)}</b>${m.role == 'Trenér' ? '<span class="pill ok">Trenér</span>' : ''}</div>${esc(m.x)}<div class="tm">${esc(m.t)}</div></div>`).join('') || `<div class="empty" style="padding:14px"><div class="eic">${Icons.svg('chat')}</div><b>Zatím žádné zprávy</b><div class="mut">Napište první zprávu – uvidí ji ${ct ? 'trenéři' : 'trenéři a rodiče'} kategorie.</div></div>`}</div>
      <div class="cin"><input id="chat-input" autocomplete="off" placeholder="Napište zprávu…" onkeydown="if(event.key==='Enter')Chat.send()"><button class="btn ok" onclick="Chat.send()">Odeslat</button></div>${Tpl.chips()}</div>`;
  }

  /** Zprávy od vedení, které uživatel smí vidět (hromadné / jen trenérům / osobní). */
  static inbox(u) {
    const L = Model.inbox(u);
    if (L.length) Sync.setSeen('inbox', Math.max(...L.map(m => m.id)));
    DB.notifs.forEach(n => { if (n.sub == 'club' && Notifs.forUser(n, u)) Notifs.markRead(n, u); });
    return L.slice().reverse().map(m => `<div class="card"><div class="pay"><b>${esc(m.s || 'Zpráva od klubu')}</b>
      <span class="pill ${CONFIG.msgBadges[m.kind][1]}">${CONFIG.msgBadges[m.kind][0]}</span></div>
      <div style="margin:6px 0">${esc(m.x)}</div><div class="mut">${esc(m.f)} · ${esc(m.role)} · ${esc(m.t)}</div></div>`).join('') || Look.empty('mega', 'Žádné zprávy od klubu', 'Až vedení klubu pošle oznámení, najdete ho tady.');
  }

  // ----- akce -----
  static show(sub, team) { UI.chatSub = sub; if (team) UI.chatTeam = team; App.render(); }
  /** Odešle zprávu do chatu (znovu se kontroluje oprávnění) a upozorní ostatní členy chatu. */
  static async send() {
    const u = UI.user, team = Model.coachLike(u) ? (UI.chatSub == 'coach' ? 'T-' + u.team : u.team) : UI.chatTeam, input = $('#chat-input'), text = input && input.value.trim();
    if (!text || !Model.canChat(u, team)) return;
    input.value = '';                                                 // hned vyprázdnit (ochrana proti dvojímu odeslání)
    const r = await Sync.write('Zprávu se nepodařilo odeslat', sb.from('chat_messages').insert({team, body: text}).select().single());
    if (!r) { const i = $('#chat-input'); if (i) i.value = text; return; }
    if (!Model.chat(team).some(m => m.id == r.data.id)) Model.chat(team).push(Sync.chatRow(r.data));    // ostatním přijde přes Realtime
    UI.focusChat = true;
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Dm – soukromé zprávy: trenér ↔ trenér, trenér ↔ rodiče své kategorie, rodič → trenéři kategorie dítěte
   Oprávnění hlídá databáze (dm_can_send, dm_contacts); aplikace jen zobrazuje seznam povolených kontaktů.
   --------------------------------------------------------------------- */
class Dm {
  static roleLabel(c) { return c.cp ? 'Rodič (spolujízda)' : c.role == 'c' ? 'Trenér ' + (c.team || '') : c.role == 'p' ? 'Rodič' : c.role == 'a' ? 'Správce' : 'Vedení'; }

  /** Komu lze psát: seznam z databáze; kdyby se nenačetl, odvodí se z viditelných účtů (odeslání stejně hlídá databáze). */
  static contacts() {
    const L = Dm.baseContacts(), have = new Set(L.map(c => c.id));
    const peers = Object.entries(DB.cpPeers || {}).filter(([id]) => !have.has(id) && id != Sync.me).map(([id, name]) => ({id, name, role: 'p', team: '', cp: 1}));
    return peers.length ? L.concat(peers) : L;
  }
  static baseContacts() {
    if (DB.dmContacts.length) return DB.dmContacts;
    const u = UI.user; if (!u) return [];
    const teamOf = id => (Model.byId(id) || {}).t;
    const kidTeams = new Set(DB.links.filter(l => l.parent_id == u.id).map(l => teamOf(l.player_id)).filter(Boolean));
    const parentsOf = t => new Set(DB.links.filter(l => teamOf(l.player_id) == t).map(l => l.parent_id));
    return Object.values(DB.users).filter(x => x.id != u.id && (u.r == 'v' || u.r == 'a' ? true : u.r == 'c' ? (x.r != 'p' || parentsOf(u.team).has(x.id)) : (x.r == 'c' && kidTeams.has(x.team))))
      .map(x => ({id: x.id, name: x.name, role: x.r, team: x.team})).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }

  static view(u) {
    if (UI.dmWith) return Dm.thread(u);
    const q = Util.norm(UI.dmSearch || ''), threads = Model.dmThreads(u), used = new Set(threads.map(t => t.id));
    const info = id => Dm.contacts().find(c => c.id == id) || (DB.users[id] ? {role: DB.users[id].r, team: DB.users[id].team} : null);
    const rows = threads.filter(t => !q || Util.norm(t.name).includes(q)).map(t => {
      const c = info(t.id);
      return `<div class="card" style="cursor:pointer" onclick="Dm.open('${t.id}')"><div class="pay"><b>${esc(t.name)}</b>${Util.badge(t.unread)}</div>
        <div class="mut">${c ? esc(Dm.roleLabel(c)) + ' · ' : ''}${t.last.fid == u.id ? 'Vy: ' : ''}${esc(t.last.x.length > 60 ? t.last.x.slice(0, 60) + '…' : t.last.x)}</div></div>`;
    });
    const fresh = Dm.contacts().filter(c => !used.has(c.id) && (!q || Util.norm(c.name).includes(q))).map(c =>
      `<div class="card" style="cursor:pointer" onclick="Dm.open('${c.id}')"><div class="pay"><b>${esc(c.name)}</b><span class="pill z">Nová zpráva</span></div><div class="mut">${esc(Dm.roleLabel(c))}</div></div>`);
    return `<div class="col"><div class="card"><b>✉ Soukromé zprávy</b>
        <div class="mut">${u.r == 'p' ? 'Můžete napsat trenérům kategorie vašeho dítěte.' : u.r == 'c' ? 'Můžete psát ostatním trenérům i rodičům své kategorie.' : 'Můžete psát komukoli v klubu.'} Zprávu uvidí jen příjemce.</div>
        ${DB.dmErr ? `<div class="warn" style="margin-top:6px">Seznam kontaktů z databáze se nenačetl (${esc(DB.dmErr)}). Spusťte v Supabase aktualizované SQL a obnovte stránku.</div>` : ''}
        <input id="dm-search" type="search" style="margin-top:8px" placeholder="🔍 Hledat podle jména…" value="${esc(UI.dmSearch || '')}" oninput="Dm.search(this.value)"></div>
      ${rows.join('')}${fresh.length ? `<h2 style="margin:6px 0 0">${rows.length ? 'Další lidé' : 'Komu napsat'}</h2>` + fresh.join('') : ''}
      ${rows.length || fresh.length ? '' : '<div class="card mut">Nikdo nenalezen.</div>'}</div>`;
  }

  static thread(u) {
    const pid = UI.dmWith, t = Model.dmThreads(u).find(x => x.id == pid), c = Dm.contacts().find(x => x.id == pid);
    const name = t ? t.name : c ? c.name : '(neznámý)', msgs = t ? t.msgs : [];
    if (t && t.last.id > (DB.seen['dm:' + pid] || 0)) Sync.setSeen('dm:' + pid, t.last.id);
    DB.notifs.forEach(n => { if (n.sub == 'dm' && n.by == pid && Notifs.forUser(n, u)) Notifs.markRead(n, u); });
    const canWrite = !!c || msgs.some(m => m.fid == pid);                 // psát smí jen povolený kontakt (nebo ten, kdo napsal jako první)
    return `<div class="col"><div class="row"><button class="btn" style="flex:none" onclick="Dm.back()">← Zprávy</button><div class="card" style="flex:1;margin:0"><b>${esc(name)}</b>${c ? `<div class="mut">${esc(Dm.roleLabel(c))}</div>` : ''}</div></div>
      <div class="card"><div class="chat" id="chat-box">${msgs.map(m => `<div class="bub ${m.fid == u.id ? 'me' : ''}"><div class="nm"><b>${esc(m.fid == u.id ? 'Vy' : m.fn)}</b></div>${esc(m.x)}<div class="tm">${esc(m.t)}</div></div>`).join('') || '<div class="mut">Zatím žádné zprávy. Napište první.</div>'}</div>
        ${canWrite ? `<div class="cin"><input id="chat-input" autocomplete="off" placeholder="Napište zprávu…" onkeydown="if(event.key==='Enter')Dm.send()"><button class="btn ok" onclick="Dm.send()">Odeslat</button></div>${Tpl.chips()}` : '<div class="mut" style="margin-top:8px">Tomuto uživateli už nelze psát.</div>'}</div></div>`;
  }

  static open(id)  { UI.dmWith = id; UI.focusChat = true; App.render(); }
  static back()    { UI.dmWith = ''; UI.dmSearch = ''; UI.ai = null; App.render(); }
  static search(v) { UI.dmSearch = v; App.render(); const i = $('#dm-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }

  static async send() {
    const u = UI.user, to = UI.dmWith, input = $('#chat-input'), text = input && input.value.trim();
    if (!text || !to) return;
    input.value = '';
    const r = await Sync.write('Zprávu se nepodařilo odeslat', sb.from('direct_messages').insert({to_id: to, body: text}).select().single());
    if (!r) { const i = $('#chat-input'); if (i) i.value = text; return; }
    if (!DB.dm.some(m => m.id == r.data.id)) DB.dm.push({id: r.data.id, fid: u.id, tid: to, fn: r.data.from_name, tn: r.data.to_name, x: r.data.body, t: Util.stamp(r.data.created_at)});
    UI.focusChat = true; App.render();
  }
}


/* ---------------------------------------------------------------------
   Messages – zprávy vedení: všem / jen trenérům / konkrétní osobě (VEDENÍ)
   Odeslaná zpráva se příjemcům zobrazí v "Od klubu" a v notifikacích.
   --------------------------------------------------------------------- */
class Messages {
  static view() {
    const u = UI.user, kind = UI.msgKind, users = Object.values(DB.users).filter(x => x.id != u.id);
    const sent = DB.messages.filter(m => m.fid == u.id).reverse(), flash = UI.flash;
    UI.flash = '';                                                    // potvrzení se ukáže jen jednou
    return `<div class="col"><div class="card"><b>✉ Nová zpráva</b>
      <div class="row" style="margin:10px 0">${Object.entries(CONFIG.msgTargets).map(([k, l]) => `<button class="chip ${kind == k ? 'on' : ''}" onclick="Messages.setKind('${Util.q(k)}')">${l}</button>`).join('')}</div>
      ${kind == 'user'
        ? `<select onchange="Messages.setUser(this.value)">${users.map(x => `<option value="${x.id}" ${x.id == UI.msgUser ? 'selected' : ''}>${esc(x.name)} · ${x.role}${x.team ? ' ' + x.team : ''}</option>`).join('')}</select>`
        : `<div class="mut">${kind == 'all' ? 'Dostanou všichni členové klubu – rodiče i trenéři.' : 'Dostanou pouze trenéři všech kategorií.'}</div>`}
      <input value="${esc(UI.draftSubject)}" oninput="UI.draftSubject=this.value" placeholder="Předmět" autocomplete="off">
      <textarea rows="3" oninput="UI.draftText=this.value" placeholder="Text zprávy">${esc(UI.draftText)}</textarea>
      <button class="btn ok" style="width:100%" onclick="Messages.send()">Odeslat</button>
      ${flash ? `<div class="mut ${flash[0] == '✔' ? 'cg' : 'cr'}" style="margin-top:6px">${esc(flash)}</div>` : ''}</div>
      <h2>Odeslané zprávy</h2>
      ${sent.map(m => `<div class="card"><div class="pay"><b>${esc(m.s)}</b><span class="pill ${CONFIG.msgBadges[m.kind][1]}">${m.kind == 'user' ? '👤 ' + esc((DB.users[m.to] || {}).name || '(smazaný uživatel)') : CONFIG.msgBadges[m.kind][0]}</span></div>
        <div style="margin:6px 0">${esc(m.x)}</div><div class="mut">${esc(m.t)}</div></div>`).join('') || '<div class="card mut">Zatím žádné odeslané zprávy.</div>'}</div>`;
  }

  static setKind(k) { UI.msgKind = k; App.render(); }
  static setUser(id) { UI.msgUser = id; }

  /** Uloží zprávu do databáze a pošle notifikaci příslušným příjemcům. */
  static async send() {
    const u = UI.user; if (!Model.mgmt(u)) return;                       // oprávnění: jen vedení (hlídá i databáze)
    const kind = UI.msgKind, text = (UI.draftText || '').trim();
    if (!text) { UI.flash = '⚠ Napište text zprávy.'; return App.render(); }
    const others = Object.values(DB.users).filter(y => y.id != u.id);
    const to = kind == 'user' ? (UI.msgUser && DB.users[UI.msgUser] && UI.msgUser != u.id ? UI.msgUser : (others[0] || {}).id) : null;
    if (kind == 'user' && !to) { UI.flash = '⚠ Není komu zprávu poslat.'; return App.render(); }
    const subject = (UI.draftSubject || '').trim() || 'Zpráva od vedení';
    const r = await Sync.write('Zprávu se nepodařilo odeslat', sb.from('club_messages').insert({kind, recipient_id: to, subject, body: text}).select().single());
    if (!r) return;
    DB.messages.push({id: r.data.id, fid: u.id, f: u.name, role: u.role, kind, to, s: subject, x: text, t: Util.stamp(r.data.created_at)});
    const icon = {all:'📢', trainers:'🧢', user:'✉'}[kind];
    Notifs.send(kind == 'all' ? 'a' : kind == 'trainers' ? 'T' : 'U', `${icon} ${subject}: ${text.length > 70 ? text.slice(0, 70) + '…' : text}`, {to, tab:'chat', sub:'club'});
    UI.flash = '✔ Odesláno: ' + (kind == 'user' ? DB.users[to].name : CONFIG.msgTargets[kind]);
    UI.draftSubject = UI.draftText = '';
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Planner – plánovač hřišť po dnech s hlídáním kolizí (VEDENÍ)
   --------------------------------------------------------------------- */
class Planner {
  static view() {
    const P = CONFIG.planner, span = P.to - P.from, L = DB.plan.filter(b => b.d == UI.day), hours = [], ro = !Model.mgmt(UI.user), mine = UI.user.team;
    for (let h = P.from / 60; h <= P.to / 60; h++) hours.push(h);
    return `<div class="row" style="margin-bottom:10px">${CONFIG.days.map((n, i) => `<button class="chip ${UI.day == i ? 'on' : ''}" onclick="Planner.setDay(${i})">${n}</button>`).join('')}</div>
      <h2 style="margin-top:0">${Util.date(UI.day)} · ${hours[0]}:00–${hours[hours.length - 1]}:00</h2>
      ${P.fields.map(f => `<div style="margin-top:8px"><b>${Util.venue(f)}</b></div>
        <div class="tl">${L.filter(b => b.f == f).map(b => `<div class="${ro && b.tm == mine ? 'mine' : ''}" ${ro ? '' : 'title="Klepnutím uvolníte" onclick="Planner.remove(' + b.id + ')"'} style="left:${(b.s - P.from) * 100 / span}%;width:${(b.e - b.s) * 100 / span}%">${b.tm} ${Util.toTime(b.s)}–${Util.toTime(b.e)}</div>`).join('')}</div>
        <div class="tk">${hours.map(h => `<span>${h}:00</span>`).join('')}</div>`).join('')}
      ${ro ? `<div class="mut">Rozvrh hřišť nastavuje vedení klubu. ${mine ? 'Tréninky vaší kategorie ' + esc(mine) + ' jsou zvýrazněné červeně.' : ''} Z rezervací se automaticky vytvářejí tréninky v kalendáři.</div>` : `<div class="mut">Klepnutím na blok rezervaci zrušíte. Z rezervace vznikne trénink v kalendáři trenérů a rodičů.</div>
      <h2>Rezervovat</h2><div class="card">
        <div class="row"><select id="pn-team">${P.teams.map(t => `<option>${t}</option>`).join('')}</select><select id="pn-field">${P.fields.map(f => `<option value="${f}">${Util.venue(f)}</option>`).join('')}</select></div>
        <div class="row"><label class="mut">Od<input id="pn-from" type="time" value="16:00" step="900"></label><label class="mut">Do<input id="pn-to" type="time" value="17:30" step="900"></label></div>
        <button class="btn ok" style="width:100%;margin-top:6px" onclick="Planner.book()">Rezervovat na ${Util.date(UI.day)}</button>
        ${UI.plannerMsg ? `<div class="warn">⚠ ${UI.plannerMsg}</div>` : ''}</div>`}`;
  }

  static setDay(d)  { UI.day = d; UI.plannerMsg = ''; App.render(); }
  static async remove(id) {
    const b = DB.plan.find(x => x.id == id);
    DB.plan = DB.plan.filter(x => x.id != id); App.render();
    // databáze při smazání rezervace smaže i z ní vzniklé budoucí tréninky
    if (await Sync.write('Rezervaci se nepodařilo zrušit', sb.from('plan').delete().eq('id', id)) && b) {
      const txt = `❌ Trénink ${b.tm} ${Util.date(b.d)} ${Util.toTime(b.s)} byl zrušen (rozvrh hřiště)`;
      Notifs.send('C', txt, {team: b.tm, tab: 'att'});                 // jen trenérům kategorie; rodiče trenér upozorní sám
      // záloha pro případ, že databáze ještě nemá trigger: smazat i trénink ve stejný den a čas
      await sb.from('events').delete().eq('kind', 't').eq('team', b.tm).eq('event_date', Util.iso(Util.dayDate(b.d))).eq('time', Util.toTime(b.s).replace(/^(\d):/, '0$1:'));
      await Sync.loaders.events(); App.render();
    }
  }

  /** Záloha: trénink z rezervace vytvoří aplikace sama (kdyby v databázi chyběla funkce sync_plan_events). */
  static async createTrainingDirect(team, d, s, field) {
    const time = Util.toTime(s).replace(/^(\d):/, '0$1:'), date = Util.iso(Util.dayDate(d));
    const place = Util.venue(field);
    const coach = (Object.values(DB.users).find(x => x.r == 'c' && x.team == team) || {}).name || '';
    if (DB.events.some(e => e.tm == team && e.k == 't' && e.d == d && e.t == time)) return;
    await Sync.write('Trénink se nepodařilo vytvořit', sb.from('events').insert({kind: 't', team, event_date: date, time, place, meet: '15 min předem', coach, opponent: ''}));
  }

  /** Rezervace s validací (a uložením do databáze): čas, kolize hřiště, tým nemůže trénovat na dvou místech zároveň. */
  static async book() {
    const P = CONFIG.planner, team = $('#pn-team').value, field = $('#pn-field').value;
    const s = Util.toMin($('#pn-from').value || '0:0'), e = Util.toMin($('#pn-to').value || '0:0'), d = UI.day;
    UI.plannerMsg = '';
    if (e <= s) UI.plannerMsg = 'Konec musí být později než začátek.';
    else if (s < P.from || e > P.to) UI.plannerMsg = `Plánovač pokrývá časy ${Util.toTime(P.from)}–${Util.toTime(P.to)}.`;
    else {
      const overlap = DB.plan.filter(b => b.d == d && b.s < e && s < b.e);          // rezervace, které se s novou překrývají
      const sameField = overlap.find(b => b.f == field), sameTeam = overlap.find(b => b.tm == team);
      if (sameField) UI.plannerMsg = `${Util.venue(field)} je v čase ${Util.toTime(sameField.s)}–${Util.toTime(sameField.e)} obsazeno týmem ${sameField.tm}!`;
      else if (sameTeam) UI.plannerMsg = `Tým ${team} v čase ${Util.toTime(sameTeam.s)}–${Util.toTime(sameTeam.e)} už trénuje: ${Util.venue(sameTeam.f)}.`;
      else {
        const r = await Sync.write('Rezervaci se nepodařilo uložit', sb.from('plan').insert({day: d, field, team, start_min: s, end_min: e}).select().single());
        if (r) {
          DB.plan.push({id: r.data.id, d, f: field, tm: team, s, e});
          // z rezervace vznikne trénink (databázová funkce) → uvidí ho trenéři i rodiče kategorie; ti dostanou notifikaci
          const sy = await sb.rpc('sync_plan_events', {week_start: Util.iso(Util.dayDate(0))});
          if (sy.error) await Planner.createTrainingDirect(team, d, s, field);   // databáze ještě nemá funkci → vytvořit přímo
          await Sync.loaders.events();
          const txt = `📅 Nový trénink ${team}: ${Util.date(d)} ${Util.toTime(s)}–${Util.toTime(e)} · ${Util.venue(field)}`;
          Notifs.send('C', txt, {team, tab: 'att'});                       // jen trenérům kategorie; rodiče trenér upozorní sám
        }
      }
    }
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Users – správa uživatelských účtů a přiřazení dětí (VEDENÍ / SPRÁVCE)
   Účty zakládá a maže Edge Function admin-users (klíč service_role nikdy není v prohlížeči);
   přiřazení dětí rodičům se ukládá přímo do tabulky parent_players (smí jen vedení).
   --------------------------------------------------------------------- */
class Users {
  static roleOptions(sel) { return Object.entries(CONFIG.roles).filter(([k]) => UI.user.r == 'a' || k == 'p' || k == 'c' || k == sel).map(([k, l]) => `<option value="${k}" ${k == sel ? 'selected' : ''}>${l}</option>`).join(''); }
  static teamOptions(sel) { return CONFIG.planner.teams.map(x => `<option ${x == sel ? 'selected' : ''}>${x}</option>`).join(''); }

  static view() {
    const list = Object.values(DB.users).filter(x => UI.userRole == 'all' || x.r == UI.userRole);
    return `<div class="col">
      <div class="card"><b>➕ Nový uživatelský účet</b>
        <label class="mut">Jméno<input id="au-name" autocomplete="off" placeholder="např. Petr Kovář"></label>
        <label class="mut">E-mail (slouží k přihlášení)<input id="au-email" type="email" autocomplete="off" placeholder="rodic@email.cz"></label>
        <label class="mut">Počáteční heslo (min. 8 znaků)<input id="au-pass" type="text" autocomplete="off"></label>
        <div class="row"><label class="mut">Role<select id="au-role" onchange="Users.setRole(this.value)">${Users.roleOptions(UI.auRole)}</select></label>
          ${UI.auRole == 'c' ? `<label class="mut">Kategorie trenéra<select id="au-team">${Users.teamOptions('U9')}</select></label>` : ''}</div>
        <button class="btn ok" style="width:100%;margin-top:8px" onclick="Users.create()">Vytvořit účet</button>
        ${UI.userMsg ? `<div class="mut ${UI.userMsgOk ? 'cg' : 'cr'}" style="margin-top:6px">${esc(UI.userMsg)}</div>` : ''}</div>
      <h2>Registrovaní uživatelé (${list.length})</h2>
      <div class="row" style="margin-bottom:8px">${[['all', 'Všichni'], ['p', 'Rodiče'], ['c', 'Trenéři'], ['v', 'Vedení'], ['a', 'Správci']].map(([k, l]) => `<button class="chip ${UI.userRole == k ? 'on' : ''}" onclick="Users.filter('${k}')">${l}</button>`).join('')}</div>
      ${list.map(x => Users.card(x)).join('') || '<div class="card mut">Žádní uživatelé.</div>'}</div>`;
  }

  /** Karta uživatele: údaje, přiřazené děti (rodič), tlačítka Upravit / Smazat, případně editor. */
  static card(x) {
    const me = x.id == UI.user.id, canEdit = UI.user.r == 'a' || !(x.r == 'v' || x.r == 'a');   // účty vedení a správců upravuje jen správce
    return `<div class="card"><div class="pay" style="flex-wrap:wrap;gap:8px"><div style="min-width:0;flex:1 1 230px"><div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">${Util.userAvatar(x, 64)}<span style="min-width:0"><b>${esc(x.name)}</b> <span class="pill ${x.r == 'a' ? 'no' : x.r == 'v' ? 'z' : x.r == 'c' ? 'ok' : 'wa'}">${x.role}${x.team ? ' ' + esc(x.team) : ''}</span></span></div>
        <div class="mut" style="overflow-wrap:anywhere">${esc(x.email)}${x.phone ? ' · ☎ ' + esc(x.phone) : ''}${x.mc ? ' · <span class="cr">čeká na změnu hesla</span>' : ''}${x.consent ? '' : ' · <span class="mut">bez souhlasu</span>'}</div></div>
        ${canEdit ? `<div class="row" style="flex:none"><button class="chip" style="flex:none" onclick="Users.edit('${x.id}')">✏ Upravit</button>
          ${me ? '' : `<button class="chip" style="flex:none;color:var(--r)" onclick="Users.remove('${x.id}')">🗑 Smazat</button>`}</div>` : ''}</div>
      ${x.r == 'p' ? Users.kids(x) : ''}${UI.editUser == x.id ? Users.editor(x) : ''}</div>`;
  }

  /** Přiřazené děti rodiče + výběr dalšího dítěte. */
  static kids(x) {
    const free = DB.members.filter(m => !x.kids.includes(m.n));
    return `<div style="margin-top:10px"><div class="mut" style="margin-bottom:6px">Přiřazené děti:</div>
      ${x.kids.map(k => `<span class="kid">${esc(k)} · ${esc(Model.team(k))}<button title="Odebrat" onclick="Users.unassign('${x.id}','${Model.member(k).id}')">×</button></span>`).join('') || '<span class="mut">žádné</span>'}
      ${free.length ? `<div class="row" style="margin-top:6px"><select id="as-${x.id}"><option value="">+ Přiřadit dítě…</option>${free.map(m => `<option value="${m.id}">${esc(m.full)} · ${esc(m.t)}</option>`).join('')}</select>
        <button class="btn" style="flex:none" onclick="Users.assign('${x.id}')">Přiřadit</button></div>` : ''}</div>`;
  }

  static editor(x) {
    return `<div style="margin-top:12px;border-top:1px solid var(--bd);padding-top:8px">
      ${UI.user.r == 'a' ? `<div class="row" style="align-items:center;margin-bottom:6px">${Util.userAvatar(x, 56)}
        <label class="btn" style="flex:none;cursor:pointer">📷 ${x.ph ? 'Změnit fotku' : 'Nahrát fotku'}<input type="file" accept="image/*" hidden onchange="Users.photo('${x.id}',this)"></label>
        ${x.ph ? `<button class="btn" style="flex:none" onclick="Users.editPhoto('${x.id}')">✂ Upravit</button><button class="btn" style="flex:none" onclick="Users.setPhoto('${x.id}','')">Odebrat</button>` : ''}</div>` : ''}
      <label class="mut">Jméno<input id="eu-name" value="${esc(x.name)}"></label>
      <label class="mut">E-mail<input id="eu-email" type="email" value="${esc(x.email)}"></label>
      <label class="mut">Nové heslo (prázdné = beze změny)<input id="eu-pass" type="text" autocomplete="off"></label>
      <div class="row"><label class="mut">Role<select id="eu-role" onchange="Users.setEditRole(this.value)">${Users.roleOptions(UI.editRole)}</select></label>
        ${UI.editRole == 'c' ? `<label class="mut">Kategorie<select id="eu-team">${Users.teamOptions(x.team)}</select></label>` : ''}</div>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="Users.edit('')">Zrušit</button><button class="btn ok" onclick="Users.save('${x.id}')">Uložit změny</button></div></div>`;
  }

  // ----- akce -----
  static filter(k)       { UI.userRole = k; App.render(); }
  static setRole(r)      { UI.auRole = r; App.render(); }
  static setEditRole(r)  { UI.editRole = r; App.render(); }
  static msg(text, ok)   { UI.userMsg = text; UI.userMsgOk = !!ok; App.render(); }
  static edit(id) {
    UI.editUser = id; UI.editRole = id ? DB.users[id].r : ''; UI.userMsg = '';
    UI.skipKeep = ['eu-name', 'eu-email', 'eu-pass', 'eu-role', 'eu-team'];       // pole editoru se nesmí přenést z jiného uživatele
    App.render();
  }

  static async create() {
    const name = $('#au-name').value.trim(), email = $('#au-email').value.trim(), password = $('#au-pass').value, role = UI.auRole, team = role == 'c' ? $('#au-team').value : '';
    if (!name || !email || !password) return Users.msg('⚠ Vyplňte jméno, e-mail a heslo.');
    Users.msg('Vytvářím účet…', true);
    try {
      await Sync.admin({action: 'create', name, email, password, role, team});
      await Sync.loaders.people();
      UI.skipKeep = ['au-name', 'au-email', 'au-pass'];
      Users.msg(`✔ Účet vytvořen: ${name} (${CONFIG.roles[role]}). Předejte mu e-mail a heslo.`, true);
    } catch (e) { Users.msg('⚠ ' + e.message); }
  }

  /** Správce mění fotku uživateli: úprava v okně Cropper, uložení do úložiště a cesta do profilu. */
  static photo(id, input) {
    const f = input.files[0]; input.value = ''; if (!f || !/^image\//.test(f.type)) return;
    const r = new FileReader(); r.onload = e => Users.editPhoto(id, e.target.result); r.readAsDataURL(f);
  }
  static editPhoto(id, src) {
    src = src || Photos.url(DB.users[id].ph);
    if (!src) return Sync.toast('Fotka se ještě načítá, zkuste to za chvilku.');
    Cropper.open(src, url => Users.setPhoto(id, url, true));
  }
  static async setPhoto(id, url, isNew) {
    const x = DB.users[id]; if (!x) return;
    const old = x.ph; let ref = url;
    if (isNew) {
      try { ref = await Photos.upload('users', id, url); }
      catch (e) { return Sync.toast('Fotku se nepodařilo nahrát (spustili jste aktuální schema.sql?): ' + (e.message || e)); }
    }
    const r = await Sync.write('Fotku se nepodařilo uložit', sb.rpc('admin_set_user_photo', {p_user: id, p_photo: ref}));
    if (!r) { if (isNew) Photos.remove(ref); return; }
    x.ph = ref; if (UI.user.id == id) UI.user.ph = ref;
    if (old != ref) Photos.remove(old);
    App.render();
  }

  static async save(id) {
    const x = DB.users[id], role = $('#eu-role').value, body = {action: 'update', id, name: $('#eu-name').value.trim(), role, team: role == 'c' ? $('#eu-team').value : ''};
    const email = $('#eu-email').value.trim(), pass = $('#eu-pass').value;
    if (!body.name) return Users.msg('⚠ Jméno nesmí být prázdné.');
    if (email && email != x.email) body.email = email;
    if (pass) body.password = pass;
    try {
      await Sync.admin(body);
      await Sync.loaders.people();
      UI.editUser = ''; Users.msg('✔ Změny uloženy.', true);
    } catch (e) { Users.msg('⚠ ' + e.message); }
  }

  static async remove(id) {
    const x = DB.users[id];
    if (!x || !confirm(`Opravdu smazat účet ${x.name}? Přihlášení přestane fungovat. Hráči zůstanou zachováni.`)) return;
    try {
      await Sync.admin({action: 'delete', id});
      await Sync.loaders.people();
      Users.msg(`✔ Účet ${x.name} byl smazán.`, true);
    } catch (e) { Users.msg('⚠ ' + e.message); }
  }

  /** Přiřadí dítě rodiči (vazba rodič ↔ hráč). Rodič pak vidí jen své přiřazené děti. */
  static async assign(uid) {
    const pid = $('#as-' + uid).value; if (!pid) return;
    if (await Sync.write('Dítě se nepodařilo přiřadit', sb.from('parent_players').insert({parent_id: uid, player_id: pid}))) { await Sync.loaders.people(); App.render(); }
  }
  static async unassign(uid, pid) {
    if (await Sync.write('Přiřazení se nepodařilo zrušit', sb.from('parent_players').delete().eq('parent_id', uid).eq('player_id', pid))) { await Sync.loaders.people(); App.render(); }
  }
}


/* ---------------------------------------------------------------------
   Profile – vlastní profil přihlášeného uživatele (jméno, telefon, heslo)
   Po prvním přihlášení (heslo nastavil správce/trenér) se okno otevře samo a nejde zavřít,
   dokud si uživatel nezvolí vlastní heslo. Heslo mění přímo Supabase Auth; jméno a telefon
   funkce update_my_profile (role, kategorie ani e-mail takto změnit nejde).
   --------------------------------------------------------------------- */
class Profile {
  /** Vynucené okno: počáteční heslo od správce, nebo návrat z e-mailu „zapomenuté heslo“. */
  static forced(u) { return !!(u.mc || UI.recovery); }
  static open()  { UI.profile = true; UI.profMsg = ''; App.render(); }
  static close() { if (UI.user && Profile.forced(UI.user)) return; UI.profile = false; App.render(); }

  /** Souhlas se zpracováním osobních údajů (a volitelně s focením) – zobrazí se jednou po prvním přihlášení. */
  static consentModal() {
    const u = UI.user;
    return `<div class="mo"><form class="card" onsubmit="Profile.saveConsent();return false">
      <b>📄 Souhlas se zpracováním údajů</b>
      <div class="mut" style="margin:6px 0">${CLUB} v této aplikaci zpracovává jméno, kontakt a údaje o dětech (docházka, platby, zdravotní poznámky) výhradně pro chod klubu. Údaje jsou přístupné jen oprávněným osobám klubu a neposkytují se dalším stranám. Souhlas můžete kdykoli odvolat u vedení klubu.</div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0"><input id="cs-main" type="checkbox" style="width:auto;margin-top:3px"> <span>Souhlasím se zpracováním osobních údajů v rozsahu výše. <b>(povinné)</b></span></label>
      ${u.r == 'p' ? `<label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0"><input id="cs-photo" type="checkbox" style="width:auto;margin-top:3px"> <span>Souhlasím s pořizováním a používáním fotografií svého dítěte v klubové aplikaci. (nepovinné)</span></label>` : ''}
      ${UI.profMsg ? `<div class="warn">${esc(UI.profMsg)}</div>` : ''}
      <button class="btn ok" type="submit" style="width:100%;margin-top:6px">Potvrdit a pokračovat</button>
      <button class="btn" type="button" style="width:100%;margin-top:8px" onclick="Auth.logout()">Odhlásit se</button></form></div>`;
  }
  static async saveConsent() {
    if (!$('#cs-main').checked) return Profile.msg('Bez souhlasu nelze aplikaci používat.');
    const photo = !!($('#cs-photo') && $('#cs-photo').checked);
    const { error } = await sb.rpc('save_consent', {p_photo: photo});
    if (error) return Profile.msg('⚠ ' + error.message);
    UI.profMsg = ''; await Sync.loaders.people(); App.render();
  }
  static msg(t, ok) { UI.profMsg = t; UI.profOk = !!ok; App.render(); }

  static modal() {
    const u = UI.user, forced = Profile.forced(u);
    return `<div class="mo" ${forced ? '' : 'onclick="if(event.target==this)Profile.close()"'}><form class="card" onsubmit="Profile.save();return false">
      <b>${forced ? '🔐 Nastavte si vlastní heslo' : '👤 Můj profil'}</b>
      ${forced ? `<div class="mut" style="margin-top:4px">${UI.recovery && !u.mc ? 'Zvolte si nové heslo (min. 8 znaků).' : 'Přihlásili jste se s počátečním heslem. Z bezpečnostních důvodů si nyní zvolte vlastní heslo (min. 8 znaků). Můžete také doplnit telefon.'}</div>` : ''}
      ${u.r == 'p' ? '' : `<div style="text-align:center;margin:8px 0">${Util.userAvatar(u, 84)}
        <div class="row" style="justify-content:center;margin-top:8px">
          <label class="btn" style="flex:none;cursor:pointer">📷 ${u.ph ? 'Změnit fotku' : 'Nahrát fotku'}<input type="file" accept="image/*" hidden onchange="Profile.photo(this)"></label>
          ${u.ph ? `<button class="btn" type="button" style="flex:none" onclick="Profile.editPhoto()">✂ Upravit</button><button class="btn" type="button" style="flex:none" onclick="Profile.savePhoto('')">Odebrat</button>` : ''}</div></div>`}
      <label class="mut">Jméno<input id="pf-name" value="${esc(u.name)}" autocomplete="name"></label>
      <label class="mut">Telefon<input id="pf-phone" type="tel" value="${esc(u.phone || '')}" placeholder="+420 777 123 456" autocomplete="tel"></label>
      <div class="mut" style="margin-top:8px">E-mail (přihlašovací): ${esc(u.email)}</div>
      <label class="mut">${forced ? 'Nové heslo' : 'Nové heslo (prázdné = beze změny)'}<input id="pf-pass" type="password" autocomplete="new-password"></label>
      <label class="mut">Nové heslo znovu<input id="pf-pass2" type="password" autocomplete="new-password"></label>
      ${forced ? '' : Push.profileBlock()}
      ${UI.profMsg ? `<div class="${UI.profOk ? 'cg' : 'warn'}" style="margin-top:6px">${esc(UI.profMsg)}</div>` : ''}
      <div class="row" style="margin-top:10px">${forced ? '' : '<button class="btn" type="button" onclick="Profile.close()">Zavřít</button>'}<button class="btn ok" type="submit">Uložit</button></div>
      ${forced ? '<button class="btn" type="button" style="width:100%;margin-top:8px" onclick="Auth.logout()">Odhlásit se</button>' : ''}
    </form></div>`;
  }

  /** Vlastní fotka (trenér / vedení): úprava v okně Cropper a hned uložení. */
  static photo(input) {
    const f = input.files[0]; input.value = ''; if (!f || !/^image\//.test(f.type)) return;
    const r = new FileReader(); r.onload = e => Profile.editPhoto(e.target.result); r.readAsDataURL(f);
  }
  static editPhoto(src) {
    src = src || Photos.url(UI.user.ph);
    if (!src) return Sync.toast('Fotka se ještě načítá, zkuste to za chvilku.');
    Cropper.open(src, async url => Profile.savePhoto(url ? await Photos.store('users', UI.user.id, url) : ''));
  }
  static async savePhoto(url) {
    const old = UI.user.ph;
    const r = await Sync.write('Fotku se nepodařilo uložit', sb.rpc('set_my_photo', {p_photo: url}));
    if (!r) { if (url != old) Photos.remove(url); return; }
    if (old != url) Photos.remove(old);
    UI.user.ph = url; if (DB.users[UI.user.id]) DB.users[UI.user.id].ph = url;
    App.render();
  }

  static async save() {
    const u = UI.user, name = $('#pf-name').value.trim(), phone = $('#pf-phone').value.trim(), p1 = $('#pf-pass').value, p2 = $('#pf-pass2').value;
    if (!name) return Profile.msg('Vyplňte jméno.');
    if (Profile.forced(u) && !p1) return Profile.msg('Zvolte si nové heslo.');
    if (p1 && p1.length < 8) return Profile.msg('Heslo musí mít aspoň 8 znaků.');
    if (p1 != p2) return Profile.msg('Hesla se neshodují.');
    try {
      let r = await sb.rpc('update_my_profile', {p_name: name, p_phone: phone});
      if (r.error) throw r.error;
      if (p1) {
        const { error } = await sb.auth.updateUser({password: p1});
        if (error) throw new Error(/different|same/i.test(error.message) ? 'Nové heslo musí být jiné než dosavadní.' : /weak|short|least|character/i.test(error.message) ? 'Heslo je příliš slabé – zvolte delší a méně obvyklé.' : error.message);
        r = await sb.rpc('password_changed');
        if (r.error) throw r.error;
      }
      UI.recovery = false;
      await Sync.loaders.people();
      UI.profile = false; UI.profMsg = '';
      Sync.toast(p1 ? '✔ Heslo a profil uloženy.' : '✔ Profil uložen.', true);
      App.render();
    } catch (e) { Profile.msg('⚠ ' + (e.message || e)); }
  }
}


/* ---------------------------------------------------------------------
   Parents – TRENÉR zakládá účty rodičů a přiřazuje jim děti ze své kategorie
   Účet vzniká přes Edge Function admin-users (ta pro trenéra povolí jen roli Rodič a jen děti jeho týmu).
   Vazby rodič ↔ dítě trenér mění přímo (RLS povolí jen hráče jeho kategorie).
   --------------------------------------------------------------------- */
class Parents {
  static kids() { return DB.members.filter(m => m.t == UI.user.team); }
  static msg(t, ok) { UI.parMsg = t; UI.parOk = !!ok; App.render(); }
  static toggle(id, on) { (UI.pkSel = UI.pkSel || {})[id] = on; }
  static search(v) { UI.parSearch = v; App.render(); const i = $('#pa-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }

  static view() {
    const kids = Parents.kids(), sel = UI.pkSel || {};
    const q = Util.norm(UI.parSearch || ''), all = Object.values(DB.users).filter(x => x.r == 'p');
    const kidsOf = x => DB.links.filter(l => l.parent_id == x.id).map(l => (Model.byId(l.player_id) || {}).full || '').join(' ');
    const list = all.filter(x => !q || Util.norm(x.name + ' ' + x.email + ' ' + kidsOf(x) + ' ' + DB.links.filter(l => l.parent_id == x.id).map(l => (Model.byId(l.player_id) || {}).n || '').join(' ')).includes(q));
    return `<div class="col">
      <div class="card"><b>➕ Nový účet rodiče (${esc(UI.user.team)})</b>
        <div class="mut" style="margin-top:4px">Rodič se přihlásí e-mailem a počátečním heslem a po přihlášení si heslo sám změní.</div>
        <label class="mut">Jméno rodiče<input id="pa-name" autocomplete="off" placeholder="např. Petr Kovář"></label>
        <label class="mut">E-mail (slouží k přihlášení)<input id="pa-email" type="email" autocomplete="off" placeholder="rodic@email.cz"></label>
        <label class="mut">Počáteční heslo (min. 8 znaků)<input id="pa-pass" type="text" autocomplete="off"></label>
        <div class="mut" style="margin-top:8px">Děti rodiče (můžete vybrat více):</div>
        <div style="max-height:200px;overflow:auto;margin-top:4px">${kids.map(m => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="checkbox" style="width:auto;margin:0" ${sel[m.id] ? 'checked' : ''} onchange="Parents.toggle('${m.id}',this.checked)"> ${esc(m.full || m.n)}</label>`).join('') || '<div class="mut">V soupisce zatím nejsou žádní hráči.</div>'}</div>
        <button class="btn ok" style="width:100%;margin-top:8px" onclick="Parents.create()">Vytvořit účet rodiče</button>
        ${UI.parMsg ? `<div class="mut ${UI.parOk ? 'cg' : 'cr'}" style="margin-top:6px">${esc(UI.parMsg)}</div>` : ''}</div>
      <h2>Rodiče vaší kategorie (${q ? list.length + ' z ' + all.length : all.length})</h2>
      <input id="pa-search" type="search" placeholder="🔍 Hledat podle jména rodiče, dítěte nebo e-mailu…" value="${esc(UI.parSearch || '')}" oninput="Parents.search(this.value)">
      ${list.map(x => Parents.card(x, kids)).join('') || `<div class="card mut">${q ? 'Nikdo nenalezen.' : 'Zatím žádní rodiče s účtem.'}</div>`}</div>`;
  }

  static card(x, kids) {
    const links = DB.links.filter(l => l.parent_id == x.id), free = kids.filter(m => !links.some(l => l.player_id == m.id));
    return `<div class="card"><b>${esc(x.name)}</b>
      <div class="mut" style="overflow-wrap:anywhere">${esc(x.email)}${x.phone ? ' · ☎ ' + esc(x.phone) : ''}${x.mc ? ' · <span class="cr">čeká na změnu hesla</span>' : ''}</div>
      <div style="margin-top:8px">${links.map(l => { const m = Model.byId(l.player_id); return m ? `<span class="kid">${esc(m.n)}<button onclick="Parents.unlink('${x.id}','${m.id}')" title="Odebrat">✕</button></span>` : ''; }).join('') || '<span class="mut">Žádné přiřazené dítě</span>'}</div>
      ${free.length ? `<div class="row" style="margin-top:6px"><select id="pa-as-${x.id}"><option value="">+ přiřadit dítě…</option>${free.map(m => `<option value="${m.id}">${esc(m.n)}</option>`).join('')}</select>
        <button class="chip" style="flex:none" onclick="Parents.link('${x.id}')">Přiřadit</button></div>` : ''}</div>`;
  }

  static async create() {
    const name = $('#pa-name').value.trim(), email = $('#pa-email').value.trim(), password = $('#pa-pass').value;
    const kids = Object.keys(UI.pkSel || {}).filter(k => UI.pkSel[k]);
    if (!name || !email || !password) return Parents.msg('⚠ Vyplňte jméno, e-mail a heslo.');
    if (password.length < 8) return Parents.msg('⚠ Heslo musí mít aspoň 8 znaků.');
    if (!kids.length) return Parents.msg('⚠ Vyberte alespoň jedno dítě.');
    Parents.msg('Vytvářím účet…', true);
    try {
      await Sync.admin({action: 'create', name, email, password, role: 'p', kids});
      await Sync.loaders.people();
      UI.pkSel = {}; UI.skipKeep = ['pa-name', 'pa-email', 'pa-pass'];
      Parents.msg(`✔ Účet vytvořen: ${name}. Předejte rodiči e-mail a heslo.`, true);
    } catch (e) { Parents.msg('⚠ ' + e.message); }
  }

  static async link(uid) {
    const pid = $('#pa-as-' + uid).value; if (!pid) return;
    if (await Sync.write('Dítě se nepodařilo přiřadit', sb.from('parent_players').insert({parent_id: uid, player_id: pid}))) { await Sync.loaders.people(); App.render(); }
  }
  static async unlink(uid, pid) {
    if (!confirm('Odebrat dítě tomuto rodiči?')) return;
    if (await Sync.write('Dítě se nepodařilo odebrat', sb.from('parent_players').delete().eq('parent_id', uid).eq('player_id', pid))) { await Sync.loaders.people(); App.render(); }
  }
}

/* ---------------------------------------------------------------------
   AttOverview – přehled docházky všech kategorií (VEDENÍ / SPRÁVCE)
   Účast = historie + tréninky označené v aplikaci. Export do Excelu.
   --------------------------------------------------------------------- */
class AttOverview {
  static rows() {
    return DB.members
      .filter(m => (UI.ovTeam == 'all' || m.t == UI.ovTeam) && Util.norm(m.n + ' ' + (m.full || '')).includes(Util.norm(UI.ovSearch)))
      .map(m => { const [ps, tt] = Model.attCount(m); return {m, ps, tt, p: Model.attPct(m)}; })
      .sort((a, b) => a.p - b.p || a.m.t.localeCompare(b.m.t) || (a.m.full || a.m.n).localeCompare(b.m.full || b.m.n, 'cs'));
  }
  static view() {
    const L = AttOverview.rows(), low = L.filter(r => r.p < CONFIG.attMid).length, avg = L.length ? Math.round(L.reduce((a, r) => a + r.p, 0) / L.length) : 0;
    return `<div class="col"><div class="card"><div class="pay"><b>📊 Docházka</b><span class="pill z">${L.length} hráčů</span></div>
        <div class="mut">Průměrná účast ${avg} % · pod ${CONFIG.attMid} %: ${low} hráčů</div>${UI.ovTeam == 'all' ? AttOverview.chart() : ''}
        <button class="btn" style="width:100%;margin-top:8px" onclick="AttOverview.export()">⬇ Export do Excelu</button></div>
      <input id="ov-search" type="search" placeholder="🔍 Hledat hráče…" value="${esc(UI.ovSearch)}" oninput="AttOverview.search(this.value)">
      <div class="row" style="margin:6px 0">${['all', ...CONFIG.planner.teams].map(t => `<button class="chip ${UI.ovTeam == t ? 'on' : ''}" onclick="AttOverview.team('${Util.q(t)}')">${t == 'all' ? 'Všechny kategorie' : esc(t)}</button>`).join('')}</div>
      ${L.map(r => `<div class="card"><div style="display:flex;gap:10px;align-items:center">${Util.avatar(r.m, 36)}
          <div style="flex:1;min-width:0"><b>${esc(r.m.full || r.m.n)}</b> <span class="mut">${esc(r.m.t)}</span>
            <div class="bar" style="margin-top:4px"><i style="width:${r.p}%;background:${Util.attBg(r.p)}"></i></div></div>
          <div style="text-align:right"><b class="${Util.attCls(r.p)}">${r.p} %</b><div class="mut">${r.ps}/${r.tt}</div></div></div></div>`).join('') || '<div class="card mut">Nikdo nenalezen.</div>'}
      ${AttOverview.coaches()}</div>`;
  }
  /** Graf: průměrná docházka po kategoriích. */
  static chart() {
    const L = CONFIG.planner.teams.map(t => { const R = DB.members.filter(m => m.t == t); return R.length ? {t, a: Math.round(R.reduce((s, m) => s + Model.attPct(m), 0) / R.length)} : null; }).filter(Boolean);
    return L.length > 1 ? Charts.bars(L.map(x => ({l: x.t, v: x.a, top: x.a + ' %', c: {g: '', y: 'y', r: 'r'}[Util.attLvl(x.a)]}))) : '';
  }
  /** Docházka trenérů (podle potvrzení „přijdu“ / „nemohu“ a importu). */
  static coaches() {
    const L = Object.values(DB.users).filter(x => x.r == 'c' && (UI.ovTeam == 'all' || x.team == UI.ovTeam) && Util.norm(x.name).includes(Util.norm(UI.ovSearch)))
      .map(x => ({x, st: Model.coachStats(x.id)})).sort((a, b) => a.st.pct - b.st.pct);
    if (!L.length) return '';
    return `<h2>🧢 Trenéři</h2>` + L.map(({x, st}) => `<div class="card"><div style="display:flex;gap:10px;align-items:center"><div style="flex:1;min-width:0"><b>${esc(x.name)}</b> <span class="mut">${esc(x.team)}</span>
      <div class="bar" style="margin-top:4px"><i style="width:${st.pct}%;background:${Util.attBg(st.pct)}"></i></div></div>
      <div style="text-align:right"><b class="${Util.attCls(st.pct)}">${st.pct} %</b><div class="mut">${st.p}/${st.t}</div></div></div></div>`).join('');
  }
  static team(t) { UI.ovTeam = t; App.render(); }
  static search(v) { UI.ovSearch = v; App.render(); const i = $('#ov-search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  static export() {
    if (!window.XLSX) return alert('Knihovnu pro Excel se nepodařilo načíst.');
    const rows = AttOverview.rows().map(r => ({'Hráč': r.m.full || r.m.n, 'Kategorie': r.m.t, 'Účast (tréninky)': r.ps, 'Počet tréninků': r.tt, 'Účast %': r.p}));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Docházka');
    XLSX.writeFile(wb, 'dochazka-' + Util.iso(new Date()) + '.xlsx');
  }
}


/* ---------------------------------------------------------------------
   Admin – záložka "Správa" (VEDENÍ / SPRÁVCE): kategorie, číslo účtu, import z Excelu, záloha dat
   --------------------------------------------------------------------- */
class Admin {
  static msg(t, ok) { UI.admMsg = t; UI.admOk = !!ok; App.render(); }

  static view() {
    const teams = CONFIG.planner.teams, cnt = t => DB.members.filter(m => m.t == t).length;
    return `<div class="col">
      <div class="card"><b>🏷 Kategorie</b>
        ${teams.map(t => `<div class="pl"><span><b>${esc(t)}</b> <span class="mut">${cnt(t)} hráčů</span></span>
          ${cnt(t) ? '' : `<button class="chip" style="color:var(--r)" onclick="Admin.delTeam('${Util.q(t)}')">🗑 Smazat</button>`}</div>`).join('')}
        <div class="row" style="margin-top:8px"><input id="ad-team" placeholder="Nová kategorie (např. U13)" autocomplete="off"><button class="btn" style="flex:none" onclick="Admin.addTeam()">+ Přidat</button></div>
        <div class="mut" style="margin-top:10px">Posun hráčů do vyšší kategorie (např. na konci sezóny):</div>
        <div class="row"><select id="ad-from">${teams.map(t => `<option>${esc(t)}</option>`).join('')}</select><select id="ad-to">${teams.map((t, i) => `<option ${i == 1 ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <button class="btn" style="width:100%;margin-top:6px" onclick="Admin.moveTeam()">Přesunout všechny hráče z → do</button></div>
      <div class="card"><b>💳 Číslo účtu pro platby</b>
        <div class="mut">Zobrazí se rodičům a použije se pro QR platbu (např. 123456789/0800 nebo 19-123456789/0100).</div>
        <div class="row" style="margin-top:6px"><input id="ad-acc" value="${esc(CONFIG.account)}" placeholder="123456789/0800" autocomplete="off"><button class="btn ok" style="flex:none" onclick="Admin.saveAccount()">Uložit</button></div></div>
      ${Venues.adminCard()}
      ${Import.view('players')}
      ${Import.view('parents')}
      <div class="card"><b>💾 Záloha dat</b>
        ${Admin.backupInfo()}
        <div class="mut">Excel se všemi daty klubu: hráči, účty (bez hesel), platby, události, výsledky, docházka, nominace, poznámky, omluvy, rozvrh, zprávy. Na bezplatném tarifu Supabase nejsou automatické zálohy, proto zálohu stahujte pravidelně (aspoň jednou týdně a vždy před větší změnou).</div>
        <button class="btn" style="width:100%;margin-top:8px" onclick="Admin.backup()">⬇ Stáhnout zálohu (Excel)</button>
        <button class="btn" style="width:100%;margin-top:8px" onclick="Admin.backupPhotos()">🖼 Stáhnout fotky (ZIP)</button>
        <div class="mut" style="margin-top:8px">Navíc se každý týden v noci na pondělí automaticky uloží šifrovaná záloha celé databáze na GitHub (Actions → Záloha databáze), pokud jsou nastavené tajné údaje podle README.</div></div>
      ${Usage.card()}
      ${ErrLog.card()}
      ${Captcha.adminCard()}
      ${UI.admMsg ? `<div class="card ${UI.admOk ? 'cg' : 'cr'}">${esc(UI.admMsg)}</div>` : ''}</div>`;
  }

  static async addTeam() {
    const name = ($('#ad-team').value || '').trim().toUpperCase();
    if (!/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9 .\-]{1,12}$/.test(name)) return Admin.msg('⚠ Zadejte název kategorie (např. U13).');
    if (CONFIG.planner.teams.includes(name)) return Admin.msg('⚠ Taková kategorie už existuje.');
    const { error } = await sb.from('teams').insert({name, sort: parseInt(name.replace(/\D/g, '')) || 99});
    if (error) return Admin.msg('⚠ ' + (/relation|teams/.test(error.message) ? 'Nejdřív spusťte aktualizované SQL v Supabase (tabulka teams).' : error.message));
    await Sync.loaders.teams(); UI.skipKeep = ['ad-team']; Admin.msg('✔ Kategorie ' + name + ' přidána.', true);
  }
  static async delTeam(t) {
    if (DB.members.some(m => m.t == t) || Object.values(DB.users).some(u => u.r == 'c' && u.team == t)) return Admin.msg('⚠ Kategorie má hráče nebo trenéra.');
    if (!confirm('Smazat kategorii ' + t + '?')) return;
    const { error } = await sb.from('teams').delete().eq('name', t);
    if (error) return Admin.msg('⚠ ' + error.message);
    CONFIG.planner.teams = CONFIG.planner.teams.filter(x => x != t); await Sync.loaders.teams(); Admin.msg('✔ Kategorie smazána.', true);
  }
  static async moveTeam() {
    const a = $('#ad-from').value, b = $('#ad-to').value;
    if (a == b) return Admin.msg('⚠ Vyberte dvě různé kategorie.');
    const n = DB.members.filter(m => m.t == a).length;
    if (!n) return Admin.msg('⚠ V kategorii ' + a + ' nejsou žádní hráči.');
    if (!confirm(`Přesunout ${n} hráčů z ${a} do ${b}? Rodiče uvidí události nové kategorie.`)) return;
    const { error } = await sb.from('players').update({team: b}).eq('team', a);
    if (error) return Admin.msg('⚠ ' + error.message);
    await Sync.loaders.players(); Admin.msg(`✔ Přesunuto ${n} hráčů z ${a} do ${b}.`, true);
  }
  static async saveAccount() {
    const v = ($('#ad-acc').value || '').trim();
    if (v && !/^(\d{1,6}-)?\d{2,10}\/\d{4}$/.test(v)) return Admin.msg('⚠ Číslo účtu zadejte ve tvaru 123456789/0800 (nebo s předčíslím 19-123456789/0100).');
    const { error } = await sb.from('settings').upsert({key: 'account', value: v}, {onConflict: 'key'});
    if (error) return Admin.msg('⚠ ' + (/relation|settings/.test(error.message) ? 'Nejdřív spusťte aktualizované SQL v Supabase (tabulka settings).' : error.message));
    CONFIG.account = v; Admin.msg('✔ Číslo účtu uloženo.', true);
  }

  /** Řádek o poslední záloze (ze zařízení, kde se stahovala); po týdnu upozorní. */
  static backupInfo() {
    let t = 0; try { t = +localStorage.getItem('unie-last-backup') || 0; } catch (e) {}
    if (!t) return '<div class="warn" style="margin:6px 0">⚠ Na tomto zařízení zatím nebyla stažena žádná záloha.</div>';
    const days = Math.floor((Date.now() - t) / 864e5), d = new Date(t);
    return `<div class="${days > 7 ? 'warn' : 'mut'}" style="margin:6px 0">${days > 7 ? '⚠ ' : ''}Poslední záloha: ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} (${days ? 'před ' + days + ' dny' : 'dnes'})${days > 7 ? ' – stáhněte novou.' : ''}</div>`;
  }
  /** Fotky hráčů a trenérů jako ZIP (složka = kategorie / trenéři). */
  static async backupPhotos() {
    Admin.msg('Připravuji fotky…', true);
    try {
      if (!window.JSZip) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = () => no(new Error('Knihovnu ZIP se nepodařilo načíst.')); document.head.appendChild(s); });
      const zip = new JSZip(), safe = s => String(s || 'bez-jmena').replace(/[\\/:*?"<>|]+/g, '_');
      const items = [...DB.members.map(m => ({ref: m.ph, name: safe(m.t) + '/' + safe(m.full || m.n)})), ...Object.values(DB.users).filter(u => u.r != 'p').map(u => ({ref: u.ph, name: 'treneri-a-vedeni/' + safe(u.name)}))].filter(x => x.ref);
      let n = 0;
      for (const x of items) {
        let blob = null;
        if (Photos.isLegacy(x.ref)) blob = Photos.toBlob(x.ref);
        else if (Photos.isPath(x.ref)) { const r = await sb.storage.from('photos').download(x.ref); blob = r.data; }
        if (blob) { zip.file(x.name + '.jpg', blob); n++; }
      }
      if (!n) return Admin.msg('Žádné fotky k zálohování.', true);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await zip.generateAsync({type: 'blob'}));
      a.download = 'fotky-tj-unie-hlubina-' + Util.iso(new Date()) + '.zip'; a.click();
      Admin.msg('✔ Fotky staženy (' + n + ').', true);
    } catch (e) { Admin.msg('⚠ Fotky se nepodařilo stáhnout: ' + (e.message || e)); }
  }

  /** Záloha: načte všechny tabulky ze serveru a stáhne je jako Excel (list = tabulka). */
  static async backup() {
    Admin.msg('Připravuji zálohu…', true);
    try {
      const tables = {Hráči: 'players', Účty: 'profiles', 'Vazby rodič-dítě': 'parent_players', Příspěvky: 'pay_items', Platby: 'player_payments', Události: 'events', Výsledky: 'results', Docházka: 'attendance', Rozvrh: 'plan', Kategorie: 'teams', Nominace: 'nominations', Poznámky: 'notes', 'Poznámky trenérů': 'player_coach', 'Docházka trenérů': 'coach_attendance', 'Omluvy na delší dobu': 'absence_periods', 'Stálá absence': 'player_absence', 'Zprávy klubu': 'club_messages', Chat: 'chat_messages', Nastavení: 'settings',
                      Místa: 'venues', 'Diskuse u akcí': 'event_comments', 'Plány tréninků': 'event_plans', 'Šablony tréninků': 'training_templates'};
      const data = {};
      for (const [name, t] of Object.entries(tables)) {
        try { data[name] = (await Sync.fetchAll(t, q => q)).map(r => { const o = {...r}; delete o.photo; for (const k in o) if (o[k] && typeof o[k] == 'object') o[k] = JSON.stringify(o[k]); return o; }); } catch (e) { data[name] = []; }
      }
      const stamp = Util.iso(new Date());
      if (window.XLSX) {
        const wb = XLSX.utils.book_new();
        Object.entries(data).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), n.slice(0, 31)));
        XLSX.writeFile(wb, 'zaloha-tj-unie-hlubina-' + stamp + '.xlsx');
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], {type: 'application/json'}));
        a.download = 'zaloha-tj-unie-hlubina-' + stamp + '.json'; a.click();
      }
      try { localStorage.setItem('unie-last-backup', String(Date.now())); } catch (e) {}
      Admin.msg('✔ Záloha stažena (' + Object.values(data).reduce((a, r) => a + r.length, 0) + ' záznamů). Fotky stáhnete zvlášť tlačítkem „Stáhnout fotky“.', true);
    } catch (e) { Admin.msg('⚠ Zálohu se nepodařilo vytvořit: ' + (e.message || e)); }
  }
}


/* ---------------------------------------------------------------------
   KidProfile – profil hráče pro RODIČE: základní údaje, statistiky, docházka a absence dítěte
   --------------------------------------------------------------------- */
class KidProfile {
  /** Karta docházky hráče: součty přítomen / omluven / neomluven a absence tohoto týdne (pro rodiče i trenéra). */
  static attCard(m) {
    const s = Model.attStates(m), pct = Model.attPct(m);
    const ev = DB.events.filter(e => e.tm == m.t && !e.x), mine = e => DB.att[e.id + '|' + m.n];
    const absent = [...ev.filter(e => mine(e) == 'O').map(e => [e, 'O']), ...ev.filter(e => mine(e) == 'N').map(e => [e, 'N'])].sort((a, b) => a[0].d - b[0].d);
    return `<div class="card"><div class="pay"><b>🗓 Docházka na tréninky</b><span class="pill ${Util.attPill(pct)}">${s.p} z ${s.t}</span></div>
        <div class="row" style="margin-top:8px"><div class="card stat"><b class="cg">${s.p}</b><span class="mut">Přítomen</span></div>
          <div class="card stat"><b class="cw">${s.o}</b><span class="mut">Omluven</span></div>
          <div class="card stat"><b class="cr">${s.n}</b><span class="mut">Neomluven</span></div></div>
        ${absent.length ? `<div style="margin-top:10px"><b>Absence tento týden</b>${absent.map(([e, st]) => `<div class="pl"><span>${e.k == 'z' ? '🏆 Zápas' : '⚽ Trénink'} · ${Util.date(e.d)}</span><span class="pill ${st == 'O' ? 'wa' : 'no'}">${st == 'O' ? 'omluven' : 'neomluven'}</span></div>`).join('')}</div>`
          : '<div class="mut" style="margin-top:8px">Tento týden žádná absence. 👍</div>'}
        <div class="mut" style="margin-top:8px">Docházku značí trenér na tréninku. Součty zahrnují i dřívější tréninky; absence ze starší historie se počítají jako omluvené.</div></div>`;
  }
  static view() {
    const m = Model.member(UI.kid);
    if (!m) return '<div class="card mut">K vašemu účtu zatím není přiřazeno žádné dítě. Obraťte se na trenéra nebo vedení klubu.</div>';
    const [ps, tt] = Model.attCount(m), pct = Model.attPct(m), st = DB.docs[m.n] || 'wait', doc = CONFIG.docStatus[st];
    const ev = DB.events.filter(e => e.tm == m.t && !e.x), mine = e => DB.att[e.id + '|' + m.n];
    const exc = ev.filter(e => mine(e) == 'O'), unx = ev.filter(e => mine(e) == 'N');
    const absent = [...exc.map(e => [e, 'O']), ...unx.map(e => [e, 'N'])].sort((a, b) => a[0].d - b[0].d);
    const row = (l, v) => `<div class="pl"><span class="mut">${l}</span><b>${v}</b></div>`;
    return `<div class="col kp">
      <div class="card" style="display:flex;gap:14px;align-items:center">${Util.avatar(m, 72)}
        <div style="min-width:0"><b style="font-size:19px">${esc(m.full || m.n)}</b><div class="mut">Kategorie ${esc(m.t)}${m.no !== '' ? ' · dres č. ' + esc(m.no) : ''}</div></div></div>
      <h2 style="margin:4px 0">📊 Statistiky</h2>
      <div class="row">${[[pct + ' %', 'Docházka', Util.attCls(pct)], [m.mp, 'Odehrané zápasy', ''], [m.gl, 'Vstřelené góly', '']]
        .map(([v, l, c]) => `<div class="card stat"><b class="${c}">${v}</b><span class="mut">${l}</span></div>`).join('')}</div>
      <div class="card"><b>🧾 Základní údaje</b>
        ${row('Jméno', esc(m.full || m.n))}${row('Kategorie', esc(m.t))}${row('Číslo dresu', m.no === '' ? '—' : esc(m.no))}${row('Ročník narození', m.by === '' ? '—' : esc(m.by))}
        <div class="pl"><span class="mut">Zdravotní prohlídka</span><span class="pill ${doc[1]}">${doc[0]}</span></div></div>
      ${KidEdit.card(m)}
      ${Absence.card(m.n)}
      ${KidProfile.attCard(m)}
      ${Progress.card(m)}</div>`;
  }
}


/* ---------------------------------------------------------------------
   AttImport – import docházky z tabulky (Excel) pro trenéry a vedení
   Očekávaný vzhled (jako klubová tabulka): nad jménem hráčů je řádek s hlavičkou „Post | Jméno | 3.8. | 4.8. | …“,
   nad ním (v rozích) název kategorie, např. „U9“. Hráči mají ve sloupcích dat 1 (přítomen) nebo 0 (nepřítomen),
   řádky „Trenér“ stejně. Prázdný / černý sloupec = trénink se nekonal. Sloupce „Celkem“ se ignorují.
   Pro každý den se (pokud ještě není) založí trénink kategorie a uloží se docházka. Opakovaný import nic nezdvojuje.
   --------------------------------------------------------------------- */
class AttImport {
  static view() {
    const i = UI.ai;
    return `<div class="card" style="margin-top:12px"><b>📥 Import docházky z tabulky</b>
      <div class="mut">Nahrajte tabulku s celkovou docházkou hráčů. Stáhněte si předlohu (je v ní už vaše soupiska), doplňte sloupce <b>Celková účast</b> a <b>Počet tréninků</b> a nahrajte ji zpět. Hráči se hledají podle jména (a ročníku), hodnoty se uloží jako dosavadní docházka. Řádek s postem „Trenér“ (nebo jméno trenéra s účtem) uloží docházku trenéra; hráče, který ještě není v soupisce, aplikace nově založí. Podporovaná je i původní klubová tabulka s daty a hodnotami 1 / 0.</div>
      <button class="btn" type="button" style="width:100%;margin-top:8px" onclick="AttImport.template()">⬇ Stáhnout předlohu</button>
      <label class="btn" style="cursor:pointer;display:block;text-align:center;margin-top:8px">📂 Vybrat vyplněnou tabulku<input type="file" accept=".xlsx,.xls,.csv" hidden onchange="AttImport.read(this)"></label>
      ${i && !i.done ? AttImport.preview(i) : ''}${i && i.done ? AttImport.report(i) : ''}</div>`;
  }

  static preview(i) {
    if (i.mode == 'simple') return AttImport.previewSimple(i);
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px">
      ${i.blocks.map(b => `<div style="margin-bottom:8px"><b>${esc(b.team)}</b> · ${b.dates.length} tréninků (${esc(Util.isoShort(b.dates[0] || ''))} – ${esc(Util.isoShort(b.dates[b.dates.length - 1] || ''))})
        <div class="mut">Hráčů: ${b.players.length}${b.unmatched.length ? ` · nenalezeno v soupisce: ${b.unmatched.length}` : ''} · trenérů v tabulce: ${b.coaches.length}${b.skip ? ` · <span class="cr">${esc(b.skip)}</span>` : ''}</div>
        ${b.unmatched.length ? `<div class="warn" style="margin-top:4px">Nenalezeno: ${b.unmatched.slice(0, 10).map(esc).join(', ')}${b.unmatched.length > 10 ? ' …' : ''}</div>` : ''}</div>`).join('') || '<div class="warn">V souboru jsem nenašel tabulku docházky (řádek s hlavičkou „Jméno“ a daty).</div>'}
      ${i.notes.map(n => `<div class="mut">ℹ ${esc(n)}</div>`).join('')}
      <label class="mut" style="margin-top:6px">Rok (prázdné = určí se automaticky)<input id="ai-year" type="number" min="2020" max="2100" placeholder="např. ${new Date().getFullYear()}" value="${esc(i.year || '')}" onchange="AttImport.setYear(this.value)"></label>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="AttImport.cancel()">Zrušit</button>
        <button class="btn ok" ${i.blocks.some(b => b.players.length || b.coachRows.length) && !i.running ? '' : 'disabled'} onclick="AttImport.run()">${i.running ? 'Importuji… ' + i.progress : 'Provést import'}</button></div></div>`;
  }

  static report(i) {
    const d = i.done;
    if (d.simple) return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px"><div class="cg"><b>✔ Import dokončen</b></div><div>Aktualizováno hráčů: <b>${d.n}</b>${d.created ? ` · nově založeno: <b>${d.created}</b>` : ''}${d.coaches ? ` · trenérů: <b>${d.coaches}</b>` : ''}</div>${d.errors.length ? `<div class="warn" style="margin-top:6px">⚠ ${d.errors.slice(0, 6).map(esc).join('<br>')}</div>` : ''}<button class="btn" style="width:100%;margin-top:8px" onclick="AttImport.cancel()">Hotovo</button></div>`;
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px"><div class="cg"><b>✔ Import dokončen</b></div>
      <div>Tréninků nových: <b>${d.newEvents}</b>, už existovalo: <b>${d.oldEvents}</b> · záznamů docházky hráčů: <b>${d.players}</b> · trenérů: <b>${d.coaches}</b></div>
      ${d.errors.length ? `<div class="warn" style="margin-top:6px">⚠ ${d.errors.slice(0, 6).map(esc).join('<br>')}</div>` : ''}
      <button class="btn" style="width:100%;margin-top:8px" onclick="AttImport.cancel()">Hotovo</button></div>`;
  }

  static cancel() { UI.ai = null; App.render(); }
  static setYear(v) { if (UI.ai) { UI.ai.year = v; if (UI.ai.grids) { const y = UI.ai; UI.ai = Object.assign(AttImport.parseGrids(y.grids, +v || 0), {year: v, grids: y.grids}); } App.render(); } }

  static read(input) {
    const file = input.files[0]; if (!file) return;
    if (!window.XLSX) { alert('Knihovnu pro Excel se nepodařilo načíst.'); return; }
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {type: 'array', cellDates: true});
        const grids = wb.SheetNames.map(n => ({name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, raw: true, defval: null})}));
        UI.ai = AttImport.parseSimple(grids) || Object.assign(AttImport.parseGrids(grids, 0), {year: '', grids});
      } catch (x) { UI.ai = {blocks: [], notes: ['Soubor se nepodařilo přečíst.'], year: '', done: null}; }
      App.render();
    };
    rd.readAsArrayBuffer(file);
    input.value = '';
  }


  // ---------- jednoduchá předloha: Jméno hráče | Ročník | Celková účast | Počet tréninků | Post | Kategorie ----------
  /** Trenéři, které smí uživatel importem upravit: vedení všechny, trenér jen sebe. */
  static staff() { const me = UI.user; return Object.values(DB.users).filter(x => (x.r == 'c' || x.r == 'a') && (Model.mgmt(me) || x.id == me.id)); }

  static template() {
    if (!window.XLSX) return alert('Knihovnu pro Excel se nepodařilo načíst.');
    const me = UI.user, mg = Model.mgmt(me), L = (mg ? DB.members.slice() : Model.membersOf(me.team)).sort((a, b) => (a.t + a.full).localeCompare(b.t + b.full, 'cs'));
    const head = ['Jméno hráče', 'Ročník', 'Celková účast', 'Počet tréninků', 'Post'].concat(mg ? ['Kategorie'] : []);
    // dosavadní docházka (bez tréninků označených v aplikaci), aby se po nahrání nic nezdvojilo
    const rows = L.map(m => [m.full || m.n, m.by === '' ? '' : m.by, m.a[0], m.a[1], 'Hráč'].concat(mg ? [m.t] : []));
    AttImport.staff().sort((a, b) => a.name.localeCompare(b.name, 'cs')).forEach(x => rows.push([x.name, '', x.ap || 0, x.at || 0, 'Trenér'].concat(mg ? [x.team || ''] : [])));
    const ws = XLSX.utils.aoa_to_sheet([head, ...(rows.length ? rows : [['Novák Jan', 2018, 12, 15, 'Hráč']])]);
    ws['!cols'] = [{wch: 28}, {wch: 9}, {wch: 14}, {wch: 15}, {wch: 9}, {wch: 11}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Docházka');
    XLSX.writeFile(wb, 'predloha-dochazka.xlsx');
  }

  /** Najde v listech tabulku „Jméno hráče | Ročník | Celková účast | Počet tréninků [| Post | Kategorie]“; vrátí náhled importu, nebo null (pak se zkusí původní klubová tabulka).
      Řádek s Post = Trenér (nebo jméno trenéra, který není mezi hráči) uloží docházku trenéra; hráč, který není v soupisce, se může nově založit. */
  static parseSimple(grids) {
    const me = UI.user, mg = Model.mgmt(me), own = mg ? '' : me.team, pool = own ? DB.members.filter(m => m.t == own) : DB.members, idx = {}, sidx = {}, teams = CONFIG.planner.teams;
    pool.forEach(m => [AttImport.key(m.full), AttImport.key(m.n)].forEach(k => { if (k) (idx[k] = idx[k] || []).push(m); }));
    Object.values(DB.users).filter(x => x.r == 'c' || x.r == 'a').forEach(x => sidx[AttImport.key(x.name)] = x);
    const num = v => { const x = Number(String(v == null ? '' : v).replace(',', '.').trim()); return v !== null && String(v).trim() !== '' && isFinite(x) && x >= 0 ? Math.round(x) : null; };
    const year = v => { const x = num(v); return x === null ? 0 : x < 100 ? 2000 + x : x; };
    const rows = []; let found = false;
    for (const g of grids) {
      const R = g.rows || [];
      for (let ri = 0; ri < R.length && !found; ri++) {
        const hdr = (R[ri] || []).map(v => Util.norm(String(v == null ? '' : v)));
        const cn = hdr.findIndex(h => h.startsWith('jmeno') && !h.includes('trener')), cy = hdr.findIndex(h => h.includes('rocnik'));
        const cp = hdr.findIndex(h => h.includes('ucast')), ct = hdr.findIndex(h => h.includes('pocet') || h.includes('treninku'));
        const cr = hdr.findIndex(h => h == 'post' || h == 'role'), ck = hdr.findIndex(h => h.includes('kategorie') || h == 'tym');
        if (cn < 0 || cp < 0 || ct < 0 || (R[ri] || []).some((v, ci) => ci > cn && AttImport.cellDate(v))) continue;
        found = true;
        for (let r = ri + 1; r < R.length; r++) {
          const row = R[r] || [], name = String(row[cn] == null ? '' : row[cn]).trim(); if (!name) continue;
          const by = cy >= 0 ? year(row[cy]) : 0, p = num(row[cp]), t = num(row[ct]), post = cr >= 0 ? Util.norm(String(row[cr] == null ? '' : row[cr])) : '';
          const kat = ck >= 0 ? String(row[ck] == null ? '' : row[ck]).trim().toUpperCase() : '';
          const o = {name, by, p, t, m: null, coach: null, create: null, err: ''};
          let c = idx[AttImport.key(name)] || [];
          if (c.length > 1 && by) c = c.filter(m => +m.by == by);
          const st = sidx[AttImport.key(name)], wantCoach = post.startsWith('trener') || (!post.startsWith('hrac') && !c.length && st);
          if (p === null || t === null) o.err = 'chybí číslo';
          else if (p > t) o.err = 'účast je větší než počet tréninků';
          else if (wantCoach) {
            if (!st) o.err = 'trenér nemá v aplikaci účet';
            else if (!mg && st.id != me.id) o.err = 'cizí trenér – uloží ho vedení nebo on sám';
            else o.coach = st;
          } else if (c.length == 1) o.m = c[0];
          else if (c.length) o.err = 'jméno není jednoznačné (doplňte ročník)';
          else {
            const team = own || kat;                                                    // hráč není v soupisce → lze ho založit
            if (!team) o.err = 'hráč není v soupisce a chybí kategorie';
            else if (!teams.includes(team)) o.err = 'neznámá kategorie „' + team + '“';
            else o.create = {player: name, team, no: null, year: by || null};
          }
          rows.push(o);
        }
      }
    }
    return found ? {mode: 'simple', rows, makeNew: true, running: false, progress: '', done: null} : null;
  }

  static setNew(v) { if (UI.ai) { UI.ai.makeNew = !!v; App.render(); } }

  static previewSimple(i) {
    const upd = i.rows.filter(r => r.m), cch = i.rows.filter(r => r.coach), neu = i.rows.filter(r => r.create), bad = i.rows.filter(r => !r.m && !r.coach && !r.create);
    const total = upd.length + cch.length + (i.makeNew ? neu.length : 0);
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px">
      <div>Hráčů k aktualizaci: <b>${upd.length}</b> · trenérů: <b>${cch.length}</b> · nových hráčů: <b>${neu.length}</b>${bad.length ? ` · <span class="cr">nelze použít: <b>${bad.length}</b></span>` : ''}</div>
      ${upd.slice(0, 6).map(r => { const [p0, t0] = r.m.a; return `<div class="pl"><span>${esc(r.m.full || r.m.n)} <span class="mut">${esc(r.m.t)}</span></span><span class="mut">${p0}/${t0} → <b>${r.p}/${r.t}</b></span></div>`; }).join('')}
      ${cch.map(r => `<div class="pl"><span>🧢 ${esc(r.coach.name)}</span><span class="mut">${r.coach.ap || 0}/${r.coach.at || 0} → <b>${r.p}/${r.t}</b></span></div>`).join('')}
      ${upd.length > 6 ? `<div class="mut">… a dalších ${upd.length - 6} hráčů</div>` : ''}
      ${neu.length ? `<div style="margin-top:6px"><label class="keep" style="margin:0"><input type="checkbox" ${i.makeNew ? 'checked' : ''} onchange="AttImport.setNew(this.checked)"> Založit chybějící hráče (${neu.length}):</label>
        <div class="mut">${neu.slice(0, 12).map(r => esc(r.name) + ' (' + esc(r.create.team) + (r.create.year ? ', ' + r.create.year : '') + ')').join(', ')}${neu.length > 12 ? ' …' : ''}</div></div>` : ''}
      ${bad.length ? `<div class="warn" style="margin-top:6px">${bad.slice(0, 8).map(r => esc(r.name) + ' – ' + esc(r.err)).join('<br>')}${bad.length > 8 ? '<br>…' : ''}</div>` : ''}
      <div class="row" style="margin-top:8px"><button class="btn" onclick="AttImport.cancel()">Zrušit</button>
        <button class="btn ok" ${total && !i.running ? '' : 'disabled'} onclick="AttImport.run()">${i.running ? 'Ukládám…' : 'Provést import'}</button></div></div>`;
  }

  /** Uloží dosavadní docházku (att_present / att_total) hráčů a trenérů; chybějící hráče případně nejdřív založí. Docházka označená v aplikaci se k ní dál přičítá. */
  static async runSimple() {
    const i = UI.ai, out = {simple: 1, n: 0, created: 0, coaches: 0, errors: []}; i.running = true; App.render();
    const L = i.rows.filter(r => r.m);
    for (let k = 0; k < L.length; k += 10) {
      const res = await Promise.all(L.slice(k, k + 10).map(r => sb.from('players').update({att_present: r.p, att_total: r.t}).eq('id', r.m.id).select()));
      res.forEach((x, j) => { if (x.error) out.errors.push(L[k + j].name + ': ' + x.error.message); else if (!x.data || !x.data.length) out.errors.push(L[k + j].name + ': uložení nebylo povoleno'); else out.n++; });
    }
    if (i.makeNew) for (const r of i.rows.filter(x => x.create)) {
      try {
        const m = await Import.addPlayer(r.create);
        const x = await sb.from('players').update({att_present: r.p, att_total: r.t}).eq('id', m.id).select();
        if (x.error) throw new Error(x.error.message);
        out.created++;
      } catch (e) { out.errors.push(r.name + ': ' + (e.message || e)); }
    }
    for (const r of i.rows.filter(x => x.coach)) {
      const x = await sb.rpc('set_coach_baseline', {cid: r.coach.id, pres: r.p, tot: r.t});
      if (x.error) out.errors.push(r.name + ': ' + x.error.message + (/function|schema cache/.test(x.error.message) ? ' – nejdřív spusťte aktualizované SQL' : '')); else out.coaches++;
    }
    try { await Sync.loaders.players(); await Sync.loaders.people(); } catch (e) {}
    i.running = false; i.done = out; App.render();
  }

  // ---------- zpracování původní klubové tabulky ----------
  /** Slova jména bez diakritiky, bez závorky s ročníkem, seřazená (pořadí „příjmení jméno“ nehraje roli). */
  static key(n) { return Util.norm(String(n || '').replace(/\(.*$/, '')).split(/\s+/).filter(Boolean).sort().join(' '); }

  /** Buňka → {m, d} (měsíc, den) nebo null. Podporuje „3.8.“, „3. 8.“, „3.8.2026“, skutečné datum a pořadové číslo Excelu. */
  static cellDate(v) {
    if (v instanceof Date && !isNaN(v)) return {d: v.getDate(), m: v.getMonth() + 1, y: v.getFullYear(), real: true};
    if (typeof v == 'number' && v > 40000 && v < 70000) { const x = new Date(Math.round((v - 25569) * 864e5)); return {d: x.getUTCDate(), m: x.getUTCMonth() + 1, y: x.getUTCFullYear(), real: true}; }
    const m = typeof v == 'string' && v.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?$/);
    return m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 ? {d: +m[1], m: +m[2], y: m[3] ? +m[3] : 0, real: !!m[3]} : null;
  }

  /** Rok pro datum bez roku: aktuální; leží-li datum za více než 2 měsíce v budoucnosti, předchozí rok. */
  static iso(c, year) {
    let y = c.y || year || new Date().getFullYear();
    if (!c.y && !year) { const dt = new Date(y, c.m - 1, c.d); if (dt - new Date() > 62 * 864e5) y--; }
    return `${y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
  }

  /** Najde v listech všechny bloky tabulky docházky. */
  static parseGrids(grids, year) {
    const blocks = [], notes = [], me = UI.user, own = !Model.mgmt(me) ? me.team : '';
    const teams = CONFIG.planner.teams;
    grids.forEach(g => {
      const R = g.rows || [];
      R.forEach((row, ri) => {
        const nc = (row || []).findIndex(v => Util.norm(String(v == null ? '' : v)) == 'jmeno'); if (nc < 0) return;
        const dateCols = []; (row || []).forEach((v, ci) => { if (ci > nc) { const c = AttImport.cellDate(v); if (c) dateCols.push({ci, c}); } });
        if (!dateCols.length) return;
        // kategorie: buňka „U9“ v několika řádcích nad hlavičkou
        let team = '';
        for (let k = ri - 1; k >= Math.max(0, ri - 6) && !team; k--) for (const v of (R[k] || [])) { const t = String(v == null ? '' : v).trim().toUpperCase(); if (teams.includes(t)) { team = t; break; } }
        const b = {sheet: g.name, team: team || own || '', dates: [], players: [], unmatched: [], coaches: [], coachRows: [], cols: dateCols, skip: ''};
        const postCol = nc - 1;
        for (let r = ri + 1; r < R.length; r++) {
          const rw = R[r] || [], nm = rw[nc]; if (nm != null && Util.norm(String(nm)) == 'jmeno') break;               // další blok
          const post = Util.norm(String(rw[postCol] == null ? '' : rw[postCol])), name = String(nm == null ? '' : nm).trim();
          if (!name || !post) continue;
          const vals = dateCols.map(dc => { const v = rw[dc.ci]; return v === 1 || v === '1' ? 1 : v === 0 || v === '0' ? 0 : null; });
          if (post.startsWith('hrac')) b.players.push({name, vals});
          else if (post.startsWith('trener')) b.coaches.push({name, vals});
        }
        // dny, kdy se trénovalo: aspoň jedna hodnota 0/1 ve sloupci
        b.dates = []; b.use = [];
        dateCols.forEach((dc, i) => { if (b.players.some(p => p.vals[i] != null) || b.coaches.some(p => p.vals[i] != null)) { b.dates.push(AttImport.iso(dc.c, year)); b.use.push(i); } });
        if (!b.team) b.skip = 'chybí kategorie (např. „U9“ nad tabulkou)';
        else if (own && b.team != own) b.skip = 'jiná kategorie než vaše – přeskočeno';
        // přiřazení hráčů k soupisce
        if (!b.skip) {
          const pool = DB.members.filter(m => m.t == b.team), idx = {}; pool.forEach(m => { idx[AttImport.key(m.full || m.n)] = m; idx[AttImport.key(m.n)] = idx[AttImport.key(m.n)] || m; });
          b.matched = []; b.players.forEach(p => { const m = idx[AttImport.key(p.name)]; if (m) b.matched.push({m, vals: p.vals}); else b.unmatched.push(p.name); });
          // trenéři: vedení zná všechny účty, trenér jen sebe
          const staff = Object.values(DB.users).filter(x => (x.r == 'c' || x.r == 'a') && (Model.mgmt(me) || x.id == me.id)), sidx = {}; staff.forEach(x => sidx[AttImport.key(x.name)] = x);
          b.coachRows = []; b.coaches.forEach(c => { const x = sidx[AttImport.key(c.name)]; if (x) b.coachRows.push({x, vals: c.vals}); });
          if (!Model.mgmt(me) && b.coaches.length > b.coachRows.length) notes.push(`${b.team}: řádky ostatních trenérů uloží vedení nebo si je naimportují oni sami.`);
        }
        blocks.push(b);
      });
    });
    return {blocks, notes, running: false, progress: '', done: null};
  }

  static async run() {
    const i = UI.ai; if (!i || i.running) return;
    if (i.mode == 'simple') return AttImport.runSimple();
    const year = +i.year || 0;
    i.running = true; i.progress = ''; App.render();
    const out = {newEvents: 0, oldEvents: 0, players: 0, coaches: 0, errors: []};
    try {
      for (const b of i.blocks) {
        if (b.skip || !b.dates.length) continue;
        i.progress = b.team; App.render();
        const lo = b.dates[0] < b.dates[b.dates.length - 1] ? b.dates[0] : b.dates[b.dates.length - 1], dates = [...new Set(b.dates)].sort();
        const ex = await sb.from('events').select('id,event_date,kind').eq('team', b.team).eq('kind', 't').gte('event_date', dates[0]).lte('event_date', dates[dates.length - 1]);
        if (ex.error) throw new Error(ex.error.message);
        const byDate = {}; (ex.data || []).forEach(e => { if (!byDate[e.event_date]) byDate[e.event_date] = e.id; });
        const missing = dates.filter(d => !byDate[d]);
        if (missing.length) {
          const ins = await sb.from('events').insert(missing.map(d => ({kind: 't', team: b.team, event_date: d, time: '16:00', place: '', meet: '', coach: '', opponent: ''}))).select();
          if (ins.error) throw new Error(ins.error.message);
          (ins.data || []).forEach(e => byDate[e.event_date] = e.id);
        }
        out.newEvents += missing.length; out.oldEvents += dates.length - missing.length;
        const att = [], ca = [];
        b.use.forEach((ci, k) => {
          const evId = byDate[b.dates[k]]; if (!evId) return;
          b.matched.forEach(p => { const v = p.vals[ci]; if (v != null) att.push({event_id: evId, player_id: p.m.id, state: v ? 'P' : 'O'}); });
          b.coachRows.forEach(c => { const v = c.vals[ci]; if (v != null) ca.push({event_id: evId, coach_id: c.x.id, state: v ? 'y' : 'n'}); });
        });
        // duplicitní dvojice (stejné datum ve dvou sloupcích) – platí poslední
        const dedupe = (L, k2) => { const m = new Map(); L.forEach(r => m.set(r.event_id + '|' + r[k2], r)); return [...m.values()]; };
        const A = dedupe(att, 'player_id'), C = dedupe(ca, 'coach_id');
        for (let k = 0; k < A.length; k += 150) {
          const r = await sb.from('attendance').upsert(A.slice(k, k + 150), {onConflict: 'event_id,player_id'});
          if (r.error) throw new Error(r.error.message);
        }
        for (let k = 0; k < C.length; k += 150) {
          const r = await sb.from('coach_attendance').upsert(C.slice(k, k + 150), {onConflict: 'event_id,coach_id'});
          if (r.error) throw new Error(r.error.message);
        }
        out.players += A.length; out.coaches += C.length;
      }
    } catch (e) { out.errors.push(String(e.message || e)); }
    await Promise.all([Sync.loaders.events(), Sync.loaders.attendance(), Sync.loaders.coach()]);
    i.running = false; i.done = out; App.render();
  }
}


/* ---------------------------------------------------------------------
   Settings – záložka „Nastavení“ (všechny role): upozornění, export statistik do Excelu, import docházky
   --------------------------------------------------------------------- */
class Settings {
  static CATS = [['chat', '💬 Chat týmu'], ['dm', '✉ Soukromé zprávy'], ['club', '📢 Zprávy od vedení'], ['ev', '📅 Tréninky a zápasy (nové, zrušené, výsledky, omluvy)'], ['pay', '💳 Platby a dokumenty']];
  static msg(t, ok) { UI.setMsg = t; UI.setOk = !!ok; App.render(); }

  static view() {
    // Hlavní vypínač je jen tlačítko zařízení (Push.profileBlock); starý přepínač „Upozornění zapnutá“ (klíč 'all') se už nezobrazuje
    const u = UI.user, P = DB.prefs || {}, on = k => P.all !== false && P[k] !== false;
    const cats = Settings.CATS.filter(([k]) => !(k == 'chat' && u.r == 'v') && !(k == 'pay' && u.r == 'c'));
    return `<div class="col">
      <div class="card"><b>🔔 Upozornění v telefonu</b>
        ${Push.profileBlock(true)}
        <div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px"><b>Co mi má přijít do telefonu</b>
          ${cats.map(([k, l]) => `<label class="pl"><span>${l}</span><input type="checkbox" ${on(k) ? 'checked' : ''} onchange="Settings.pref('${k}',this.checked)"></label>`).join('')}
          <div class="mut" style="margin-top:6px">Týká se upozornění do telefonu. Zvonek v aplikaci zobrazuje vše.</div></div>
        ${Settings.quiet()}
        ${UI.setMsg ? `<div class="${UI.setOk ? 'cg' : 'warn'}" style="margin-top:8px">${esc(UI.setMsg)}</div>` : ''}</div>
      ${Theme.card()}
      ${Settings.chatRetention()}
      ${Settings.calendar()}
      ${u.r == 'v' ? '' : Tpl.card()}
      ${u.r == 'p' ? '' : Venues.adminCard()}
      ${Report.card()}
      <div class="card"><b>📤 Export statistik do Excelu</b>
        <div class="mut">${u.r == 'p' ? 'Docházka a statistiky vašeho dítěte.' : u.r == 'c' ? 'Docházka hráčů a trenérů vaší kategorie a výsledky zápasů.' : 'Docházka hráčů a trenérů všech kategorií a výsledky zápasů.'}</div>
        <button class="btn ok" style="width:100%;margin-top:8px" onclick="Settings.export()">⬇ Stáhnout Excel</button></div>
      ${u.r == 'p' ? '' : AttImport.view()}</div>`;
  }

  /** Noční klid: v nastavených hodinách push nepřijde hned, ale ráno jako jeden souhrn (výchozí 22–7). */
  static quiet() {
    const P = DB.prefs || {}, on = P.quiet !== false, f = P.qf ?? 22, t = P.qt ?? 7, H = [...Array(24).keys()];
    const sel = (k, v) => `<select onchange="Settings.pref('${k}',+this.value)">${H.map(h => `<option value="${h}" ${h == v ? 'selected' : ''}>${h}:00</option>`).join('')}</select>`;
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px">
      <label class="pl"><span>🌙 Noční klid – upozornění v noci nepípnou, ráno přijdou souhrnně</span><input type="checkbox" ${on ? 'checked' : ''} onchange="Settings.pref('quiet',this.checked)"></label>
      ${on ? `<div class="row"><label class="mut">Od${sel('qf', f)}</label><label class="mut">Do${sel('qt', t)}</label></div>` : ''}</div>`;
  }

  // ----- Mazání starých zpráv chatu kategorie (nastavuje trenér své kategorie) -----
  static DAYS = [[7, '7 dní'], [14, '14 dní'], [30, '30 dní'], [60, '2 měsíce'], [90, '3 měsíce'], [180, '6 měsíců'], [365, '1 rok'], [0, 'Nemazat']];
  static chatRetention() {
    const u = UI.user;
    if (!(Model.coachLike(u) && u.team)) return '';
    const d = (DB.chatDays || {})[u.team] ?? 30;
    return `<div class="card"><b>🗑 Mazání chatu ${esc(u.team)}</b>
      <div class="mut" style="margin-top:4px">Zprávy v chatu kategorie a v chatu trenérů se po zvolené době samy smažou (u všech členů).</div>
      <label class="pl"><span>Mazat zprávy starší než</span><select onchange="Settings.setChatDays(+this.value)">
        ${Settings.DAYS.map(([v, l]) => `<option value="${v}" ${v == d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${UI.chatMsg ? `<div class="${UI.chatOk ? 'cg' : 'warn'}" style="margin-top:8px">${esc(UI.chatMsg)}</div>` : ''}</div>`;
  }
  static async setChatDays(d) {
    const t = UI.user.team, old = (DB.chatDays || {})[t];
    if (d && (!old || d < old) && !confirm('Zprávy starší než ' + Settings.DAYS.find(x => x[0] == d)[1] + ' se hned smažou všem členům. Pokračovat?')) return App.render();
    const r = await sb.rpc('set_chat_days', {t, d});
    if (r.error) { UI.chatMsg = '⚠ Nepodařilo se uložit' + (/set_chat_days|function/.test(r.error.message) ? ' – nejdřív spusťte aktualizované SQL v Supabase.' : '.'); UI.chatOk = false; return App.render(); }
    DB.chatDays = Object.assign({}, DB.chatDays, {[t]: d});
    UI.chatMsg = d ? '✔ Uloženo. Zprávy se budou mazat po ' + Settings.DAYS.find(x => x[0] == d)[1] + '.' : '✔ Uloženo. Zprávy se nebudou mazat.'; UI.chatOk = true; App.render();
  }

  // ----- Kalendář do telefonu (odkaz ICS, v kalendáři se aktualizuje sám) -----
  static calUrl() { return `${SUPABASE_URL}/functions/v1/calendar?t=${DB.calTok}`; }
  static calendar() {
    if (UI.calTok === undefined) { UI.calTok = null; Settings.calLoad(); }
    const t = DB.calTok, scope = UI.user.r == 'p' ? 'tréninky a zápasy kategorie vašeho dítěte' : UI.user.r == 'c' ? 'tréninky a zápasy vaší kategorie' : 'tréninky a zápasy všech kategorií';
    const body = t === undefined ? '<div class="mut" style="margin-top:6px">Načítám…</div>'
      : !t ? `<div class="mut" style="margin-top:6px">Přidejte si ${scope} do kalendáře v telefonu. Nové, přesunuté i zrušené akce se tam samy aktualizují.</div>
          <button class="btn ok" style="width:100%;margin-top:8px" onclick="Settings.calCreate()">📆 Vytvořit odkaz do kalendáře</button>`
      : `<div class="mut" style="margin-top:6px">Obsahuje ${scope}. Aktualizace v kalendáři chodí zhruba po hodině.</div>
          <div class="row" style="margin-top:8px"><a class="btn ok" href="webcal://${esc(Settings.calUrl().replace(/^https?:\/\//, ''))}">📆 Přidat do kalendáře</a>
            <a class="btn" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://' + Settings.calUrl().replace(/^https?:\/\//, ''))}">Google Kalendář</a></div>
          <input class="cal-url" readonly value="${esc(Settings.calUrl())}" onfocus="this.select()">
          <div class="row"><button class="btn" onclick="Settings.calCopy()">📋 Zkopírovat odkaz</button><button class="btn" onclick="Settings.calReset()">🔄 Vyměnit odkaz</button></div>
          <div class="mut" style="margin-top:6px">Odkaz je soukromý – nikomu ho neposílejte. Kdyby se dostal do cizích rukou, klepněte na „Vyměnit odkaz“ (starý přestane fungovat).
            iPhone: klepněte na „Přidat do kalendáře“. Android: v Google Kalendáři na počítači Další kalendáře → Z adresy URL a vložte odkaz.</div>`;
    return `<div class="card"><b>📆 Kalendář v telefonu</b>${body}${UI.calMsg ? `<div class="${UI.calOk ? 'cg' : 'warn'}" style="margin-top:8px">${esc(UI.calMsg)}</div>` : ''}</div>`;
  }
  static async calLoad() {
    try { const { data, error } = await sb.from('calendar_tokens').select('token'); DB.calTok = (!error && data && data[0] && data[0].token) || ''; }
    catch (e) { DB.calTok = ''; }
    App.render();
  }
  static calMsg(t, ok) { UI.calMsg = t; UI.calOk = !!ok; App.render(); }
  static async calCreate() {
    const token = crypto.randomUUID();
    const r = await sb.from('calendar_tokens').upsert({user_id: UI.user.id, token}, {onConflict: 'user_id'});
    if (r.error) return Settings.calMsg('⚠ Odkaz se nepodařilo vytvořit' + (/relation|calendar_tokens/.test(r.error.message) ? ' – nejdřív spusťte aktualizované SQL v Supabase.' : '.'));
    DB.calTok = token; UI.calMsg = ''; App.render();
  }
  static async calReset() {
    if (!confirm('Vyměnit odkaz? Kalendář, který ho používá, přestane fungovat a bude potřeba přidat nový odkaz.')) return;
    const token = crypto.randomUUID();
    const r = await sb.from('calendar_tokens').upsert({user_id: UI.user.id, token}, {onConflict: 'user_id'});
    if (r.error) return Settings.calMsg('⚠ Odkaz se nepodařilo vyměnit.');
    DB.calTok = token; Settings.calMsg('✔ Odkaz je nový. Přidejte si ho do kalendáře znovu.', true);
  }
  static async calCopy() {
    try { await navigator.clipboard.writeText(Settings.calUrl()); Settings.calMsg('✔ Odkaz zkopírován.', true); }
    catch (e) { const i = document.querySelector(".cal-url"); if (i) { i.focus(); i.select(); } Settings.calMsg('Označte odkaz a zkopírujte ho ručně.'); }
  }

  static async pref(k, v) {
    DB.prefs = Object.assign({}, DB.prefs, {[k]: v}); delete DB.prefs.all; App.render();   // 'all' = zrušený hlavní přepínač, při změně se vždy smaže
    const r = await sb.from('user_prefs').upsert({user_id: UI.user.id, notif: DB.prefs}, {onConflict: 'user_id'});
    if (r.error) Settings.msg('⚠ Nastavení se nepodařilo uložit' + (/relation|user_prefs/.test(r.error.message) ? ' – nejdřív spusťte aktualizované SQL v Supabase.' : '.'));
  }

  static export() {
    if (!window.XLSX) return Settings.msg('⚠ Knihovnu pro Excel se nepodařilo načíst.');
    const u = UI.user, wb = XLSX.utils.book_new();
    const mem = u.r == 'p' ? (u.kids || []).map(n => Model.member(n)).filter(Boolean) : u.r == 'c' ? Model.membersOf(u.team) : DB.members.slice();
    const teams = new Set(mem.map(m => m.t));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mem.map(m => { const [ps, tt] = Model.attCount(m);
      return {'Hráč': m.full || m.n, 'Kategorie': m.t, 'Číslo dresu': m.no, 'Účast (tréninky)': ps, 'Počet tréninků': tt, 'Účast %': Model.attPct(m), 'Odehrané zápasy': m.mp, 'Góly': m.gl}; })), 'Hráči');
    if (u.r != 'p') {
      const co = Object.values(DB.users).filter(x => x.r == 'c' && (u.r != 'c' || x.team == u.team)).map(x => { const st = Model.coachStats(x.id);
        return {'Trenér': x.name, 'Kategorie': x.team, 'Účast (tréninky)': st.p, 'Počet tréninků': st.t, 'Účast %': st.pct}; });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(co), 'Trenéři');
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.results.filter(r => teams.has(r.tm)).map(r => ({'Kategorie': r.tm, 'Datum': r.d, 'Soupeř': r.o, 'Doma': r.h ? 'ano' : 'ne',
      'Skóre': r.s[0] + ':' + r.s[1], 'Střelci': Object.entries(r.g || {}).map(([n, c]) => n + (c > 1 ? ' ' + c + '×' : '')).join(', ')}))), 'Zápasy');
    XLSX.writeFile(wb, 'statistiky-' + Util.iso(new Date()) + '.xlsx');
    Settings.msg('✔ Excel stažen.', true);
  }
}


/* ---------------------------------------------------------------------
   Push – instalace do telefonu (service worker) a push notifikace mimo aplikaci
   Zapíná se v „Můj profil“. Veřejný klíč VAPID se bere ze serveru (settings.vapid_public); není-li nastaven,
   push se nenabízí. Odběr zařízení se ukládá do push_subscriptions (každý jen svůj).
   --------------------------------------------------------------------- */
class Push {
  static sw = null; static key = null; static on = false;
  static supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  static async init() {
    if (!('serviceWorker' in navigator) || location.protocol == 'file:') return;
    try {
      Push.sw = await navigator.serviceWorker.register('sw.js');
      navigator.serviceWorker.addEventListener('message', e => {
        const d = e.data && e.data.data; if (!d || !UI.user) return;
        if (d.tab && TABS[UI.user.r].some(t => t.id == d.tab)) { UI.tab = d.tab; if (d.sub) UI.chatSub = d.sub; UI.bell = false; App.render(); }
      });
      await Push.refresh();
    } catch (e) {}
  }
  static async refresh() {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      Push.on = !!sub && Notification.permission == 'granted';
    } catch (e) { Push.on = false; }
  }
  static b64(s) { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }

  /** Zapnutí upozornění na zařízení. inline = uvnitř karty v Nastavení (bez vlastního nadpisu a oddělovače). */
  static profileBlock(inline) {
    if (!Push.supported()) return `<div class="mut" style="margin-top:${inline ? 6 : 10}px">${inline ? '' : '🔔 '}Upozornění mimo aplikaci: tento prohlížeč je nepodporuje. Na iPhonu nejdřív přidejte aplikaci na plochu (Sdílet → Přidat na plochu).</div>`;
    const denied = Notification.permission == 'denied';
    return `<div style="${inline ? 'margin-top:4px' : 'margin-top:10px;border-top:1px solid var(--bd);padding-top:8px'}">${inline ? '' : '<b>🔔 Upozornění v telefonu</b>'}
      <div class="mut">${denied ? 'Upozornění máte v prohlížeči zakázaná – povolte je v nastavení webu.' : Push.on ? 'Na tomto zařízení jsou zapnutá.' : 'Dostávejte nové zprávy a události i když aplikace není otevřená.'}</div>
      ${denied ? '' : `<button class="btn ${Push.on ? '' : 'ok'}" type="button" style="width:100%;margin-top:6px" onclick="Push.toggle()">${Push.on ? 'Vypnout na tomto zařízení' : 'Zapnout upozornění'}</button>`}</div>`;
  }

  static say(t, ok) { UI.setMsg = t; UI.setOk = !!ok; Profile.msg(t, ok); }
  static async toggle() {
    try {
      const reg = await navigator.serviceWorker.ready, old = await reg.pushManager.getSubscription();
      if (old) {                                                    // vypnout
        await sb.from('push_subscriptions').delete().eq('endpoint', old.endpoint);
        await old.unsubscribe(); Push.on = false; return Push.say('Upozornění na tomto zařízení vypnuta.', true);
      }
      const { data: key } = await sb.rpc('push_public_key');
      if (!key) return Push.say('Upozornění zatím nejsou na serveru nastavena (správce musí doplnit klíč).');
      if (await Notification.requestPermission() != 'granted') { Push.on = false; return Push.say('Upozornění nebyla povolena.'); }
      const sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: Push.b64(key)}), j = sub.toJSON();
      const { error } = await sb.from('push_subscriptions').upsert({user_id: UI.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth}, {onConflict: 'endpoint'});
      if (error) throw error;
      Push.on = true; Push.say('✔ Upozornění zapnuta.', true);
      if (DB.prefs && DB.prefs.all === false) Settings.pref('all', true);   // dřív vypnutý hlavní přepínač by jinak upozornění dál blokoval
    } catch (e) { Push.say('⚠ ' + (e.message || e)); }
  }
}


/* ---------------------------------------------------------------------
   Import – hromadný import z Excelu (VEDENÍ / SPRÁVCE), dva oddělené importy s vlastní předlohou:
   1) HRÁČI:  Jméno hráče | Kategorie | Číslo dresu | Ročník   (hráč, který už v kategorii je, se přeskočí)
   2) RODIČE: Rodič | E-mail | Telefon | Heslo | Jméno hráče (dítě) | Kategorie   (dítě už musí být v soupisce)
      Rodič s e-mailem dostane účet (heslo se vygeneruje, není-li uvedeno) a přiřadí se mu dítě; existující účet se jen propojí.
      Sourozenci: jeden řádek na každé dítě se stejným e-mailem.
   --------------------------------------------------------------------- */
class Import {
  static COLS = {
    player: ['jmeno hrace', 'hrac', 'dite', 'jmeno ditete', 'jmeno a prijmeni hrace', 'hrac jmeno', 'jmeno a prijmeni', 'jmeno hrace (dite)', 'dite (jmeno hrace)'],
    team:   ['tym', 'kategorie'],
    no:     ['cislo', 'cislo dresu', 'dres'],
    year:   ['rocnik', 'rok narozeni'],
    pname:  ['rodic', 'jmeno rodice', 'rodic jmeno', 'zakonny zastupce'],
    email:  ['e-mail', 'email', 'e-mail rodice', 'email rodice', 'rodic e-mail', 'rodic email'],
    phone:  ['telefon', 'telefon rodice', 'rodic telefon', 'tel', 'mobil'],
    pass:   ['heslo', 'pocatecni heslo', 'heslo (volitelne)']
  };
  static MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  static view(kind) {
    const i = UI.imp && UI.imp.kind == kind ? UI.imp : null, P = kind == 'players';
    return `<div class="card"><b>${P ? '📥 Import hráčů z Excelu' : '👪 Import rodičů z Excelu'}</b>
      <div class="mut">${P
        ? 'Sloupce: <b>Jméno hráče, Kategorie, Číslo dresu, Ročník</b> (poslední dva jsou volitelné). Hráč, který už v kategorii je, se přeskočí.'
        : 'Sloupce: <b>Rodič, E-mail, Telefon, Heslo, Jméno hráče (dítě), Kategorie</b> (telefon a heslo jsou volitelné). Dítě už musí být v soupisce – nejdřív naimportujte hráče. Rodič s e-mailem dostane přihlašovací účet; u sourozenců dejte každé dítě na samostatný řádek se stejným e-mailem. Předloha už obsahuje vaši soupisku – stačí doplnit rodiče.'}</div>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="Import.template('${kind}')">⬇ Stáhnout předlohu</button>
        <label class="btn" style="cursor:pointer;text-align:center">📂 Vybrat soubor<input type="file" accept=".xlsx,.xls,.csv" hidden onchange="Import.read(this,'${kind}')"></label></div>
      ${i && !i.done ? Import.preview(i) : ''}${i && i.done ? Import.report(i) : ''}</div>`;
  }

  static preview(i) {
    const P = i.kind == 'players';
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px">
      <div><b>${i.rows.length}</b> řádků k importu · ${P ? `nových hráčů: <b>${i.newPlayers}</b> · už existují: <b>${i.existing}</b>` : `nových účtů rodičů: <b>${i.newAccounts}</b> · propojení s existujícím účtem: <b>${i.rows.length - i.newAccounts}</b>`}</div>
      ${i.errors.length ? `<div class="warn" style="margin-top:6px">⚠ Přeskočené řádky (${i.errors.length}):<br>${i.errors.slice(0, 12).map(esc).join('<br>')}${i.errors.length > 12 ? '<br>…' : ''}</div>` : ''}
      <div class="row" style="margin-top:8px"><button class="btn" onclick="Import.cancel()">Zrušit</button>
        <button class="btn ok" ${i.rows.length && !i.running ? '' : 'disabled'} onclick="Import.run()">${i.running ? 'Importuji… ' + i.progress : 'Provést import'}</button></div></div>`;
  }

  static report(i) {
    const d = i.done, P = i.kind == 'players';
    return `<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px">
      <div class="cg"><b>✔ Import dokončen</b></div>
      <div>${P ? `Nových hráčů: <b>${d.newPlayers}</b> · přeskočeno (už existují): <b>${d.skipped}</b>` : `Nových účtů rodičů: <b>${d.accounts}</b> · propojeno s existujícím účtem: <b>${d.linked}</b>`}</div>
      ${d.errors.length ? `<div class="warn" style="margin-top:6px">⚠ Chyby (${d.errors.length}):<br>${d.errors.slice(0, 12).map(esc).join('<br>')}</div>` : ''}
      ${d.creds.length ? `<div class="mut" style="margin-top:8px">Přístupové údaje nových účtů vidíte jen teď – stáhněte je a předejte rodičům. Po prvním přihlášení si rodič heslo změní.</div>
        <button class="btn ok" style="width:100%;margin-top:6px" onclick="Import.creds()">⬇ Stáhnout přístupy (Excel)</button>` : ''}
      <button class="btn" style="width:100%;margin-top:6px" onclick="Import.cancel()">Hotovo</button></div>`;
  }

  static cancel() { UI.imp = null; App.render(); }

  /** Předloha k vyplnění: hráči – ukázkový řádek; rodiče – soupiska s prázdnými sloupci pro rodiče. List „Návod“ vysvětluje sloupce. */
  static template(kind) {
    if (!window.XLSX) return alert('Knihovnu pro Excel se nepodařilo načíst.');
    const P = kind == 'players', wb = XLSX.utils.book_new();
    const head = P ? ['Jméno hráče', 'Kategorie', 'Číslo dresu', 'Ročník'] : ['Rodič', 'E-mail', 'Telefon', 'Heslo', 'Jméno hráče (dítě)', 'Kategorie'];
    let rows;
    if (P) rows = [['Adam Novák', CONFIG.planner.teams[0] || 'U9', 7, 2017]];
    else {
      rows = DB.members.slice().sort((a, b) => (a.t + a.full).localeCompare(b.t + b.full, 'cs')).map(m => ['', '', '', '', m.full || m.n, m.t]);
      if (!rows.length) rows = [['Petr Novák', 'petr@email.cz', '+420 777 111 222', '', 'Adam Novák', CONFIG.planner.teams[0] || 'U9']];
    }
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = (P ? [28, 12, 13, 9] : [24, 28, 18, 14, 28, 11]).map(w => ({wch: w}));
    XLSX.utils.book_append_sheet(wb, ws, P ? 'Hráči' : 'Rodiče');
    const help = P
      ? [['Návod'], ['Jméno hráče – jméno a příjmení (povinné)'], ['Kategorie – ' + CONFIG.planner.teams.join(', ') + ' (povinné)'], ['Číslo dresu, Ročník – nepovinné'], ['Ukázkový řádek před nahráním přepište nebo smažte.']]
      : [['Návod'], ['Rodič – jméno rodiče'], ['E-mail – povinný, slouží k přihlášení'], ['Telefon, Heslo – nepovinné (bez hesla se vygeneruje)'], ['Jméno hráče (dítě) a Kategorie – dítě musí být v soupisce'], ['Sourozenci: každé dítě na vlastním řádku se stejným e-mailem.'], ['Řádky bez rodiče a e-mailu se přeskočí.']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), 'Návod');
    XLSX.writeFile(wb, P ? 'predloha-import-hracu.xlsx' : 'predloha-import-rodicu.xlsx');
  }

  static pick(row, names) {
    const k = Object.keys(row).find(key => names.includes(Util.norm(key)));
    return k === undefined ? '' : String(row[k]).trim();
  }

  static read(input, kind) {
    const file = input.files[0]; if (!file) return;
    if (!window.XLSX) { UI.imp = null; return Admin.msg('⚠ Knihovnu pro Excel se nepodařilo načíst.'); }
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {type: 'array'}), raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: ''});
        UI.imp = Import.parse(raw, kind);
        UI.admMsg = '';
      } catch (x) { UI.imp = null; UI.admMsg = '⚠ Soubor se nepodařilo přečíst.'; UI.admOk = false; }
      App.render();
    };
    rd.readAsArrayBuffer(file);
    input.value = '';
  }

  static findKid(player, team) {
    return DB.members.filter(m => (Util.norm(m.full || '') == Util.norm(player) || Util.norm(m.n) == Util.norm(player)) && (!team || m.t == team));
  }

  /** Převede řádky z Excelu na seznam k importu + chyby + náhled počtů. */
  static parse(raw, kind) {
    const C = Import.COLS, rows = [], errors = [], P = (kind || 'players') == 'players', teams = CONFIG.planner.teams;
    const seen = new Set(), known = new Set(Object.values(DB.users).map(u => (u.email || '').toLowerCase()));
    let newPlayers = 0, existing = 0, newAccounts = 0;
    raw.forEach((r, idx) => {
      const n = idx + 2, player = Import.pick(r, C.player), team = Import.pick(r, C.team).toUpperCase();
      if (P) {
        if (!player && !team) return;                                           // prázdný řádek
        if (!player) return errors.push(`Řádek ${n}: chybí jméno hráče`);
        if (!teams.includes(team)) return errors.push(`Řádek ${n} (${player}): neznámá kategorie „${team || '—'}“ (existují: ${teams.join(', ')})`);
        const no = Import.pick(r, C.no), year = Import.pick(r, C.year);
        rows.push({n, player, team, no: no === '' || isNaN(+no) ? null : +no, year: year === '' || isNaN(+year) ? null : +year});
        const key = Util.norm(player) + '|' + team;
        if (DB.members.some(m => Util.norm(m.full || m.n) == Util.norm(player) && m.t == team) || seen.has(key)) existing++; else newPlayers++;
        seen.add(key);
        return;
      }
      const email = Import.pick(r, C.email).toLowerCase(), pname = Import.pick(r, C.pname), pass = Import.pick(r, C.pass);
      if (!email && !pname) return;                                             // řádek bez rodiče (např. jen soupiska z předlohy)
      if (!email) return errors.push(`Řádek ${n} (${pname}): chybí e-mail`);
      if (!Import.MAIL.test(email)) return errors.push(`Řádek ${n} (${pname || email}): neplatný e-mail „${email}“`);
      if (pass && pass.length < 8) return errors.push(`Řádek ${n} (${pname || email}): heslo musí mít aspoň 8 znaků`);
      if (!player) return errors.push(`Řádek ${n} (${pname || email}): chybí jméno hráče (dítěte)`);
      if (team && !teams.includes(team)) return errors.push(`Řádek ${n} (${player}): neznámá kategorie „${team}“`);
      const kids = Import.findKid(player, team);
      if (!kids.length) return errors.push(`Řádek ${n} (${player}): dítě není v soupisce${team ? ' kategorie ' + team : ''} – nejdřív naimportujte hráče`);
      if (kids.length > 1) return errors.push(`Řádek ${n} (${player}): v soupisce je víc hráčů s tímto jménem – doplňte kategorii`);
      rows.push({n, player: kids[0].full || kids[0].n, team: kids[0].t, mid: kids[0].id, pname, email, phone: Import.pick(r, C.phone), pass});
      if (!known.has(email) && !seen.has(email)) newAccounts++;
      seen.add(email);
    });
    return {kind: P ? 'players' : 'parents', rows, errors, newPlayers, existing, newAccounts, running: false, progress: '', done: null};
  }

  static genPass() {
    const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint32Array(10);
    crypto.getRandomValues(b); return [...b].map(x => a[x % a.length]).join('');
  }

  /** Založí hráče v databázi a přidá ho do paměti (stejně jako ruční přidání v Soupisce). */
  static async addPlayer(r) {
    const w = r.player.split(/\s+/);
    let n = w.length > 1 ? w[0] + ' ' + w.slice(1).join(' ')[0] + '.' : w[0];
    const row = {short_name: n, full_name: r.player, team: r.team, jersey_no: r.no, birth_year: r.year};
    let res = await sb.from('players').insert(row).select().single();
    for (let k = 2; res.error && res.error.code == '23505' && k < 12; k++) {          // krátké jméno už existuje → "Adam N. (2)"
      row.short_name = n + ' (' + k + ')'; res = await sb.from('players').insert(row).select().single();
    }
    if (res.error) throw new Error(res.error.message);
    const p = res.data, m = Model.fillProfile({id: p.id, n: p.short_name, t: p.team, a: [0, 0], p: DB.payItems.map(() => 0), vs: p.vs, full: p.full_name, no: p.jersey_no == null ? '' : p.jersey_no, by: p.birth_year == null ? '' : p.birth_year});
    DB.members.push(m); DB.docs[p.short_name] = 'wait';
    return m;
  }

  static async run() {
    const i = UI.imp; if (!i || i.running) return;
    i.running = true; i.progress = '0/' + i.rows.length; App.render();
    const out = {newPlayers: 0, skipped: 0, accounts: 0, linked: 0, errors: [], creds: []}, byEmail = {};
    Object.values(DB.users).forEach(u => { if (u.email) byEmail[u.email.toLowerCase()] = {id: u.id, r: u.r}; });
    for (let k = 0; k < i.rows.length; k++) {
      const r = i.rows[k];
      try {
        if (i.kind == 'players') {
          if (DB.members.some(x => Util.norm(x.full || x.n) == Util.norm(r.player) && x.t == r.team)) out.skipped++;
          else { await Import.addPlayer(r); out.newPlayers++; }
        } else {
          const m = Model.byId(r.mid); if (!m) throw new Error('dítě už v soupisce není');
          let u = byEmail[r.email];
          if (!u) {
            const pass = r.pass || Import.genPass();
            const res = await Sync.admin({action: 'create', name: r.pname || r.email.split('@')[0], email: r.email, password: pass, role: 'p', phone: r.phone, kids: [m.id]});
            byEmail[r.email] = {id: res.id, r: 'p'}; out.accounts++;
            out.creds.push({'Rodič': r.pname || r.email, 'E-mail (přihlášení)': r.email, 'Heslo': pass, 'Dítě': r.player, 'Kategorie': r.team});
          } else {
            if (u.r != 'p') throw new Error('e-mail patří účtu, který není rodič');
            const { error } = await sb.from('parent_players').upsert({parent_id: u.id, player_id: m.id}, {onConflict: 'parent_id,player_id'});
            if (error) throw new Error(error.message);
            out.linked++;
            const c = out.creds.find(x => x['E-mail (přihlášení)'] == r.email); if (c) c['Dítě'] += ', ' + r.player;
          }
          // kontakt na rodiče do karty hráče (pokud tam ještě není)
          if (!m.par.some(q => (q.em || '').toLowerCase() == r.email)) {
            const empty = m.par.length == 1 && !m.par[0].n && !m.par[0].ph && !m.par[0].em;
            const par = (empty ? [] : m.par).concat([{n: r.pname, ph: r.phone, em: r.email}]); m.par = par;
            await sb.from('players').update({parents: par}).eq('id', m.id);
          }
        }
      } catch (e) { out.errors.push(`Řádek ${r.n} (${r.player}): ${e.message || e}`); }
      i.progress = (k + 1) + '/' + i.rows.length; if ((k + 1) % 5 == 0) App.render();
    }
    await Sync.loaders.players(); await Sync.loaders.people();
    i.running = false; i.done = out; App.render();
  }

  static creds() {
    const d = UI.imp && UI.imp.done; if (!d || !window.XLSX) return;
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.creds), 'Přístupy');
    XLSX.writeFile(wb, 'pristupy-rodicu-' + Util.iso(new Date()) + '.xlsx');
  }
}
