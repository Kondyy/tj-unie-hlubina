/* TJ Unie Hlubina – 4/5 doplňky: místa, počasí, spolujízda, plán tréninku, turnaje, zástup, offline… */
/* =====================================================================
   8b. DOPLŇKY – místa a navigace, počasí, co s sebou, spolujízda,
       plán tréninku, turnaje, zástup trenéra, měsíční výkaz, deník s připomínkami, šablony zpráv,
       docházka bez internetu, offline režim, hlášení chyb, využití tarifu, ochrana přihlášení
   ===================================================================== */

/* ---------------------------------------------------------------------
   Venues – místa s adresou (hřiště, hala, hřiště soupeřů) a odkazy na navigaci
   --------------------------------------------------------------------- */
class Venues {
  static list()   { return DB.venues && DB.venues.length ? DB.venues : CONFIG.venues.map(n => ({name: n, address: ''})); }
  static names()  { return Venues.list().map(v => v.name); }
  static find(n)  { return Venues.list().find(v => v.name == n); }
  /** Cíl navigace: uložená adresa, jinak název místa (+ Ostrava u domácích hřišť). */
  static target(n) { const v = Venues.find(n); return (v && v.address) || (CONFIG.venues.includes(n) ? CLUB + ', ' + n : n); }
  static navLinks(n) {
    if (!n) return '';
    const t = encodeURIComponent(Venues.target(n));
    return `<div class="row" style="margin-top:8px"><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${t}">🧭 Navigovat</a>
      <a class="btn" target="_blank" rel="noopener" href="https://mapy.com/fnc/v1/search?query=${t}">🗺 Mapy.com</a></div>`;
  }
  /** Výběr místa ve formuláři; poslední volba „Nové místo…“ založí místo s adresou. */
  static select(id) {
    return `<select id="${id}" onchange="if(this.value=='__new')Venues.add(this)">${Venues.names().map(v => `<option>${esc(v)}</option>`).join('')}<option value="__new">➕ Nové místo…</option></select>`;
  }
  static async add(sel) {
    const name = (prompt('Název místa (např. Hřiště Vítkovice):') || '').trim().slice(0, 80);
    if (!name) { sel.value = Venues.names()[0]; return; }
    const address = (prompt('Adresa pro navigaci (ulice, město) – nepovinné:') || '').trim().slice(0, 200);
    const r = await Sync.write('Místo se nepodařilo uložit', sb.from('venues').upsert({name, address}, {onConflict: 'name'}));
    if (r) await Sync.loaders.venues();
    UI.skipKeep = [sel.id]; App.render();
    const s = $('#' + sel.id); if (s) s.value = r ? name : Venues.names()[0];
  }
  /** Správa: adresy míst. */
  static adminCard() {
    return `<div class="card"><b>📍 Místa a adresy</b><div class="mut">Adresa se použije pro tlačítko „Navigovat“ u zápasů. Trenéři můžou přidat nové místo přímo při zakládání zápasu.</div>
      ${Venues.list().map(v => `<div class="row" style="margin-top:6px;align-items:center"><b style="flex:0 0 34%">${esc(v.name)}</b>
        <input id="vn-${v.id}" value="${esc(v.address)}" placeholder="Adresa" autocomplete="off">
        ${v.id ? `<button class="btn" style="flex:none" onclick="Venues.save(${v.id})">Uložit</button><button class="chip" style="flex:none;color:var(--r)" onclick="Venues.del(${v.id})">🗑</button>` : ''}</div>`).join('')}
      <div class="row" style="margin-top:10px"><input id="vn-new-n" placeholder="Nové místo" autocomplete="off"><input id="vn-new-a" placeholder="Adresa" autocomplete="off"><button class="btn" style="flex:none" onclick="Venues.create()">+ Přidat</button></div></div>`;
  }
  static async save(id) {
    const address = ($('#vn-' + id).value || '').trim().slice(0, 200);
    if (await Sync.write('Adresu se nepodařilo uložit', sb.from('venues').update({address}).eq('id', id))) { await Sync.loaders.venues(); Admin.msg('✔ Adresa uložena.', true); }
  }
  static async create() {
    const name = ($('#vn-new-n').value || '').trim().slice(0, 80), address = ($('#vn-new-a').value || '').trim().slice(0, 200);
    if (!name) return Admin.msg('⚠ Zadejte název místa.');
    if (await Sync.write('Místo se nepodařilo přidat', sb.from('venues').insert({name, address}))) { await Sync.loaders.venues(); UI.skipKeep = ['vn-new-n', 'vn-new-a']; Admin.msg('✔ Místo přidáno.', true); }
  }
  static async del(id) {
    if (!confirm('Smazat místo? Už založené akce si název ponechají.')) return;
    if (await Sync.write('Místo se nepodařilo smazat', sb.from('venues').delete().eq('id', id))) { await Sync.loaders.venues(); Admin.msg('✔ Místo smazáno.', true); }
  }
}


/* ---------------------------------------------------------------------
   Weather – předpověď počasí u akce (Open-Meteo, zdarma a bez klíče), jen na domácích hřištích a 0–3 dny dopředu
   --------------------------------------------------------------------- */
class Weather {
  static data = null; static busy = false;
  static coords() { return [+DB.settings.weather_lat || 49.8246, +DB.settings.weather_lon || 18.2716]; }   // výchozí: Gajdošova, Ostrava
  static load() {
    if (Weather.data || Weather.busy) return;
    Weather.busy = true;
    try { const c = JSON.parse(sessionStorage.getItem('unie-wx') || 'null'); if (c && Date.now() - c.t < 3 * 36e5) { Weather.data = c.d; return; } } catch (e) {}
    const [la, lo] = Weather.coords();
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FPrague&forecast_days=7`)
      .then(r => r.json()).then(d => {
        if (!d || !d.hourly) return;
        Weather.data = d.hourly;
        try { sessionStorage.setItem('unie-wx', JSON.stringify({t: Date.now(), d: d.hourly})); } catch (e) {}
        App.refresh();
      }).catch(() => {});
  }
  static icon(c) { return c == 0 ? '☀️' : c <= 2 ? '🌤' : c == 3 ? '☁️' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '🌨' : c <= 82 ? '🌦' : c <= 86 ? '🌨' : '⛈'; }
  static line(e) {
    if (e.x || !CONFIG.venues.includes(e.pl)) return '';                // předpověď je pro hřiště klubu
    const day = Util.dayDate(e.d), diff = Math.round((day - new Date().setHours(0, 0, 0, 0)) / 864e5);
    if (diff < 0 || diff > 3) return '';
    Weather.load();
    const h = Weather.data; if (!h || !h.time) return '';
    const i = h.time.indexOf(Util.iso(day) + 'T' + String(parseInt(e.t) || 16).padStart(2, '0') + ':00');
    if (i < 0) return '';
    const p = h.precipitation_probability[i], t = Math.round(h.temperature_2m[i]);
    return `<div class="mut" style="margin-top:4px">${Weather.icon(h.weather_code[i])} ${t} °C · srážky ${p} %${p >= 60 ? ' · ☔ vezměte bundu do deště' : ''}${t <= 8 ? ' · 🧤 teplé oblečení' : ''}</div>`;
  }
}


/* ---------------------------------------------------------------------
   Bring – co s sebou: trenér napíše seznam, rodič si ho u akce odškrtává (pamatuje si to telefon)
   --------------------------------------------------------------------- */
class Bring {
  static DEF = 'Kopačky, chrániče, láhev s pitím, mikina';
  static items(e) { return String(e.br || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean); }
  static got(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
  static parent(e) {
    const L = Bring.items(e); if (!L.length || e.x) return '';
    const k = 'unie-br-' + e.id + '-' + UI.kid, on = Bring.got(k);
    return `<div style="margin-top:8px"><b>🎒 S sebou</b> <span class="mut">(${L.filter(x => on[x]).length}/${L.length} sbaleno)</span>
      <div class="row" style="margin-top:4px">${L.map(x => `<button class="chip ${on[x] ? 'on' : ''}" onclick="Bring.tick('${Util.q(k)}','${Util.q(x)}')">${on[x] ? '✔ ' : ''}${esc(x)}</button>`).join('')}</div></div>`;
  }
  static tick(k, x) { const on = Bring.got(k); on[x] = !on[x]; try { localStorage.setItem(k, JSON.stringify(on)); } catch (e) {} App.render(); }
  static coach(e) {
    return `<div class="card" style="margin-top:10px"><b>🎒 Co s sebou</b><div class="mut">Rodiče uvidí seznam u akce a můžou si věci odškrtávat. Položky oddělte čárkou.</div>
      <div class="row" style="margin-top:6px"><input id="br-${e.id}" value="${esc(e.br || '')}" placeholder="${esc(Bring.DEF)}" autocomplete="off"><button class="btn" style="flex:none" onclick="Bring.save(${e.id})">Uložit</button></div>
      ${e.br ? '' : `<button class="chip" style="margin-top:6px" onclick="$('#br-${e.id}').value=Bring.DEF">Vložit výchozí seznam</button>`}</div>`;
  }
  static async save(id) {
    const e = Model.event(id), v = ($('#br-' + id).value || '').trim().slice(0, 300);
    if (await Sync.write('Seznam se nepodařilo uložit', sb.from('events').update({bring: v}).eq('id', id))) { e.br = v; Sync.toast('✔ Seznam uložen.', true); }
  }
}


/* ---------------------------------------------------------------------
   Carpool – kdo u zápasu nabízí místa v autě a kdo hledá odvoz; rodiče si můžou napsat soukromou zprávu
   --------------------------------------------------------------------- */
class Carpool {
  static list(e) {
    if (e.k != 'z' || e.x) return '';
    const L = DB.cpool[e.id];
    if (L === undefined) { DB.cpool[e.id] = null; Carpool.load(e.id); return ''; }
    if (!L || !L.length) return '';
    const me = UI.user.id, off = L.filter(x => x.carpool[0] == 'o'), need = L.filter(x => x.carpool == 's');
    const who = x => `${esc(x.parent_name || 'Rodič')} <span class="mut">(${esc(x.kid)})</span>${x.parent_id != me && UI.user.r == 'p' ? ` <button class="chip" onclick="Carpool.write('${x.parent_id}','${Util.q(x.parent_name || 'Rodič')}')">✉ Napsat</button>` : ''}`;
    const seats = n => n + (n == 1 ? ' místo' : ' místa');
    return `<div style="margin-top:8px"><b>🚗 Spolujízda</b>
      ${off.length ? `<div class="mut" style="margin-top:4px">Nabízí místa v autě:</div>${off.map(x => `<div class="pl"><span>${who(x)}</span><span class="pill ok">${seats(+x.carpool.slice(1))}</span></div>`).join('')}` : ''}
      ${need.length ? `<div class="mut" style="margin-top:4px">Hledá odvoz:</div>${need.map(x => `<div class="pl"><span>${who(x)}</span><span class="pill wa" style="white-space:nowrap">hledá</span></div>`).join('')}` : ''}</div>`;
  }
  static async load(id) {
    try { const r = await sb.rpc('event_carpool', {eid: +id}); DB.cpool[id] = r.error ? [] : r.data || []; } catch (e) { DB.cpool[id] = []; }
    (DB.cpool[id] || []).forEach(x => { if (x.parent_id != Sync.me) DB.cpPeers[x.parent_id] = x.parent_name || 'Rodič'; });
    App.refresh();
  }
  static write(pid, name) { DB.cpPeers[pid] = name; UI.tab = 'chat'; UI.chatSub = 'dm'; UI.dmWith = pid; UI.focusChat = true; App.render(); }
}


/* ---------------------------------------------------------------------
   TPlan – plán (náplň) konkrétního tréninku + šablony plánů trenérů kategorie
   --------------------------------------------------------------------- */
class TPlan {
  static tpls() { return (DB.ttpl || []).filter(t => t.team == UI.user.team); }
  static card(e) {
    const T = TPlan.tpls();
    return `<div class="card" style="margin-top:10px"><b>📋 Plán tréninku</b><div class="mut">Vidí ho trenéři kategorie a případný zástup.</div>
      <textarea id="tp-${e.id}" rows="5" style="margin-top:6px" placeholder="Rozcvička 10 min&#10;Přihrávky ve dvojicích 15 min&#10;Hra 4+1 20 min">${esc(DB.eplans[e.id] || '')}</textarea>
      <div class="row" style="margin-top:6px"><button class="btn ok" onclick="TPlan.save(${e.id})">Uložit plán</button><button class="btn" onclick="TPlan.saveTpl(${e.id})">⭐ Uložit jako šablonu</button></div>
      ${T.length ? `<div class="mut" style="margin-top:8px">Šablony (klepnutím vložíte do plánu):</div><div class="row" style="gap:4px">${T.map(t => `<span style="display:inline-flex;gap:2px;flex:none"><button class="chip" onclick="TPlan.use(${e.id},${t.id})">${esc(t.name)}</button><button class="chip" title="Smazat šablonu" onclick="TPlan.delTpl(${t.id})">✕</button></span>`).join('')}</div>` : ''}</div>`;
  }
  static async save(id) {
    const body = ($('#tp-' + id).value || '').slice(0, 4000);
    if (await Sync.write('Plán se nepodařilo uložit', sb.from('event_plans').upsert({event_id: +id, body, updated_at: new Date().toISOString()}, {onConflict: 'event_id'}))) { DB.eplans[id] = body; Sync.toast('✔ Plán uložen.', true); }
  }
  static use(id, tid) { const t = TPlan.tpls().find(x => x.id == tid), a = $('#tp-' + id); if (t && a) a.value = a.value.trim() ? a.value.trim() + '\n' + t.body : t.body; }
  static async saveTpl(id) {
    const body = ($('#tp-' + id).value || '').trim(); if (!body) return alert('Nejdřív napište plán.');
    const name = (prompt('Název šablony (např. Přihrávky + hra):') || '').trim().slice(0, 80); if (!name) return;
    const r = await Sync.write('Šablonu se nepodařilo uložit', sb.from('training_templates').insert({team: UI.user.team, name, body}).select().single());
    if (r) { DB.ttpl.push({id: r.data.id, team: r.data.team, name, body}); App.render(); }
  }
  static async delTpl(tid) {
    if (!confirm('Smazat šablonu?')) return;
    if (await Sync.write('Šablonu se nepodařilo smazat', sb.from('training_templates').delete().eq('id', tid))) { DB.ttpl = DB.ttpl.filter(t => t.id != tid); App.render(); }
  }
}


/* ---------------------------------------------------------------------
   Tour – turnaj: jedna akce (zápas označený jako turnaj), u ní víc utkání, souhrn a umístění
   --------------------------------------------------------------------- */
class Tour {
  static games(e) { return DB.results.filter(r => r.eid == e.id).slice().reverse(); }
  static stats(G) {
    const w = G.filter(r => r.s[0] > r.s[1]).length, d = G.filter(r => r.s[0] == r.s[1]).length, sc = {};
    G.forEach(r => Object.entries(r.g || {}).forEach(([n, c]) => sc[n] = (sc[n] || 0) + c));
    return {w, d, l: G.length - w - d, gf: G.reduce((a, r) => a + r.s[0], 0), ga: G.reduce((a, r) => a + r.s[1], 0), sc};
  }
  static summary(e) {
    const G = Tour.games(e); if (!G.length && !e.rank) return '';
    const s = Tour.stats(G), kid = UI.user.r == 'p' ? UI.kid : '';
    return `<div style="margin-top:8px"><b>🏅 Výsledky turnaje</b>${e.rank ? ` <span class="pill ok">${esc(e.rank)}. místo</span>` : ''}
      <div class="mut">${G.length} utkání · ${s.w}V ${s.d}R ${s.l}P · skóre ${s.gf}:${s.ga}${kid && s.sc[kid] ? ` · ⚽ ${esc(kid)} ${s.sc[kid]}×` : ''}</div>
      ${G.map(r => `<div class="pay" style="margin-top:4px"><span>vs. ${esc(r.o)}</span><span class="pill ${r.s[0] > r.s[1] ? 'ok' : r.s[0] == r.s[1] ? 'wa' : 'no'}">${r.s[0]}:${r.s[1]}</span></div>`).join('')}</div>`;
  }
  static box(e) {
    const G = Tour.games(e), s = Tour.stats(G);
    return `<div class="card" style="margin-top:10px"><div class="pay"><b>🏅 Turnaj: ${esc(e.o)}</b>${e.rank ? `<span class="pill ok">${esc(e.rank)}. místo</span>` : ''}</div>
      <div class="mut">${G.length} utkání · ${s.w}V ${s.d}R ${s.l}P · skóre ${s.gf}:${s.ga}</div>
      ${G.map(r => `<div class="pay" style="margin-top:6px"><span>vs. ${esc(r.o)}</span><span class="pill ${r.s[0] > r.s[1] ? 'ok' : r.s[0] == r.s[1] ? 'wa' : 'no'}">${r.s[0]}:${r.s[1]}</span></div>`).join('')}
      ${Object.keys(s.sc).length ? `<div class="mut" style="margin-top:6px">⚽ Střelci: ${Object.entries(s.sc).sort((a, b) => b[1] - a[1]).map(([n, c]) => esc(n) + ' ' + c).join(', ')}</div>` : ''}
      <button class="btn" style="width:100%;margin-top:8px" onclick="Events.toggleResult('${e.id}')">+ Zapsat utkání</button>
      <div class="row" style="margin-top:8px"><input id="tr-rank-${e.id}" type="number" min="1" max="99" placeholder="Konečné umístění (např. 2)" value="${esc(e.rank || '')}"><button class="btn" style="flex:none" onclick="Tour.saveRank(${e.id})">Uložit umístění</button></div></div>`;
  }
  static async saveRank(id) {
    const e = Model.event(id), v = String(parseInt($('#tr-rank-' + id).value) || '');
    if (!await Sync.write('Umístění se nepodařilo uložit', sb.from('events').update({placement: v}).eq('id', id))) return;
    e.rank = v; App.render();
    if (v && confirm('Poslat rodičům kategorie upozornění na umístění?')) Notifs.send('P', `🏅 Turnaj ${e.o} (${e.tm}): ${v}. místo`, {team: e.tm, tab: 'cal'});
  }
}


/* ---------------------------------------------------------------------
   SubCoach – zástup: trenér vybere kolegu, který ho na akci zastoupí (i z jiné kategorie).
   Zastupující akci uvidí, dostane upozornění, zapíše docházku a vidí plán tréninku.
   --------------------------------------------------------------------- */
class SubCoach {
  static coaches() { return Dm.contacts().filter(c => (c.role == 'c' || c.role == 'a') && c.id != UI.user.id); }
  static card(e) {
    if (e.x) return '';
    const L = SubCoach.coaches();
    return `<div class="card" style="margin-top:10px"><b>🙋 Zástup</b><div class="mut">Nemůžete přijít? Vyberte trenéra, který vás zastoupí. Dostane upozornění, uvidí akci, plán a zapíše docházku.</div>
      <select id="sc-${e.id}" onchange="SubCoach.set(${e.id},this.value)"><option value="">— bez zástupu —</option>${L.map(c => `<option value="${c.id}" ${c.id == e.sc ? 'selected' : ''}>${esc(c.name)}${c.team ? ' (' + esc(c.team) + ')' : ''}</option>`).join('')}</select></div>`;
  }
  static async set(id, uid) {
    const e = Model.event(id), c = SubCoach.coaches().find(x => x.id == uid), coach = c ? c.name : UI.user.name;
    if (!await Sync.write('Zástup se nepodařilo uložit', sb.from('events').update({sub_coach: uid || null, coach}).eq('id', id))) return;
    e.sc = uid || null; e.c = coach;
    UI.skipKeep = ['sc-' + id]; Sync.toast(c ? '✔ ' + c.name + ' dostal(a) upozornění.' : '✔ Zástup zrušen.', true);
  }
  /** Akce jiných kategorií, na kterých přihlášený trenér zastupuje. */
  static list() {
    const L = DB.events.filter(e => e.sc == UI.user.id && e.tm != UI.user.team && !e.x);
    if (!L.length) return '';
    return `<h2>🙋 Zastupuji</h2><div class="g2">${L.map(e => `<div class="card ev ${e.k}" style="cursor:pointer" onclick="SubCoach.open(${e.id})">
      <div class="pay"><b>${e.k == 'z' ? '🏆 ' + esc(e.o) : '⚽ Trénink'} · ${esc(e.tm)}</b><span class="pill z">${Util.date(e.d)}</span></div><div class="mut">${esc(e.t)} · 📍 ${esc(e.pl)}</div></div>`).join('')}</div>`;
  }
  static open(id)  { UI.subEvent = id; DB.subPl = null; SubCoach.load(id); App.render(); }
  static close()   { UI.subEvent = 0; App.render(); }
  static async load(id) { const r = await sb.rpc('sub_event_players', {eid: +id}); DB.subPl = r.error ? [] : r.data || []; App.render(); }
  static detail(e) {
    const L = DB.subPl;
    return `<button class="btn" onclick="SubCoach.close()">← Tréninky</button><h2>🙋 Zástup ${esc(e.tm)} · ${Util.date(e.d)} · ${esc(e.t)}</h2>
      <div class="card ev ${e.k}"><div class="mut">📍 ${esc(e.pl)}${e.m ? ' · 🤝 Sraz: ' + esc(e.m) : ''}</div>${Weather.line(e)}</div>
      ${DB.eplans[e.id] ? `<div class="card"><b>📋 Plán tréninku</b><div style="white-space:pre-wrap;margin-top:6px">${esc(DB.eplans[e.id])}</div></div>` : ''}
      ${L == null ? '<div class="card mut">Načítám hráče…</div>' : `<div class="g2">${L.map(p => `<div class="card"><b>${esc(p.full_name || p.short_name)}</b>
         <div class="mut">${p.response == 'y' ? '✔ potvrdil účast' : p.response == 'n' ? '✖ omluven' + (p.reason ? ' – ' + esc(p.reason) : '') : '⏳ bez odpovědi'}</div>
         <div class="row" style="margin-top:6px">${CONFIG.attStates.map(([c, l, k]) => `<button class="btn ${p.state == c ? k : ''}" onclick="SubCoach.mark(${e.id},'${p.id}','${c}')">${l}</button>`).join('')}</div></div>`).join('') || '<div class="card mut">Kategorie nemá hráče.</div>'}</div>`}`;
  }
  static async mark(eid, pid, st) {
    const p = (DB.subPl || []).find(x => x.id == pid); if (p) p.state = st; App.render();
    const r = await sb.rpc('sub_mark', {eid: +eid, pid, st});
    if (r.error) { Sync.toast('Docházku se nepodařilo uložit: ' + r.error.message); SubCoach.load(eid); }
  }
}


/* ---------------------------------------------------------------------
   Report – měsíční výkaz trenéra (tréninky a zápasy s potvrzenou účastí, odhad hodin) + export do Excelu
   --------------------------------------------------------------------- */
class Report {
  static T = 90; static Z = 120;                                       // délka tréninku / zápasu v minutách pro výpočet hodin
  static MONTHS = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];
  static label(x) { const [y, m] = x.split('-'); return Report.MONTHS[m - 1] + ' ' + y; }
  static months() { const d = new Date(), L = []; for (let i = 0; i < 12; i++) L.push(Util.iso(new Date(d.getFullYear(), d.getMonth() - i, 1)).slice(0, 7)); return L; }
  static coaches() {
    const u = UI.user;
    return Model.mgmt(u) ? Object.values(DB.users).filter(x => x.r == 'c' || (x.r == 'a' && x.id == u.id)).sort((a, b) => (a.team || '').localeCompare(b.team || '') || a.name.localeCompare(b.name, 'cs')) : [u];
  }
  static row(c, m) {
    let t = 0, z = 0; const days = [];
    Object.keys(DB.coachAtt).forEach(k => {
      if (!k.startsWith(c.id + '|') || DB.coachAtt[k] != 'y') return;
      const ev = DB.coachEv[k] || {}; if (!String(ev.d || '').startsWith(m)) return;
      if (ev.k == 'z') z++; else t++;
      days.push(ev.d + ' ' + (ev.k == 'z' ? 'zápas' : 'trénink'));
    });
    return {name: c.name, team: c.team || '', t, z, h: Math.round((t * Report.T + z * Report.Z) / 6) / 10, days: days.sort()};
  }
  static card() {
    const u = UI.user; if (!(Model.coachLike(u) || Model.mgmt(u))) return '';
    const m = UI.repMonth || Report.months()[0], rows = Report.coaches().map(c => Report.row(c, m));
    return `<div class="card"><b>🧾 Měsíční výkaz trenéra</b>
      <div class="mut">Tréninky a zápasy, u kterých trenér potvrdil „Zúčastním se“. Hodiny: trénink ${Report.T} min, zápas ${Report.Z} min.</div>
      <select style="margin-top:6px" onchange="UI.repMonth=this.value;App.render()">${Report.months().map(x => `<option value="${x}" ${x == m ? 'selected' : ''}>${Report.label(x)}</option>`).join('')}</select>
      ${rows.map(r => `<div class="pl"><span><b>${esc(r.name)}</b> <span class="mut">${esc(r.team)}</span></span><span>${r.t} tr. · ${r.z} záp. · <b>${String(r.h).replace('.', ',')} h</b></span></div>`).join('') || '<div class="mut">Žádní trenéři.</div>'}
      <button class="btn" style="width:100%;margin-top:8px" onclick="Report.export()">⬇ Výkaz do Excelu</button></div>`;
  }
  static export() {
    if (!window.XLSX) return Settings.msg('⚠ Knihovnu pro Excel se nepodařilo načíst.');
    const m = UI.repMonth || Report.months()[0], rows = Report.coaches().map(c => Report.row(c, m)), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({'Trenér': r.name, 'Kategorie': r.team, 'Tréninky': r.t, 'Zápasy': r.z, 'Hodiny': r.h}))), 'Souhrn');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.flatMap(r => r.days.map(d => ({'Trenér': r.name, 'Datum': d.slice(0, 10), 'Akce': d.slice(11)})))), 'Akce');
    XLSX.writeFile(wb, 'vykaz-treneru-' + m + '.xlsx');
    Settings.msg('✔ Výkaz stažen.', true);
  }
}


/* ---------------------------------------------------------------------
   Progress – vývoj hráče pro rodiče: docházka po měsících, zápasy a góly, poznámky, které trenér zpřístupnil
   --------------------------------------------------------------------- */
class Progress {
  static months(m) {
    const by = {};
    DB.pastT.filter(e => e.tm == m.t).forEach(e => {
      const s = DB.att[e.id + '|' + m.n]; if (!s) return;                // počítají se jen tréninky se zapsanou docházkou
      const k = e.d.slice(0, 7), o = by[k] = by[k] || {p: 0, t: 0}; o.t++; if (s == 'P') o.p++;
    });
    return Object.keys(by).sort().slice(-6).map(k => ({k, ...by[k], pct: Math.round(by[k].p / by[k].t * 100)}));
  }
  static card(m) {
    const M = Progress.months(m), N = (DB.notes[m.n] || []).filter(n => n.sh).slice().reverse();
    return `<div class="card"><b>📈 Vývoj</b>
      ${M.length ? `<div class="mut" style="margin-top:4px">Docházka na tréninky po měsících</div>${M.map(x => `<div class="pay" style="margin-top:6px"><span>${Report.label(x.k)}</span><b class="${Util.attCls(x.pct)}">${x.pct} % <span class="mut">(${x.p}/${x.t})</span></b></div>
        <div class="bar"><i style="width:${Math.max(x.pct, 2)}%;background:${Util.attBg(x.pct)}"></i></div>`).join('')}` : '<div class="mut" style="margin-top:4px">Docházka po měsících se ukáže, jakmile trenér zapíše první tréninky.</div>'}
      <div class="row" style="margin-top:10px"><div class="card stat"><b>${m.mp}</b><span class="mut">Zápasy</span></div><div class="card stat"><b>${m.gl}</b><span class="mut">Góly</span></div>
        <div class="card stat"><b>${m.mp ? (m.gl / m.mp).toFixed(1).replace('.', ',') : '0'}</b><span class="mut">Gólů na zápas</span></div></div>
      ${N.length ? `<div style="margin-top:10px"><b>💬 Od trenéra</b>${N.map(n => `<div class="pl"><span>${CONFIG.noteTags[n.g].slice(0, 2)} ${esc(n.x)}</span><span class="mut">${esc(n.d)}</span></div>`).join('')}</div>` : ''}</div>`;
  }
}


/* ---------------------------------------------------------------------
   KidEdit – rodič sám upraví kontakty a zdravotní údaje dítěte (trenéři dostanou upozornění)
   --------------------------------------------------------------------- */
class KidEdit {
  static card(m) {
    if (!UI.kidEdit) return `<div class="card"><div class="pay"><b>📇 Kontakty a zdraví</b><button class="chip" style="flex:none" onclick="UI.kidEdit=true;App.render()">✏️ Upravit</button></div>
      ${(m.par || []).filter(p => p.n || p.ph || p.em).map(p => `<div class="pl"><span>${esc(p.n || 'Rodič')}</span><span class="mut">${esc([p.ph, p.em].filter(Boolean).join(' · '))}</span></div>`).join('') || '<div class="mut">Kontakty nejsou vyplněné.</div>'}
      <div class="pl"><span class="mut">Alergie</span><b>${esc(m.al || '—')}</b></div><div class="pl"><span class="mut">Zdravotní omezení</span><b>${esc(m.lim || '—')}</b></div></div>`;
    const P = (m.par || []).slice(0, 3); while (P.length < 2) P.push({n: '', ph: '', em: ''});
    return `<div class="card"><b>📇 Kontakty a zdraví</b><div class="mut">Uvidí je trenéři kategorie (kvůli bezpečí dítěte na trénincích).</div>
      ${P.map((p, i) => `<div style="margin-top:8px"><b class="mut">Kontakt ${i + 1}</b><input id="ke-n-${i}" value="${esc(p.n)}" placeholder="Jméno (např. Jana Nováková – máma)" autocomplete="off">
        <div class="row"><input id="ke-ph-${i}" type="tel" value="${esc(p.ph)}" placeholder="Telefon" autocomplete="off"><input id="ke-em-${i}" type="email" value="${esc(p.em)}" placeholder="E-mail" autocomplete="off"></div></div>`).join('')}
      <label class="mut" style="margin-top:8px">Alergie<input id="ke-al" value="${esc(m.al || '')}" placeholder="např. pyl, ořechy" autocomplete="off"></label>
      <label class="mut">Zdravotní omezení<input id="ke-lim" value="${esc(m.lim || '')}" placeholder="např. astma – inhalátor v tašce" autocomplete="off"></label>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="UI.kidEdit=false;App.render()">Zrušit</button><button class="btn ok" onclick="KidEdit.save('${m.id}',${P.length})">Uložit</button></div></div>`;
  }
  static async save(id, n) {
    const m = Model.byId(id), v = k => ($('#' + k).value || '').trim();
    const par = [...Array(n).keys()].map(i => ({n: v('ke-n-' + i), ph: v('ke-ph-' + i), em: v('ke-em-' + i)})).filter((p, i) => i == 0 || p.n || p.ph || p.em);
    const r = await sb.rpc('parent_update_kid', {pid: id, p_parents: par, p_allergies: v('ke-al'), p_limitations: v('ke-lim')});
    if (r.error) return Sync.toast('Údaje se nepodařilo uložit: ' + r.error.message);
    Object.assign(m, {par, al: v('ke-al'), lim: v('ke-lim')}); UI.kidEdit = false;
    Sync.toast('✔ Uloženo. Trenéři dostali upozornění.', true); App.render();
  }
}


/* ---------------------------------------------------------------------
   Tpl – šablony rychlých zpráv (chat a soukromé zprávy); každý si je upraví v Nastavení
   --------------------------------------------------------------------- */
class Tpl {
  static DEF = {p: ['Dnes dorazíme o pár minut později.', 'Dnes nemůžeme, omlouváme se.', 'Děkujeme!', 'Můžu prosím poprosit o odvoz?'],
                c: ['Trénink proběhne podle plánu.', 'Prosím o potvrzení účasti v aplikaci.', 'Dnes trénink končí o 15 minut dřív.', 'Děkuji všem za účast!']};
  static list() { return DB.tpls && DB.tpls.length ? DB.tpls : Tpl.DEF[UI.user.r == 'p' ? 'p' : 'c']; }
  static chips() { return `<div class="row" style="margin-top:6px;gap:4px">${Tpl.list().map((t, i) => `<button class="chip" style="flex:none" onclick="Tpl.use(${i})">${esc(t.length > 30 ? t.slice(0, 30) + '…' : t)}</button>`).join('')}</div>`; }
  static use(i) { const t = Tpl.list()[i], a = $('#chat-input'); if (a && t) { a.value = a.value.trim() ? a.value.trim() + ' ' + t : t; a.focus(); } }
  static card() {
    return `<div class="card"><b>⚡ Rychlé zprávy</b><div class="mut">Hotové věty pod polem pro zprávu v chatu (klepnutím je vložíte). Jedna věta na řádek.</div>
      <textarea id="tpl-edit" rows="4" style="margin-top:6px">${esc(Tpl.list().join('\n'))}</textarea>
      <button class="btn ok" style="width:100%;margin-top:6px" onclick="Tpl.save()">Uložit rychlé zprávy</button></div>`;
  }
  static async save() {
    const L = ($('#tpl-edit').value || '').split('\n').map(s => s.trim().slice(0, 200)).filter(Boolean).slice(0, 12);
    const r = await sb.from('user_prefs').upsert({user_id: UI.user.id, templates: L}, {onConflict: 'user_id'});
    if (r.error) return Settings.msg('⚠ Rychlé zprávy se nepodařilo uložit.');
    DB.tpls = L; UI.skipKeep = ['tpl-edit']; Settings.msg('✔ Rychlé zprávy uloženy.', true);
  }
}


/* ---------------------------------------------------------------------
   OfflineQ – docházka zapsaná bez internetu (na hřišti): uloží se do telefonu a odešle se, až bude spojení
   --------------------------------------------------------------------- */
class OfflineQ {
  static KEY = 'unie-offq';
  static get()  { try { return JSON.parse(localStorage.getItem(OfflineQ.KEY) || '[]'); } catch (e) { return []; } }
  static set(L) { try { localStorage.setItem(OfflineQ.KEY, JSON.stringify(L)); } catch (e) {} }
  static mine() { return OfflineQ.get().filter(x => x.uid == Sync.me); }
  static isNet(e) { return !navigator.onLine || /fetch|network|load failed|timeout|offline/i.test(String(e && (e.message || e))); }
  static push(rows) {
    const L = OfflineQ.get().filter(x => !rows.some(r => r.event_id == x.event_id && r.player_id == x.player_id));
    OfflineQ.set(L.concat(rows.map(r => Object.assign({uid: Sync.me}, r))));
  }
  /** Zapíše značky docházky; bez spojení je zařadí do fronty v telefonu. */
  static async save(rows) {
    if (!navigator.onLine) { OfflineQ.push(rows); return App.render(); }
    Sync.pending++;
    try { const r = await sb.from('attendance').upsert(rows, {onConflict: 'event_id,player_id'}); if (r.error) throw r.error; }
    catch (e) {
      if (OfflineQ.isNet(e)) OfflineQ.push(rows);
      else { Sync.toast('Docházku se nepodařilo uložit: ' + (e.message || e)); Sync.queueReload(['attendance']); }
    } finally { Sync.pending--; }
    App.refresh();
  }
  static async flush() {
    const mine = OfflineQ.mine(); if (!mine.length || !navigator.onLine || !UI.user || OfflineQ.busy) return;
    OfflineQ.busy = true;
    try {
      const r = await sb.from('attendance').upsert(mine.map(({uid, ...x}) => x), {onConflict: 'event_id,player_id'});
      if (r.error && OfflineQ.isNet(r.error)) return;
      OfflineQ.set(OfflineQ.get().filter(x => x.uid != Sync.me));
      Sync.toast(r.error ? 'Část docházky zapsané bez internetu se nepodařilo uložit: ' + r.error.message : '✔ Docházka zapsaná bez internetu je uložena (' + mine.length + ').', !r.error);
    } finally { OfflineQ.busy = false; }
  }
  /** Po načtení docházky ze serveru znovu ukáže čekající značky (aby nezmizely). */
  static reapply() { OfflineQ.mine().forEach(x => { const m = Model.byId(x.player_id); if (m && x.state) DB.att[x.event_id + '|' + m.n] = x.state; }); }
  static badge() { const n = OfflineQ.mine().length; return n ? `<div class="warn" style="margin-top:8px">📴 ${n} ${n == 1 ? 'značka docházky čeká' : n < 5 ? 'značky docházky čekají' : 'značek docházky čeká'} na internet – ${n == 1 ? 'uloží se sama' : 'uloží se samy'}, jakmile bude spojení.</div>` : ''; }
}


/* ---------------------------------------------------------------------
   Offline – poslední načtená data se uloží v telefonu; bez internetu se aplikace otevře s nimi (jen pro čtení).
   Ukládá se jen při „Zůstat přihlášený“ a po odhlášení se smaže.
   --------------------------------------------------------------------- */
class Offline {
  static KEY = 'unie-snap';
  static save() {
    if (!authStorage.keep()) return;
    clearTimeout(Offline.t);
    Offline.t = setTimeout(() => {
      if (!UI.user || UI.offlineAt) return;
      try { localStorage.setItem(Offline.KEY, JSON.stringify({uid: Sync.me, at: Date.now(), teams: CONFIG.planner.teams, account: CONFIG.account, db: DB})); }
      catch (e) { try { localStorage.removeItem(Offline.KEY); } catch (x) {} }         // plná paměť → raději nic
    }, 1500);
  }
  static load(uid) {
    try {
      const s = JSON.parse(localStorage.getItem(Offline.KEY) || 'null');
      if (!s || s.uid != uid || !s.db || !s.db.users || !s.db.users[uid]) return false;
      Object.assign(DB, s.db); CONFIG.planner.teams = s.teams || CONFIG.planner.teams; CONFIG.account = s.account || CONFIG.account; UI.offlineAt = s.at;
      return true;
    } catch (e) { return false; }
  }
  static clear() { clearTimeout(Offline.t); try { localStorage.removeItem(Offline.KEY); } catch (e) {} }
  static banner() { return UI.offlineAt ? `<div class="warn" style="margin:0 0 10px">📴 Jste bez internetu – zobrazuji data uložená ${esc(Util.stamp(UI.offlineAt))}. Docházka se uloží později, ostatní změny teď nejdou.</div>` : ''; }
  /** Vrátil se internet: načíst čerstvá data a zapnout Realtime. */
  static async online() {
    OfflineQ.flush();
    if (!UI.offlineAt || !UI.user) return;
    try { await Sync.loadAll(); UI.offlineAt = 0; UI.user = DB.users[Sync.me] || UI.user; Sync.subscribe(); Sync.toast('✔ Jste zpět online.', true); App.render(); } catch (e) {}
  }
}
window.addEventListener('online', () => Offline.online());


/* ---------------------------------------------------------------------
   ErrLog – chyby v aplikaci se tiše zapíšou do databáze (max. 10 za spuštění), správce je vidí v Správě
   --------------------------------------------------------------------- */
class ErrLog {
  static sent = new Set(); static n = 0;
  static init() {
    window.addEventListener('error', e => { if (e.target && e.target.tagName) return; ErrLog.send(e.message, (e.filename || '').split('/').pop() + ':' + (e.lineno || '') + ':' + (e.colno || ''), e.error && e.error.stack); });
    window.addEventListener('unhandledrejection', e => ErrLog.send('Promise: ' + ((e.reason && e.reason.message) || e.reason), '', e.reason && e.reason.stack));
  }
  static send(msg, src, stack) {
    msg = String(msg || 'Neznámá chyba').slice(0, 1000);
    if (!UI.user || UI.offlineAt || ErrLog.n >= 10 || ErrLog.sent.has(msg)) return;
    ErrLog.sent.add(msg); ErrLog.n++;
    try { sb.from('client_errors').insert({message: msg, source: String(src || '').slice(0, 300), stack: String(stack || '').slice(0, 4000), ua: navigator.userAgent.slice(0, 300), version: APP_VERSION}).then(() => {}, () => {}); } catch (e) {}
  }
  static card() {
    if (UI.errs === undefined) { UI.errs = null; ErrLog.load(); }
    const L = UI.errs;
    return `<div class="card"><div class="pay"><b>🐞 Chyby v aplikaci</b>${L && L.length && UI.user.r == 'a' ? `<button class="chip" style="flex:none" onclick="ErrLog.clear()">Smazat vše</button>` : ''}</div>
      <div class="mut">Když u někoho aplikace spadne, zapíše se sem chyba (bez osobních údajů kromě jména účtu). Starší než 60 dní se mažou samy.</div>
      ${L == null ? '<div class="mut">Načítám…</div>' : L.length ? L.map(x => `<details style="margin-top:6px"><summary><span class="mut">${esc(Util.stamp(x.created_at))} · ${esc((DB.users[x.user_id] || {}).name || '—')}</span> ${esc(x.message.slice(0, 90))}</summary>
        <pre style="white-space:pre-wrap;font-size:11px;margin:6px 0 0">${esc([x.source, x.version, x.ua, x.stack].filter(Boolean).join('\n'))}</pre></details>`).join('') : '<div class="cg" style="margin-top:6px">Žádné chyby 👍</div>'}</div>`;
  }
  static async load() { const r = await sb.from('client_errors').select('*').order('id', {ascending: false}).limit(30); UI.errs = r.error ? [] : r.data; App.render(); }
  static async clear() {
    if (!confirm('Smazat všechny zapsané chyby?')) return;
    if (await Sync.write('Chyby se nepodařilo smazat', sb.from('client_errors').delete().gt('id', 0))) { UI.errs = []; App.render(); }
  }
}


/* ---------------------------------------------------------------------
   Usage – využití bezplatného tarifu Supabase (databáze 500 MB, úložiště fotek 1 GB)
   --------------------------------------------------------------------- */
class Usage {
  static mb(b) { return b >= 1e9 ? (b / 1e9).toFixed(2).replace('.', ',') + ' GB' : (b / 1e6).toFixed(1).replace('.', ',') + ' MB'; }
  static card() {
    if (UI.usage === undefined) { UI.usage = null; Usage.load(); }
    const s = UI.usage;
    const bar = (v, max, l) => { const p = Math.min(100, Math.round(v / max * 100)); return `<div class="pay" style="margin-top:8px"><span>${l}</span><b>${Usage.mb(v)} z ${Usage.mb(max)} · ${p} %</b></div>
      <div class="bar"><i style="width:${Math.max(p, 1)}%;background:var(--${p > 80 ? 'r' : p > 60 ? 'y' : 'g'})"></i></div>`; };
    return `<div class="card"><b>📈 Využití bezplatného tarifu</b>
      ${!s ? '<div class="mut">Načítám…</div>' : s.err ? `<div class="warn">${esc(s.err)}</div>` : `${bar(s.db_bytes, 500e6, '🗄 Databáze')}${bar(s.storage_bytes, 1e9, '🖼 Fotky (' + s.storage_files + ' souborů)')}
        <div class="mut" style="margin-top:8px">${s.players} hráčů · ${s.users} účtů · ${s.events} akcí · ${s.attendance} záznamů docházky · ${s.chat} zpráv chatu · ${s.dm} soukromých zpráv · ${s.notifications} upozornění</div>
        <div class="mut" style="margin-top:6px">Přenos dat (limit 5 GB měsíčně) ukazuje Supabase → Project → Usage.</div>`}</div>`;
  }
  static async load() {
    const r = await sb.rpc('usage_stats');
    UI.usage = r.error ? {err: 'Údaje se nepodařilo načíst' + (/usage_stats|function/.test(r.error.message) ? ' – nejdřív spusťte aktualizované SQL v Supabase.' : '.')} : r.data;
    App.render();
  }
}


/* ---------------------------------------------------------------------
   Captcha – ochrana přihlášení a obnovy hesla před roboty (Cloudflare Turnstile, zdarma).
   Zapne se, až správce v Správě vloží veřejný klíč (site key) a v Supabase zapne CAPTCHA (viz README).
   --------------------------------------------------------------------- */
class Captcha {
  static key = ''; static token = ''; static wid = null; static loading = false;
  static async init() {
    try { const r = await sb.rpc('login_config'); Captcha.key = (!r.error && r.data && r.data.turnstile) || ''; } catch (e) {}
    if (Captcha.key && !UI.user) App.render();
  }
  static html() { return Captcha.key ? '<div id="ts-box" style="margin-top:10px;min-height:65px"></div>' : ''; }
  /** Po každém vykreslení přihlašovací obrazovky znovu vloží ověření (překreslení ho smaže). */
  static mount() {
    const box = document.getElementById('ts-box'); if (!box || !Captcha.key) return;
    if (window.turnstile) { Captcha.token = ''; Captcha.wid = turnstile.render(box, {sitekey: Captcha.key, theme: 'dark', language: 'cs', callback: t => Captcha.token = t, 'expired-callback': () => Captcha.token = ''}); return; }
    if (Captcha.loading) return;
    Captcha.loading = true;
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.dataset.optional = '1';
    s.onload = () => { Captcha.loading = false; Captcha.mount(); };
    s.onerror = () => { Captcha.loading = false; };
    document.head.appendChild(s);
  }
  static need() { if (!Captcha.key || Captcha.token) return false; UI.authMsg = 'Potvrďte prosím ověření „nejsem robot“.'; return true; }
  static opts() { return Captcha.key ? {captchaToken: Captcha.token} : {}; }
  static reset() { Captcha.token = ''; try { if (window.turnstile && Captcha.wid != null) turnstile.reset(Captcha.wid); } catch (e) {} }
  static adminCard() {
    return `<div class="card"><b>🛡 Ochrana přihlášení (Cloudflare Turnstile)</b>
      <div class="mut">Zdarma. Na přihlášení se objeví ověření „nejsem robot“. Postup je v README (sekce Ochrana přihlášení): nejdřív sem vložte <b>Site key</b>, potom v Supabase zapněte CAPTCHA se <b>Secret key</b>. Prázdné = vypnuto.</div>
      <div class="row" style="margin-top:6px"><input id="ad-ts" value="${esc(DB.settings.turnstile_sitekey || '')}" placeholder="0x4AAAAAAA…" autocomplete="off"><button class="btn ok" style="flex:none" onclick="Captcha.save()">Uložit</button></div></div>`;
  }
  static async save() {
    const v = ($('#ad-ts').value || '').trim();
    if (v && !/^[0-9A-Za-z_-]{10,80}$/.test(v)) return Admin.msg('⚠ Klíč nevypadá správně (zkopírujte Site key z Cloudflare).');
    const { error } = await sb.from('settings').upsert({key: 'turnstile_sitekey', value: v}, {onConflict: 'key'});
    if (error) return Admin.msg('⚠ ' + error.message);
    DB.settings.turnstile_sitekey = v; Captcha.key = v; Admin.msg(v ? '✔ Klíč uložen. Teď zapněte CAPTCHA v Supabase (viz README).' : '✔ Ochrana vypnuta – nezapomeňte ji vypnout i v Supabase.', true);
  }
}
