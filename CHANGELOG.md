# Změny v aplikaci TJ Unie Hlubina

Přehled všech změn od nejnovější po nejstarší. U každé verze je napsáno, co je nové, co se opravilo a co je potřeba udělat v Supabase.

Po každé změně databáze spusťte v **Supabase → SQL Editor** celý soubor `schema.sql` (je bezpečné spouštět ho opakovaně) a v aplikaci obnovte stránku (Ctrl+F5).

---

---

## 21. 10. 2026 (večer 3)

### Správce mění fotky uživatelům
- Ve **Správě uživatelů → Upravit** má **správce** u každého účtu nahrání, úpravu (posun, zvětšení, otočení) a odebrání fotky. U každého uživatele v seznamu je teď i fotka (64 px, dobře vidět i na mobilu), tlačítka Upravit / Smazat jsou pod jménem.
- Vedení fotky jiným měnit nemůže, kontroluje to i databáze.

**Supabase:** nová funkce `admin_set_user_photo` (už je nasazená, pro jistotu ji obsahuje i `schema.sql`).

---

## 21. 10. 2026 (večer 2)

### Docházka hráče: omluven / neomluven
- V **kartě hráče** (trenér i rodič) je sekce **🗓 Docházka na tréninky**: počet **Přítomen / Omluven / Neomluven** ze všech zaznamenaných akcí a seznam absencí tohoto týdne. Dřív se součty počítaly jen z aktuálního týdne, a tak se často ukazovaly nuly.
- **Omluven** zahrnuje i starší historii: co není přítomen a není označený jako neomluvený, se počítá jako omluvené (např. 17 tréninků, 12 přítomen → 5 omluvených).
- Stálá absence hráče se **doplní i do už vytvořených tréninků** od dneška dál (dřív se předvyplňovalo jen u nově přidaných). Minulé tréninky se nemění.

**Supabase:** spustit `schema.sql` (doplnění je v něm, opakované spuštění nic nepokazí).

---

## 21. 10. 2026 (noc)

### Fotky v soukromém úložišti a záloha
**Změněno**
- **Fotky hráčů i trenérů jsou v soukromém úložišti Supabase**, v tabulkách je jen cesta. Obrázek se stáhne jednou, uloží se do paměti zařízení a při dalším spuštění se už nestahuje. Aplikace se tak rychleji načítá a výrazně se šetří měsíční limit přenesených dat.
- **Přístup k fotkám hlídá databáze:** fotku hráče vidí jen jeho rodič, trenér kategorie a vedení; fotku trenéra rodiče dětí z jeho kategorie. Nahrát ji smí trenér kategorie / vedení (hráč), každý sám sobě (profil).
- **Dřívější fotky se samy převedou** do úložiště po přihlášení trenéra, vedení a každého uživatele pro jeho vlastní fotku. Nic se nemusí dělat ručně.
- Po odhlášení se fotky smažou z paměti zařízení (sdílené telefony).

**Záloha (Správa)**
- Excel obsahuje i nominace, poznámky, docházku trenérů, omluvy na delší dobu, stálou absenci, zprávy klubu, chat a nastavení.
- Nové tlačítko **🖼 Stáhnout fotky (ZIP)**: fotky hráčů ve složkách podle kategorie a fotky trenérů zvlášť.
- Aplikace ukazuje, **kdy se naposledy stahovala záloha**, a po týdnu upozorní.

**Supabase:** spustit celý `schema.sql` (vytvoří úložiště `photos` a pravidla přístupu). Dokud se nespustí, fotky se ukládají po starém a nic se nerozbije. Pak Ctrl+F5.

---

## 21. 10. 2026 (večer)

### Fotka trenérů a vedení
- Trenér (i vedení a správce) si v **👤 Můj profil** nahraje vlastní fotku, stejně jako u hráčů ji může posunout, zvětšit a otočit.
- V **Kontaktu na trenéry** (Přehled rodiče) je u jména trenéra malá fotka, bez fotky iniciály.

**Supabase:** spustit celý `schema.sql` (nový sloupec `profiles.photo`, funkce `set_my_photo`, rozšířená `team_coaches`). Pak Ctrl+F5.

### Úprava fotky hráče
- Po výběru fotky se otevře okno **Upravit fotku**: fotku lze **posouvat** (tažením), **zvětšit / zmenšit** (posuvník, kolečko myši, dva prsty) a **otočit**. Kruh ukazuje, co zůstane vidět. Teprve po „Uložit“ se fotka uloží.
- U stávající fotky je nové tlačítko **✂ Upravit** (otevře ji znovu k úpravě).

**Supabase:** nic nového. Stačí obnovit stránku (Ctrl+F5).

### Upozornění rodičům jen na výběr trenéra
**Změněno**
- **Automatická upozornění rodičům jsou vypnutá.** Rodiče už nedostanou zprávu sami od sebe po přidání, zrušení ani úpravě akce, ani po vytvoření rozvrhu.
- Při přidání tréninku nebo zápasu je políčko **„Upozornit rodiče“** (výchozí stav je vypnuto).
- U každé akce je tlačítko **🔔 Upozornit rodiče**, kterým to trenér pošle kdykoli později.
- Při **zrušení nebo smazání** akce se trenér zeptá, jestli rodiče upozornit.
- U zadání výsledku zápasu je políčko, jestli rodiče upozornit.
- Beze změny zůstává upozornění po potvrzení nominace, připomínky plateb, zprávy klubu a chat.
- **Omluva na delší dobu je v kartě hráče** (rodič: záložka „Hráč“), už ne na Přehledu.
- Zmizel prázdný červený pruh pod tlačítkem omluvy.

**Supabase:** nic nového. Stačí obnovit stránku (Ctrl+F5).

## 21. 10. 2026

### Omluva na delší dobu a kalendář v telefonu
**Nové**
- **Omluva na delší dobu (od–do).** Rodič ji zadá na Přehledu, trenér v detailu hráče. Všechny tréninky a zápasy hráče v období se automaticky omluví (u tréninků „Omluven“, u zápasů odpověď „nemůže“) i s důvodem. Platí i pro akce, které trenér přidá později. Zrušením omluvy se vrátí jen to, co vzniklo automaticky.
- **Kalendář v telefonu** (Nastavení → Kalendář v telefonu). Odkaz do Apple/Google/jiného kalendáře, tréninky a zápasy se tam samy aktualizují. Odkaz je tajný a jde ho vyměnit.

**Supabase:** spustit `schema.sql`; nová edge funkce `calendar` (soubor `calendar-edge-function.ts`, bez „Verify JWT“).

### Zákaz přibližování na mobilu
- Aplikace se na telefonu nedá přiblížit (nastavení stránky, dvojklep, gesto dvou prstů na iPhonu); pole pro psaní mají písmo aspoň 16 px, aby je iPhone nepřibližoval.

### Nominace zápasu a automatická omluva z tréninku
**Nové**
- Trenér nominaci **potvrdí a uzavře**. Hráče pak nelze měnit, dokud ji znovu neotevře. Rodiče nominovaných dostanou upozornění. Uzavření hlídá i databáze.
- Rodič u zápasu vidí „Nominován(a)“ / „Nenominován(a)“ a až po potvrzení nominace může potvrdit účast.
- Trenér vidí pod zápasem, kdo z nominovaných účast **potvrdil**, kdo se **omluvil** (s důvodem) a kdo **nereagoval**, včetně souhrnu „potvrdilo 5 z 8“.
- U tréninků trenér vidí odpovědi rodičů (souhrn i u každého hráče).
- **Omluva rodiče z tréninku se hráči automaticky zapíše jako „Omluven“** i s důvodem. Vrátí-li rodič odpověď na „přijde“, zruší se. Dřívější omluvy se doplnily zpětně.

**Supabase:** spustit `schema.sql`.

### Zabezpečení
- Přihlášení uživatelé už nemají právo `TRUNCATE`, `REFERENCES` a `TRIGGER` na tabulkách; triggerové funkce nejdou volat přes API; tabulka `events_skip` je pro přihlášené uzavřená; funkce `notif_cat` má pevný `search_path`; nové funkce a tabulky se samy nezpřístupní anonymním.
- Zkontrolováno: ochrana řádků na všech tabulkách, anonymní přístup, oprávnění rolí, edge funkce `admin-users` a `send-push`.
- **Ruční nastavení v Supabase:** vypnout veřejné zakládání účtů (Authentication → Email → „Allow new users to sign up“) a zapnout ochranu proti uniklým heslům (Authentication → Password security).

### Kontakt na trenéry (Přehled rodiče)
- Úplně dole na Přehledu je sekce **Kontakt na trenéry** kategorie dítěte; po rozkliknutí telefon a e-mail. Rodič vidí jen trenéry své kategorie. Telefon si trenér vyplní v Profilu.

**Supabase:** spustit `schema.sql` (funkce `team_coaches`).

---

## 19. 10. 2026

### Import
- **Import docházky:** nová jednoduchá předloha *Jméno hráče / Ročník / Celková účast / Počet tréninků*. Umí i **trenéry** (Post = Trenér, účast se připíše k danému trenérovi) a **zakládá chybějící hráče**.
- Import docházky ve formátu klubové tabulky: absence (0) se ukládá jako **omluvená**.
- **Import hráčů a rodičů je oddělený**, každý má vlastní stahovatelnou předlohu.

### Nastavení a přihlášení
- Nová záložka **⚙ Nastavení**: upozornění do telefonu po kategoriích (chat, soukromé zprávy, zprávy od vedení, tréninky a zápasy, platby), **export statistik do Excelu**, **import docházky** (přesunut od trenérů).
- Přihlášení: **Zůstat přihlášený** a tlačítko pro zobrazení hesla.

### Docházka
- **Stálá absence hráče** (např. každé úterý): u nových tréninků v ten den se předvyplní „Omluven“, trenér ji může opravit.
- Nové barvy docházky: **zelená 70–100 %, žlutá 40–69 %, červená 0–39 %**.
- Oprava: „Moje absence“ trenéra ukazovala „-------“, teď ukazuje procenta, počet a data absencí.

### Zápasy a zprávy
- **Zápas se otevírá jako trénink:** seznam → klepnutí → detail (nominace, výsledek, zrušení, smazání); v kartě je vidět soupeř.
- Oprava: v soukromých zprávách nešlo najít příjemce. Seznam kontaktů má záložní načtení a při chybě aplikace ukáže důvod.

### Správa dat
- Soubor **`reset-data.sql`**: smaže všechna data (hráče, události, docházku, zprávy, platby…), účty, kategorie a nastavení zůstanou.

**Supabase:** spustit `schema.sql` (a podle potřeby `reset-data.sql`).

---

## 17. 10. 2026

### Hřiště a docházka trenérů
- **Hřiště C = Loučka.** Pořadí hřišť: A, B – Umělka, C – Loučka, Hala.
- **Import docházky** z klubové tabulky (Excel) a **docházka trenérů** s kartou „Moje absence“.

### Soukromé zprávy a profil hráče
- **Soukromé zprávy** mezi rodiči, trenéry a vedením s hledáním příjemců.
- Počty účastí u hráčů, mezery v profilu hráče.
- Rodič vidí **profil hráče** (statistiky, absence); Platby jsou pod „Více“.
- U události se zobrazují jen **příjmení trenérů**.

### Mobil
- **Spodní navigační lišta** s nabídkou „Více“ (na počítači zůstává horní lišta).

### Mazání
- Mazání hráčů a úplné mazání tréninků a zápasů (smazaný trénink z rozvrhu se znovu nevytvoří).

### Základ aplikace
- Role **Rodič / Trenér / Vedení / Správce**, správa uživatelů, **import hráčů a rodičů z Excelu**, instalace do telefonu (**PWA**) a **push notifikace**, reset hesla, **souhlas GDPR**, kategorie, **QR platby**, výsledky zápasů, přehled docházky.
- Data a přihlášení běží na **Supabase** (databáze s ochranou řádků, Realtime, edge funkce `admin-users`, `send-push`), aplikace na **GitHub Pages**.
