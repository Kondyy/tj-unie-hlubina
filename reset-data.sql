-- =====================================================================
--  VYMAZÁNÍ VŠECH DAT KLUBU (hráči, tréninky, zápasy, docházka, platby, zprávy, upozornění, rozvrh)
--  Zůstanou: přihlašovací účty (uživatelé), kategorie, nastavení (číslo účtu, push klíče) a definice příspěvků.
--  NELZE VRÁTIT. Před spuštěním si v aplikaci (Správa → Záloha) stáhněte zálohu.
--  Spusťte v Supabase → SQL Editor.
-- =====================================================================
truncate table
  public.attendance, public.coach_attendance, public.nominations, public.results,
  public.events_skip, public.events, public.plan,
  public.notes, public.player_payments, public.player_absence, public.parent_players, public.players,
  public.chat_messages, public.club_messages, public.direct_messages,
  public.notification_reads, public.notifications, public.read_state
restart identity cascade;

-- Volitelně (odkomentujte): smazat i definice příspěvků (členský příspěvek apod.)
-- truncate table public.pay_items restart identity cascade;

-- Volitelně (odkomentujte): smazat i účty RODIČŮ (trenéři, vedení a správce zůstanou).
-- Pozor: smaže přihlašovací účty rodičů, budete je zakládat znovu (nebo importem z Excelu).
-- delete from auth.users where id in (select id from public.profiles where role = 'p');
