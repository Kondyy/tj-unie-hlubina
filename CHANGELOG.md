# Změny v aplikaci TJ Unie Hlubina

Přehled všech změn od nejnovější po nejstarší. U každé verze je napsáno, co je nové, co se opravilo a co je potřeba udělat v Supabase.

Po každé změně databáze spusťte v **Supabase → SQL Editor** celý soubor `schema.sql` (je bezpečné spouštět ho opakovaně) a v aplikaci obnovte stránku (Ctrl+F5).

---

---

## 21. 10. 2026 (večer)

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
