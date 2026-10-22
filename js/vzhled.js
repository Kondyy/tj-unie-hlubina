/* TJ Unie Hlubina – 5/6 vzhled: barvy klubu, ikony, světlý/tmavý režim, obrazovka Dnes, mřížka docházky, grafy, obrázek výsledku. */
/* =====================================================================
   10. VZHLED – všechno, co mění jen podobu aplikace (funkce zůstávají v modulech).
     Theme     světlý / tmavý režim (podle telefonu nebo ručně) a větší písmo
     Icons     čárové SVG ikony místo emoji (po každém vykreslení se emoji v textu nahradí ikonou)
     Dnes      karta nejbližší akce s odpočtem a rychlými tlačítky
     AttGrid   docházka jako mřížka fotek (klepnutí: Přítomen → Omluven → Neomluven)
     Charts    grafy (sloupce po měsících, forma V/R/P, koláč dluhů)
     ResultImg obrázek výsledku zápasu pro Facebook / Instagram
     Look      prázdné stavy, kostra při načítání, úvodní obrazovka, velká fajfka po uložení
   ===================================================================== */

/* ---------------------------------------------------------------------
   Theme – světlý / tmavý režim a větší písmo (pamatuje si telefon)
   --------------------------------------------------------------------- */
class Theme {
  static KEY = 'unie-theme'; static BIG = 'unie-big';
  static get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  static put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  /** 'auto' (podle telefonu) | 'light' | 'dark' */
  static mode() { return Theme.get(Theme.KEY, 'auto'); }
  static big()  { return Theme.get(Theme.BIG, '0') == '1'; }
  static resolved() {
    const m = Theme.mode();
    return m != 'auto' ? m : (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
  /** Nastaví barvy stránky (atribut data-theme), velikost písma a barvu lišty prohlížeče. */
  static apply() {
    const r = document.documentElement, t = Theme.resolved();
    r.dataset.theme = t; r.classList.toggle('big', Theme.big());
    const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.content = t == 'light' ? '#f3f5fa' : '#0a0d14';
  }
  static set(m)      { Theme.put(Theme.KEY, m); Theme.apply(); App.render(); }
  static setBig(on)  { Theme.put(Theme.BIG, on ? '1' : '0'); Theme.apply(); App.render(); }
  /** Karta „Vzhled“ v Nastavení. */
  static card() {
    const m = Theme.mode();
    return `<div class="card"><b>🎨 Vzhled</b>
      <div class="row" style="margin-top:8px">${[['auto', 'Podle telefonu'], ['light', '☀️ Světlý'], ['dark', '🌙 Tmavý']].map(([k, l]) => `<button class="chip ${m == k ? 'on' : ''}" onclick="Theme.set('${k}')">${l}</button>`).join('')}</div>
      <label class="pl" style="margin-top:6px"><span>Větší písmo a tlačítka</span><input type="checkbox" ${Theme.big() ? 'checked' : ''} onchange="Theme.setBig(this.checked)"></label>
      <div class="mut" style="margin-top:6px">Světlý režim je na slunci na hřišti čitelnější. Nastavení platí jen pro tento telefon.</div></div>`;
  }
}
Theme.apply();
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (Theme.mode() == 'auto') Theme.apply(); }); } catch (e) {}


/* ---------------------------------------------------------------------
   Icons – sada čárových ikon (SVG) a náhrada emoji v textu stránky
   --------------------------------------------------------------------- */
class Icons {
  /** Kresby ikon (mřížka 24 × 24, čára 2 px, barva podle textu). */
  static P = {
    home:'<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.6"/>',
    wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    ball:'<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10zM12 3v4M21 10h-5M3 10h5M7 20l2-5.5M17 20l-2-5.5"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    field:'<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M12 5v14"/><circle cx="12" cy="12" r="3"/><path d="M2 9h3v6H2M22 9h-3v6h3"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    pin:'<path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    meet:'<path d="M4 21V4M4 4h12l-2 4 2 4H4"/>',
    flag:'<path d="M4 21V4M4 4h14v9H4"/><path d="M8 4v9M12 4v9M16 4v9M4 8.5h14" stroke-width="1.2"/>',
    nav:'<circle cx="12" cy="12" r="9"/><path d="M16 8l-2.5 5.5L8 16l2.5-5.5z"/>',
    car:'<path d="M5 16v-5l2-5h10l2 5v5M3 16h18v3H3zM7 19v2M17 19v2"/><circle cx="7.5" cy="13.5" r=".6"/><circle cx="16.5" cy="13.5" r=".6"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
    check:'<path d="M4 12l5 5L20 6"/>',
    x:'<path d="M6 6l12 12M18 6L6 18"/>',
    alert:'<path d="M12 3L2 20h20zM12 10v4M12 17h.01"/>',
    hour:'<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
    lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    clip:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/>',
    mega:'<path d="M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 0 1 0 6"/>',
    cap:'<path d="M3 15a9 6 0 0 1 18 0zM3 15h19"/><path d="M12 9V7"/>',
    med:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    hand:'<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>',
    camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>',
    image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    phone:'<path d="M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    cut:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
    bag:'<path d="M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2"/>',
    doc:'<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.5"/><path d="M13 10h5M13 14h4"/>',
    dl:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    ul:'<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
    inbox:'<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5"/>',
    folder:'<path d="M3 6h6l2 2h10v12H3z"/>',
    save:'<path d="M5 3h12l4 4v14H3V3zM7 3v6h9V3M7 21v-7h10v7"/>',
    sync:'<path d="M20 12a8 8 0 0 1-14 5.3M4 12A8 8 0 0 1 18 6.7M18 3v4h-4M6 21v-4h4"/>',
    moon:'<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    psun:'<path d="M8 3v1M3 8h1M4.5 4.5l.7.7M11.5 4.5l-.7.7"/><circle cx="8" cy="8" r="2.5"/><path d="M8 20h10a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0 1 6z"/>',
    cloud:'<path d="M7 19h11a4 4 0 0 0 0-8 6 6 0 0 0-11.6 2A3 3 0 0 0 7 19z"/>',
    fog:'<path d="M4 9h16M2 13h20M5 17h14"/>',
    rain:'<path d="M7 15h11a4 4 0 0 0 0-8 6 6 0 0 0-11.6 2A3 3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow:'<path d="M12 2v20M4 7l16 10M20 7L4 17M9 4l3 3 3-3M9 20l3-3 3 3"/>',
    bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    star:'<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
    bug:'<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7v13M9 7a3 3 0 0 1 6 0M3 12h4M17 12h4M4 7l3 2M20 7l-3 2M4 18l3-2M20 18l-3-2"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    off:'<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-2.3-1.6M12 20h.01"/>',
    palette:'<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 9.8C22 6 17.5 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    glove:'<path d="M7 21v-4l-3-5a2 2 0 0 1 3.4-2L9 12V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V5.5a1.5 1.5 0 0 1 3 0V16l-2 5z"/>'
  };
  /** Emoji → ikona. Chat a vlastní texty uživatelů se nemění (třída .bub). */
  static MAP = {
    '📅':'cal','🗓':'cal','📆':'cal','💬':'chat','🧒':'user','👤':'user','👥':'users','👪':'users','💳':'wallet','⚙':'gear','⚽':'ball',
    '🏆':'trophy','🏅':'trophy','🏟':'field','📝':'edit','✏':'edit','📊':'chart','📈':'trend','✉':'mail','📨':'send','🛠':'tool','🔔':'bell',
    '📍':'pin','🕒':'clock','⏰':'clock','🤝':'meet','🏁':'flag','🧭':'nav','🚗':'car','🗑':'trash','✔':'check','✓':'check',
    '✖':'x','✕':'x','✗':'x','❌':'x','⚠':'alert','⏳':'hour','🔍':'search','🔒':'lock','🔐':'lock','🔓':'unlock','📋':'clip','📢':'mega',
    '🧢':'cap','🩹':'med','🩺':'med','🙋':'hand','➕':'plus','➖':'minus','📷':'camera','🖼':'image','📞':'phone','☎':'phone','✂':'cut',
    '🎒':'bag','🧾':'doc','📄':'doc','📇':'card','🪪':'card','📥':'inbox','⬇':'dl','📤':'ul','📂':'folder','🗄':'folder','💾':'save','🔄':'sync',
    '🌙':'moon','☀':'sun','🌤':'psun','☁':'cloud','🌫':'fog','🌧':'rain','🌦':'rain','☔':'rain','🌨':'snow','⛈':'bolt','🧤':'glove','ℹ':'info',
    '⭐':'star','⚡':'bolt','🐞':'bug','🛡':'shield','👁':'eye','🏷':'tag','☰':'menu','📴':'off','🎨':'palette'
  };
  static DOTS = {'🔴':'', '🟢':'g', '🟡':'y'};
  static RE = null;
  static svg(name, cls) { return `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  /** Vloží sadu ikon do stránky (jednou). */
  static sprite() {
    if (document.getElementById('i-sprite')) return;
    const d = document.createElement('div');
    d.innerHTML = `<svg id="i-sprite" width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(Icons.P).map(([k, p]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${p}</symbol>`).join('')}</svg>`;
    document.body.prepend(d.firstChild);
  }
  /** Projde texty ve vykreslené stránce a emoji nahradí ikonou (pole formulářů, výběry a zprávy v chatu zůstanou beze změny). */
  static apply(root) {
    Icons.sprite();
    if (!Icons.RE) Icons.RE = new RegExp('(' + [...Object.keys(Icons.MAP), ...Object.keys(Icons.DOTS)].sort((a, b) => b.length - a.length).join('|') + ')\\uFE0F?', 'gu');
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => {
      const p = n.parentElement;
      if (!p || p.closest('textarea,select,option,script,style,.bub,.noico')) return NodeFilter.FILTER_REJECT;
      Icons.RE.lastIndex = 0;
      return Icons.RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }});
    const L = []; while (w.nextNode()) L.push(w.currentNode);
    L.forEach(n => {
      const span = document.createElement('span');
      span.innerHTML = esc(n.nodeValue).replace(Icons.RE, (m, e) => e in Icons.DOTS ? `<i class="dot ${Icons.DOTS[e]}"></i>` : Icons.svg(Icons.MAP[e]));
      n.replaceWith(...span.childNodes);
    });
  }
}


/* ---------------------------------------------------------------------
   Look – drobné prvky vzhledu (prázdný stav, kostra, úvodní obrazovka, fajfka, přechody)
   --------------------------------------------------------------------- */
class Look {
  /** Prázdný stav: ikona, nadpis, rada co dál (a volitelně tlačítka). */
  static empty(icon, title, text, actions) {
    return `<div class="card empty"><div class="eic">${Icons.svg(icon)}</div><h3>${title}</h3><div class="mut">${text}</div>${actions ? `<div class="qa" style="margin:12px 0 0">${actions}</div>` : ''}</div>`;
  }
  /** Kostra obsahu při načítání (šedé obrysy místo prázdné obrazovky). */
  static skeleton(n) {
    return `<div aria-label="Načítám…" role="status">${Array.from({length: n || 2}, () => `<div class="card"><div style="display:flex;gap:10px;align-items:center"><div class="sk" style="width:40px;height:40px;border-radius:50%"></div>
      <div style="flex:1"><div class="sk" style="height:12px;width:70%"></div><div class="sk" style="height:10px;width:40%;margin-top:6px"></div></div></div></div>`).join('')}</div>`;
  }
  /** Úvodní obrazovka při spuštění (logo klubu). */
  static splash() {
    return `<div class="splash"><img src="${LOGO}" alt="${CLUB}"><b>${CLUB}</b><div class="mut">Načítám…</div>
      <div style="width:min(360px,100%);margin-top:18px;opacity:.7">${Look.skeleton(2)}</div></div>`;
  }
  /** Velká fajfka po uložení + krátké zavibrování. */
  static done() {
    try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
    let d = document.getElementById('done');
    if (!d) { d = document.createElement('div'); d.id = 'done'; d.className = 'done'; d.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>'; document.body.appendChild(d); }
    d.classList.add('show'); clearTimeout(Look.dt); Look.dt = setTimeout(() => d.classList.remove('show'), 900);
  }
  static tap() { try { navigator.vibrate && navigator.vibrate(10); } catch (e) {} }
  /** Po vykreslení: ikony, odpočty, plynulý přechod při změně záložky. */
  static after(root) {
    Icons.apply(root);
    Dnes.tick();
    const key = UI.user ? UI.user.r + ':' + UI.tab : '';
    if (key && Look.last && key != Look.last) { const m = root.querySelector('main.wrap'); if (m) m.classList.add('enter'); }
    Look.last = key;
  }
}
document.documentElement.style.setProperty('--logo', `url("${LOGO}")`);


/* ---------------------------------------------------------------------
   Dnes – karta nejbližší akce: kdy, kde, sraz, odpočet a rychlá tlačítka
   --------------------------------------------------------------------- */
class Dnes {
  static DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
  /** Datum a čas začátku akce (Date). */
  static at(e) { const d = Util.dayDate(e.d), [h, m] = String(e.t || '').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d; }
  /** Nejbližší nezrušená akce (probíhající se ukazuje ještě 90 minut po začátku). */
  static next(list) {
    const from = Date.now() - 90 * 6e4;
    return list.filter(e => !e.x && Dnes.at(e) >= from).sort((a, b) => Dnes.at(a) - Dnes.at(b))[0];
  }
  static when(e) {
    const d = Dnes.at(e), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
    return (diff == 0 ? 'Dnes' : diff == 1 ? 'Zítra' : Dnes.DAYS[d.getDay()]) + ` ${d.getDate()}. ${d.getMonth() + 1}.`;
  }
  /** Karta akce (bez tlačítek – ta přidá rodič / trenér). */
  static card(e, who) {
    const kind = e.k == 'z' ? (e.tour ? '🏅 Turnaj · ' + esc(e.o) : '🏆 Zápas · vs. ' + esc(e.o)) : '⚽ Trénink';
    return `<div class="card dnes ${e.k}"><div class="pay"><span class="when">${Dnes.when(e)}</span><span class="kind">${esc(e.tm)}${who ? ' · ' + esc(who) : ''}</span></div>
      <div class="kind" style="margin-top:6px">${kind}</div>
      <div class="big">${esc(e.t)}</div>
      <div class="ln">📍 ${esc(e.pl)}</div>
      ${e.m ? `<div class="ln">🤝 Sraz: ${esc(e.m)}</div>` : ''}
      <div class="cd" data-at="${+Dnes.at(e)}">${Dnes.parts(+Dnes.at(e))}</div></div>`;
  }
  /** Odpočet: dny/hod/min, v posledních 24 hodinách hod/min/s. */
  static parts(at) {
    let s = Math.max(0, Math.round((at - Date.now()) / 1000));
    if (!s) return '<div style="min-width:auto;padding:6px 12px"><b>Právě teď</b></div>';
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = n => String(n).padStart(2, '0');
    const L = d ? [[d, d == 1 ? 'den' : d < 5 ? 'dny' : 'dní'], [p(h), 'hod'], [p(m), 'min']] : [[p(h), 'hod'], [p(m), 'min'], [p(x), 's']];
    return L.map(([v, l]) => `<div><b>${v}</b>${l}</div>`).join('');
  }
  /** Každou sekundu přepíše čísla odpočtu (bez překreslení stránky). */
  static tick() {
    const L = document.querySelectorAll('[data-at]');
    L.forEach(el => el.innerHTML = Dnes.parts(+el.dataset.at));
    if (L.length && !Dnes.timer) Dnes.timer = setInterval(() => { if (!document.querySelector('[data-at]')) { clearInterval(Dnes.timer); Dnes.timer = 0; } else Dnes.tick(); }, 1000);
  }
  static nav(e) {
    return `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(Venues.target(e.pl))}">🧭 Navigovat</a>`;
  }
  /** Rodič (záložka Přehled): nejbližší akce dítěte + Přijdu / Omluvit / Navigovat. */
  static parent(team) {
    const e = Dnes.next(Model.eventsOf(team)); if (!e) return '';
    const k = UI.kid + '|' + e.id, r = DB.responses[k], can = !Calendar.notNominated(e);
    const btns = (can ? `<button class="btn ${r && r.s == 'y' ? 'ok' : ''}" onclick="Calendar.attend('${Util.q(k)}')">✔ Přijdu</button>
        <button class="btn ${r && r.s == 'n' ? 'no' : ''}" onclick="Calendar.openExcuse('${Util.q(k)}')">✖ Omluvit</button>` : '') + (e.k == 'z' ? Dnes.nav(e) : '');
    return `${Dnes.card(e, UI.kid)}${btns ? `<div class="qa">${btns}</div>` : ''}`;
  }
  /** Trenér (záložka Tréninky): nejbližší akce kategorie + otevřít docházku / zápas. */
  static coach(team) {
    const e = Dnes.next(Model.eventsOf(team)); if (!e) return '';
    const open = e.k == 'z' ? `<button class="btn ok" onclick="UI.tab='ev';Events.openMatch('${e.id}')">🏆 Otevřít ${e.tour ? 'turnaj' : 'zápas'}</button>`
                            : `<button class="btn ok" onclick="Attendance.open('${e.id}')">📋 Otevřít docházku</button>`;
    return `${Dnes.card(e)}<div class="qa">${open}${e.k == 'z' ? Dnes.nav(e) : ''}</div>`;
  }
}


/* ---------------------------------------------------------------------
   AttGrid – docházka jako mřížka fotek (trenér na hřišti). Podrobný seznam zůstává o klepnutí vedle.
   --------------------------------------------------------------------- */
class AttGrid {
  static KEY = 'unie-attlist';
  /** true = podrobný seznam (původní karty hráčů), false = mřížka fotek */
  static isList() { return Theme.get(AttGrid.KEY, '0') == '1'; }
  static setList(on) { Theme.put(AttGrid.KEY, on ? '1' : '0'); App.render(); }
  static NEXT = {P: 'O', O: 'N', N: 'P'};
  static tap(id, name) { const a = DB.att[id + '|' + name]; Look.tap(); Attendance.mark(id, name, a ? AttGrid.NEXT[a] : 'P'); }
  static view(e) {
    const L = Model.membersOf(e.tm), here = L.filter(m => DB.att[e.id + '|' + m.n] == 'P').length;
    const ans = {ok: '✔', no: '✖', wa: '⏳'};
    return `<div class="pay" style="margin-top:14px"><h2 style="margin:0">Docházka</h2><span class="pill ok">${here} / ${L.length} přítomno</span></div>
      <div class="mut" style="margin:4px 0 10px">Klepnutím na fotku: Přítomen → Omluven → Neomluven. Vlevo nahoře je odpověď rodiče.</div>
      <div class="pg">${L.map(m => {
        const a = DB.att[e.id + '|' + m.n] || '', an = Events.answer(m.n, e.id);
        return `<button class="pt ${a}" onclick="AttGrid.tap('${e.id}','${Util.q(m.n)}')" title="${esc(m.full || m.n)} · ${an[1].replace(/<[^>]*>/g, '')}" aria-label="${esc(m.full || m.n)}: ${a ? CONFIG.attStates.find(s => s[0] == a)[1] : 'bez značky'}">
          ${Util.avatar(m, 104)}<span class="an ${an[0]}">${ans[an[0]]}</span>${a ? `<span class="st">${a}</span>` : ''}<span class="nm">${esc(m.full || m.n)}</span></button>`;
      }).join('')}</div>
      <button class="btn" style="width:100%;margin-top:10px" onclick="AttGrid.setList(true)">📋 Podrobný seznam (procenta, odpovědi rodičů)</button>`;
  }
}


/* ---------------------------------------------------------------------
   Charts – jednoduché grafy bez knihovny
   --------------------------------------------------------------------- */
class Charts {
  static MON = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  /** Sloupcový graf: [{l: popisek, v: 0–100, top: text nad sloupcem, sub: text pod popiskem, c: 'y'|'r'}] */
  static bars(L) {
    return `<div class="bars">${L.map(x => `<div class="${x.c || ''}" style="height:${Math.max(2, Math.min(100, x.v))}%" title="${esc(x.l)}: ${esc(x.top)}${x.sub ? ' (' + esc(x.sub) + ')' : ''}"><b>${esc(x.top)}</b><span>${esc(x.l)}${x.sub ? '<br>' + esc(x.sub) : ''}</span></div>`).join('')}</div>`;
  }
  /** Forma týmu: čtverečky V / R / P (nejstarší vlevo). */
  static form(results) {
    const L = results.slice(0, 10).reverse();
    return L.length ? `<div class="form" aria-label="Forma">${L.map(r => { const c = r.s[0] > r.s[1] ? ['W', 'V'] : r.s[0] == r.s[1] ? ['D', 'R'] : ['L', 'P']; return `<span class="${c[0]}" title="${esc(r.d)} ${esc(r.o)} ${r.s[0]}:${r.s[1]}">${c[1]}</span>`; }).join('')}</div>` : '';
  }
  /** Koláč (prstenec) s legendou: [{l, v}] */
  static donut(L, unit) {
    const sum = L.reduce((a, x) => a + x.v, 0); if (!sum) return '';
    const C = ['var(--acc2)', 'var(--y)', 'var(--r)', 'var(--g)', '#a78bfa', '#22d3ee'];
    let off = 0;
    const arcs = L.map((x, i) => { const p = x.v / sum * 100, s = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${C[i % C.length]}" stroke-width="6" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${-off}" transform="rotate(-90 21 21)"/>`; off += p; return s; }).join('');
    return `<div class="donut"><svg viewBox="0 0 42 42" width="96" height="96" role="img" aria-label="Graf"><circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--track)" stroke-width="6"/>${arcs}</svg>
      <div class="lgd">${L.map((x, i) => `<div><i style="background:${C[i % C.length]}"></i>${esc(x.l)} <b>${x.v.toLocaleString('cs-CZ')}${unit || ''}</b></div>`).join('')}</div></div>`;
  }
}


/* ---------------------------------------------------------------------
   ResultImg – výsledek zápasu jako čtvercový obrázek (1080 × 1080) pro Facebook a Instagram
   --------------------------------------------------------------------- */
class ResultImg {
  static btn(r, small) {
    return small ? `<button class="chip" style="margin-top:8px" onclick="ResultImg.share(${+r.id})">🖼 Obrázek pro sítě</button>`
                 : `<button class="btn" style="width:100%;margin-top:8px" onclick="ResultImg.share(${+r.id})">🖼 Obrázek výsledku pro sítě</button>`;
  }
  /** Tlačítka k výsledkům zápasu (detail zápasu u trenéra). */
  static forEvent(e) {
    const L = DB.results.filter(r => r.eid == e.id);
    return L.length ? `<div class="card"><b>🏁 Výsledky</b>${L.map(r => `<div class="pay" style="margin-top:6px"><span>${r.h ? esc(CLUB) + ' – ' + esc(r.o) : esc(r.o) + ' – ' + esc(CLUB)}</span><b>${r.h ? r.s[0] + ':' + r.s[1] : r.s[1] + ':' + r.s[0]}</b></div>${ResultImg.btn(r)}`).join('')}</div>` : '';
  }
  static img(src) { return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
  static async draw(r) {
    try { await document.fonts.load('800 40px "Barlow Condensed"'); } catch (e) {}
    const S = 1080, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), F = (w, s) => `${w} ${s}px "Barlow Condensed","Arial Narrow",sans-serif`;
    let g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#2452a1'); g.addColorStop(1, '#0a1530'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    g = x.createRadialGradient(0, 0, 0, 0, 0, S * .75); g.addColorStop(0, 'rgba(227,30,38,.85)'); g.addColorStop(1, 'rgba(227,30,38,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 70; x.beginPath(); x.arc(S - 60, 120, 260, 0, Math.PI * 2); x.stroke();
    const logo = await ResultImg.img(LOGO); if (logo) x.drawImage(logo, 70, 70, 150, 150);
    const team = r.tm || '', home = !!r.h, us = r.s[0], them = r.s[1];
    x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    x.font = F(800, 54); x.fillText(CLUB.toUpperCase(), 250, 140);
    x.font = F(600, 40); x.globalAlpha = .85; x.fillText(`${team} · ${r.d} · ${home ? 'doma' : 'venku'}`, 250, 196); x.globalAlpha = 1;
    const res = us > them ? 'VÝHRA' : us == them ? 'REMÍZA' : 'PROHRA';
    x.textAlign = 'center'; x.font = F(700, 56); x.fillStyle = us > them ? '#4ade80' : us == them ? '#e5e7eb' : '#ff8088'; x.fillText(res, S / 2, 420);
    x.fillStyle = '#fff'; x.font = F(800, 300); x.fillText(home ? `${us}:${them}` : `${them}:${us}`, S / 2, 700);
    x.font = F(800, 58); x.textAlign = 'left'; x.fillText((home ? 'UNIE HLUBINA' : r.o.toUpperCase()).slice(0, 22), 70, 820);
    x.textAlign = 'right'; x.globalAlpha = .8; x.fillText((home ? r.o.toUpperCase() : 'UNIE HLUBINA').slice(0, 22), S - 70, 820); x.globalAlpha = 1;
    const sc = Object.entries(r.g || {}).map(([n, k]) => k > 1 ? `${n} ${k}×` : n).join(', ');
    x.textAlign = 'left'; x.font = '500 34px Inter, system-ui, sans-serif'; x.globalAlpha = .9;
    if (sc) ResultImg.wrap(x, 'Góly: ' + sc, 70, 900, S - 140, 44);
    x.globalAlpha = .6; x.font = '500 28px Inter, system-ui, sans-serif'; x.fillText('#UnieHlubina', 70, S - 60);
    return c;
  }
  static wrap(x, t, X, Y, W, lh) {
    let line = '', y = Y;
    t.split(' ').forEach(w => { const s = line ? line + ' ' + w : w; if (x.measureText(s).width > W && line) { x.fillText(line, X, y); line = w; y += lh; } else line = s; });
    if (line) x.fillText(line, X, y);
  }
  /** Vytvoří obrázek a nabídne Sdílet (telefon), jinak ho stáhne. */
  static async share(id) {
    const r = DB.results.find(x => x.id == id); if (!r) return;
    const c = await ResultImg.draw(r), blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    if (!blob) return Sync.toast('Obrázek se nepodařilo vytvořit.');
    const name = `vysledek-${(r.o || 'zapas').replace(/[^\w-]+/g, '-').toLowerCase()}.png`, file = new File([blob], name, {type: 'image/png'});
    try { if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: CLUB}); return; } } catch (e) { if (e && e.name == 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}
