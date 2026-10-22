# TJ Unie Hlubina – klubová aplikace

Webová aplikace (`index.html` + `css/` + `js/`) napojená na Supabase. Role: **Rodič, Trenér, Vedení, Správce** (Správce smí „všechno“ – i být trenérem kterékoli kategorie a spravovat účty vedení/správců).

| Soubor | K čemu |
|---|---|
| `index.html` | stránka aplikace (načte styly a skripty níže) |
| `css/app.css` | vzhled (barvy klubu, světlý a tmavý režim) |
| `js/zaklad.js` → `js/data.js` → `js/moduly.js` → `js/doplnky.js` → `js/vzhled.js` → `js/app.js` | kód aplikace (načítá se v tomto pořadí; po úpravě zvyšte `?v=…` v `index.html`) |
| `.github/workflows/keepalive.yml` | každé 3 dny „probudí“ Supabase, aby se bezplatný projekt neuspal |
| `.github/workflows/backup.yml` | každý týden šifrovaná záloha databáze (viz Zálohy) |
| `schema.sql` | databáze + pravidla přístupu (RLS); **lze spouštět opakovaně** |
| `admin-users-edge-function.ts` | Edge Function `admin-users` (zakládání/mazání účtů) |
| `send-push-edge-function.ts` | Edge Function `send-push` (upozornění do telefonu) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | instalace do telefonu (PWA) + push |

V kódu je jen publikovatelný klíč Supabase. Tajný `service_role` klíč sem nikdy nepatří.

## Aktualizace po nové verzi
1. Supabase → **SQL Editor** → vložit celý `schema.sql` → Run.
2. Supabase → **Edge Functions → admin-users** → vložit nový `admin-users-edge-function.ts` → Deploy.
3. GitHub Pages se obnoví samo (v telefonu/PC případně Ctrl+F5).

## Zálohy databáze (GitHub Actions, zdarma)
Bezplatný Supabase automatické zálohy nedělá. Úloha **Záloha databáze** to každou noc na pondělí udělá za vás – potřebuje jednou nastavit dva tajné údaje:
1. Supabase → **Connect** (nahoře) → **Session pooler** → zkopírujte URI (`postgresql://postgres.sbiweuhxsemjcvmwavwa:[HESLO]@aws-…pooler.supabase.com:5432/postgres`) a místo `[HESLO]` doplňte heslo databáze (Project Settings → Database → Reset password, pokud ho neznáte).
2. GitHub → repozitář → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = URI z bodu 1,
   - `BACKUP_PASSPHRASE` = libovolné dlouhé heslo (uložte si ho, bez něj zálohu neotevřete).
3. GitHub → **Actions → Záloha databáze → Run workflow** (první záloha hned). Hotová záloha je ke stažení dole u běhu (Artifacts), drží se 90 dní.

Obnova: `gpg -d zaloha-….sql.gz.gpg | gunzip > zaloha.sql` a soubor spustit přes `psql` (nebo poslat správci). Excel se zálohou v aplikaci (Správa → Záloha dat) zůstává jako druhá možnost.

**Udržení v chodu:** úloha **Udržení Supabase v chodu** běží sama každé 3 dny (nic nastavovat netřeba). Když GitHub úlohy v repozitáři bez změn po 60 dnech pozastaví, stačí v Actions kliknout „Enable workflow“.

## Ochrana přihlášení (volitelné, zdarma)
Ověření „nejsem robot“ na přihlášení a obnově hesla (Cloudflare Turnstile):
1. https://dash.cloudflare.com → **Turnstile → Add widget**: název „Unie Hlubina“, doména `kondyy.github.io`, režim **Managed**. Získáte **Site key** a **Secret key**.
2. V aplikaci **Správa → 🛡 Ochrana přihlášení** vložte **Site key** → Uložit.
3. Supabase → **Authentication → Attack Protection → Enable Captcha protection** → Turnstile → vložte **Secret key** → Save.
Pořadí je důležité (nejdřív klíč v aplikaci, pak Supabase), jinak by se nikdo nepřihlásil. Vypnutí: obráceně.

## První Správce
Po spuštění SQL v SQL Editoru:
```sql
update public.profiles set role = 'a' where email = 'VAS@EMAIL.CZ';
```
Další vedení a správce pak zakládá Správce v záložce **Uživatelé**.

## Obnova zapomenutého hesla
Supabase → **Authentication → URL Configuration**: *Site URL* = adresa aplikace (GitHub Pages), a do *Redirect URLs* ji přidat také. Bez toho e-mail s odkazem povede jinam.

## Push notifikace (volitelné)
1. Klíče: `npx web-push generate-vapid-keys`.
2. Edge Functions → **Create function `send-push`** (kód ze `send-push-edge-function.ts`), **vypnout „Verify JWT“**.
   Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (např. `mailto:vy@email.cz`), `PUSH_SECRET` (libovolný dlouhý náhodný řetězec).
3. Database → Extensions → zapnout **pg_net**.
4. SQL Editor:
```sql
insert into public.app_config(key, value) values
  ('push_url',    'https://<PROJECT>.supabase.co/functions/v1/send-push'),
  ('push_secret', '<stejné jako PUSH_SECRET>')
on conflict (key) do update set value = excluded.value;
insert into public.settings(key, value) values ('vapid_public', '<VAPID_PUBLIC_KEY>')
on conflict (key) do update set value = excluded.value;
```
5. Každý uživatel si upozornění zapne v **Můj profil → Zapnout upozornění**. Na iPhonu nejdřív *Sdílet → Přidat na plochu* (iOS 16.4+).

## Import hráčů a rodičů (Vedení / Správce)
Záložka **Správa** má dva oddělené importy, každý s vlastní předlohou ke stažení:
1. **Import hráčů** – Jméno hráče, Kategorie, Číslo dresu, Ročník. Hráč, který už v kategorii je, se přeskočí.
2. **Import rodičů** – Rodič, E-mail, Telefon, Heslo (nepovinné), Jméno hráče (dítě), Kategorie. Dítě už musí být v soupisce, proto se nejdřív importují hráči. Předloha rodičů už obsahuje soupisku, stačí doplnit rodiče; sourozenci = více řádků se stejným e-mailem.
Po importu rodičů stáhnout Excel s přístupy a předat rodičům – při prvním přihlášení si změní heslo a potvrdí souhlas s GDPR.

## Nastavení, import docházky a vymazání dat
- Záložka **Nastavení** (všechny role): zapnutí upozornění v telefonu a výběr, co má chodit (chat, soukromé zprávy, zprávy vedení, tréninky a zápasy, platby), export statistik do Excelu a – pro trenéry a vedení – import docházky: stáhnete předlohu (Jméno hráče | Ročník | Celková účast | Počet tréninků), doplníte a nahrajete; podporovaná je i původní klubová tabulka s daty a hodnotami 1/0.
- **Stálá absence**: v detailu hráče (Soupiska) lze nastavit dny, kdy hráč pravidelně nemůže; nové tréninky v ten den mají předvyplněno „Omluven“.
- **Vymazání všech dat** klubu (hráči, události, docházka, platby, zprávy…): spusťte `reset-data.sql` v SQL Editoru (účty a kategorie zůstanou). Nejdřív spusťte aktuální `schema.sql`.

## Kontrolní seznam před ostrým provozem (pilot U9)
- [ ] SQL spuštěné, `admin-users` nasazená, první Správce nastaven
- [ ] Auth: Site URL + Redirect URL, vypnutá veřejná registrace
- [ ] Supabase: zapnuté automatické zálohy; jednou měsíčně stáhnout zálohu v **Správa → Záloha dat**
- [ ] Zkušební rodič: přihlášení, změna hesla, souhlas, vidí jen své dítě, zapnutá upozornění
- [ ] Zkušební trenér: trénink z rozvrhu, docházka, nominace, výsledek zápasu se střelci, chat trenérů
- [ ] Vedení: platby (QR s variabilním symbolem), přehled docházky + export, import hráčů
- [ ] Číslo účtu klubu vyplněné ve **Správa → Číslo účtu**
- [ ] Rodiče dostali přístupy a návod „Přidat na plochu“

### Kontakt na trenéry
Rodič vidí v záložce Přehled úplně dole jména trenérů kategorie svého dítěte; po rozkliknutí telefon a e-mail (telefon si trenér vyplní v Profilu). Vyžaduje znovu spustit `schema.sql` (funkce `team_coaches`).

### Nominace zápasu a omluvy
Trenér v detailu zápasu vybere hráče a klepne na „Potvrdit nominaci“: nominace se uzavře (hráče nelze měnit, dokud ji trenér znovu neotevře) a rodiče nominovaných dostanou upozornění. Rodič u zápasu vidí „Nominován(a)“ / „Nenominován(a)“; trenér pod zápasem vidí, kdo z nominovaných účast potvrdil, kdo se omluvil (s důvodem) a kdo ještě nereagoval. U tréninků se omluva rodiče hráči automaticky zapíše jako „Omluven“ i s důvodem. Vyžaduje znovu spustit `schema.sql`.

### Omluva na delší dobu a kalendář
- **Omluva na delší dobu:** rodič (na Přehledu) nebo trenér (v detailu hráče) zadá období od–do a důvod. Všechny tréninky a zápasy hráče v něm se automaticky omluví (u tréninků „Omluven“), i ty, které trenér přidá později. Zrušením omluvy se vrátí jen to, co vzniklo automaticky.
- **Kalendář v telefonu:** Nastavení → Kalendář v telefonu → Vytvořit odkaz. Odkaz (ICS) obsluhuje edge funkce `calendar` (`calendar-edge-function.ts`, nasazená **bez** Verify JWT; ochrana je tajný token z tabulky `calendar_tokens`, v Nastavení ho lze vyměnit). Vyžaduje znovu spustit `schema.sql`.
