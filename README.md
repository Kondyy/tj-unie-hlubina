# TJ Unie Hlubina – klubová aplikace

Jednosouborová webová aplikace (`index.html`) napojená na Supabase. Role: **Rodič, Trenér, Vedení, Správce** (Správce smí „všechno“ – i být trenérem kterékoli kategorie a spravovat účty vedení/správců).

| Soubor | K čemu |
|---|---|
| `index.html` | celá aplikace |
| `schema.sql` | databáze + pravidla přístupu (RLS); **lze spouštět opakovaně** |
| `admin-users-edge-function.ts` | Edge Function `admin-users` (zakládání/mazání účtů) |
| `send-push-edge-function.ts` | Edge Function `send-push` (upozornění do telefonu) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | instalace do telefonu (PWA) + push |

V kódu je jen publikovatelný klíč Supabase. Tajný `service_role` klíč sem nikdy nepatří.

## Aktualizace po nové verzi
1. Supabase → **SQL Editor** → vložit celý `schema.sql` → Run.
2. Supabase → **Edge Functions → admin-users** → vložit nový `admin-users-edge-function.ts` → Deploy.
3. GitHub Pages se obnoví samo (v telefonu/PC případně Ctrl+F5).

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
Záložka **Správa → Import**: stáhnout šablonu, vyplnit (Hráč, Kategorie, Číslo dresu, Ročník, Rodič, E-mail rodiče, Telefon rodiče, Heslo), nahrát, zkontrolovat náhled, spustit. Po importu stáhnout Excel s přístupy a předat rodičům – při prvním přihlášení si změní heslo a potvrdí souhlas s GDPR.

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
