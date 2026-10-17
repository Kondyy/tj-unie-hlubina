-- =====================================================================
--  TJ SOKOL – databázové schéma pro Supabase (PostgreSQL)
--
--  JAK POUŽÍT
--    1) Supabase → SQL Editor → New query → vložte celý tento soubor → Run.
--       (Skript je opakovatelný – lze ho spustit znovu po úpravě.)
--    2) Authentication → Providers → Email: vypněte "Allow new users to sign up"
--       (účty zakládá pouze správce přes Edge Function admin-users).
--    3) Vytvořte prvního správce (viz KONEC SOUBORU).
--
--  ROLE (sloupec profiles.role):  p = rodič,  c = trenér,  v = vedení/správce
--
--  OPRÁVNĚNÍ (vynucuje databáze přes Row Level Security – ne jen aplikace):
--    rodič   – vidí jen své přiřazené děti + události/zápasy/chat jejich kategorie
--    trenér  – vidí hráče, události a chat své kategorie
--    vedení  – vidí a spravuje vše (kromě týmových chatů a trenérského deníku)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABULKY
-- ---------------------------------------------------------------------

-- Uživatelé aplikace (1:1 s auth.users). Účet zakládá jen správce.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text not null default '',
  role       text not null default 'p' check (role in ('p','c','v','a')),
  team       text,                                   -- kategorie trenéra (U7, U9…)
  created_at timestamptz not null default now()
);

-- Hráči (členové klubu). Pole "post" se záměrně neeviduje.
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  short_name   text not null unique,                 -- krátké jméno "Adam K." (klíč v aplikaci)
  full_name    text not null,
  team         text not null,                        -- kategorie (U9…)
  jersey_no    int,
  birth_year   int,
  allergies    text not null default '',
  limitations  text not null default '',
  matches      int  not null default 0,
  goals        int  not null default 0,
  att_present  int  not null default 0,              -- docházka z dřívějška (přítomen)
  att_total    int  not null default 0,              -- docházka z dřívějška (celkem)
  doc_status   text not null default 'wait' check (doc_status in ('ok','exp','wait')),  -- zdravotní prohlídka
  photo        text not null default '',             -- fotka (data URL, 256 px)
  parents      jsonb not null default '[{"n":"","ph":"","em":""}]',   -- kontakty rodičů
  created_at   timestamptz not null default now()
);

-- Soukromá poznámka trenéra k hráči (rodič ji nevidí)
create table if not exists public.player_coach (
  player_id    uuid primary key references public.players(id) on delete cascade,
  trainer_note text not null default ''
);

-- Který rodičovský účet patří ke kterému dítěti
create table if not exists public.parent_players (
  parent_id  uuid not null references public.profiles(id) on delete cascade,
  player_id  uuid not null references public.players(id)  on delete cascade,
  primary key (parent_id, player_id)
);

-- Příspěvky a jejich zaplacení
create table if not exists public.pay_items (
  id     bigint generated always as identity primary key,
  name   text not null,
  amount int  not null default 0,
  sort   int  not null default 0
);
create table if not exists public.player_payments (
  player_id uuid   not null references public.players(id)   on delete cascade,
  item_id   bigint not null references public.pay_items(id)  on delete cascade,
  paid      boolean not null default false,
  primary key (player_id, item_id)
);

-- Tréninky a zápasy
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('t','z')),     -- t trénink, z zápas
  team        text not null,
  event_date  date not null,
  time        text not null default '16:00',
  place       text not null default '',
  meet        text not null default '',
  coach       text not null default '',
  opponent    text not null default '',
  cancelled   boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Odehrané zápasy
create table if not exists public.results (
  id         bigint generated always as identity primary key,
  team       text not null,
  played_on  date not null,
  opponent   text not null,
  home       boolean not null default true,
  score_us   int not null default 0,
  score_them int not null default 0,
  scorers    jsonb not null default '{}'               -- {"Adam K.": 2}
);

-- Docházka + omluvy (jeden řádek = hráč × událost)
--   state    – značí trenér:  P přítomen / O omluven / N neomluven
--   response – odpověď rodiče: y zúčastní se / n omluven (+ reason, note)
create table if not exists public.attendance (
  id         bigint generated always as identity primary key,
  event_id   bigint not null references public.events(id)  on delete cascade,
  player_id  uuid   not null references public.players(id) on delete cascade,
  state      text check (state in ('P','O','N')),
  response   text check (response in ('y','n')),
  reason     text,
  note       text,
  carpool    text,                                   -- o1..o4 nabízím místa / s hledám odvoz
  updated_at timestamptz not null default now(),
  unique (event_id, player_id)
);

-- Účast trenéra na akci
create table if not exists public.coach_attendance (
  event_id bigint not null references public.events(id) on delete cascade,
  coach_id uuid   not null default auth.uid() references public.profiles(id) on delete cascade,
  state    text   not null check (state in ('y','n')),
  primary key (event_id, coach_id)
);

-- Nominace hráčů na zápas
create table if not exists public.nominations (
  event_id  bigint not null references public.events(id)  on delete cascade,
  player_id uuid   not null references public.players(id)  on delete cascade,
  primary key (event_id, player_id)
);

-- Trenérský deník (štítky g/r/y)
create table if not exists public.notes (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players(id) on delete cascade,
  tag        text not null check (tag in ('g','r','y')),
  body       text not null,
  author_id  uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Plánovač hřišť (opakující se týdenní rozvrh; day 0 = pondělí, minuty od půlnoci)
create table if not exists public.plan (
  id        bigint generated always as identity primary key,
  day       int  not null check (day between 0 and 6),
  field     text not null,
  team      text not null,
  start_min int  not null,
  end_min   int  not null check (end_min > start_min)
);

-- ---------------------------------------------------------------------
-- Doplňky (verze 2): profil uživatele, vazba trenér → rodič, tréninky z rozvrhu hřišť
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists must_change_password boolean not null default false;   -- true = po přihlášení vynutit změnu hesla
alter table public.profiles add column if not exists created_by uuid references public.profiles(id) on delete set null;   -- kdo účet založil
alter table public.events   add column if not exists plan_id bigint references public.plan(id) on delete set null;       -- trénink vznikl z rozvrhu hřišť
create unique index if not exists events_plan_date_uq on public.events(plan_id, event_date) where plan_id is not null;

-- Týmový chat kategorie
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  team        text not null,
  sender_id   uuid default auth.uid() references public.profiles(id) on delete set null,   -- smazání účtu zprávy nesmaže
  sender_name text not null default '',
  sender_role text not null default '',
  body        text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_team_idx on public.chat_messages(team, id);

-- Zprávy vedení klubu (kind: all / trainers / user)
create table if not exists public.club_messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid default auth.uid() references public.profiles(id) on delete set null,
  sender_name  text not null default '',
  sender_role  text not null default '',
  kind         text not null check (kind in ('all','trainers','user')),
  recipient_id uuid references public.profiles(id) on delete cascade,
  subject      text not null default '',
  body         text not null,
  created_at   timestamptz not null default now()
);

-- Notifikace (zvonek). aud = komu patří:
--   a všem · T všem trenérům · V vedení · C trenérům kategorie "team"
--   P rodičům kategorie "team" · K rodičům dítěte "kid" · U jednomu uživateli (to_user)
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  aud        text not null check (aud in ('a','T','V','C','P','K','U')),
  to_user    uuid references public.profiles(id) on delete cascade,
  team       text,
  kid        text,
  text       text not null,
  tab        text,
  sub        text,
  cnt        int  not null default 1,
  by_user    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.notification_reads (
  notif_id bigint not null references public.notifications(id) on delete cascade,
  user_id  uuid   not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (notif_id, user_id)
);

-- Kam až uživatel zprávy přečetl: cnt = id poslední přečtené zprávy (klíč "U9" = chat kategorie, "inbox" = zprávy od klubu)
create table if not exists public.read_state (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  key     text not null,
  cnt     int  not null default 0,
  primary key (user_id, key)
);


-- ---------------------------------------------------------------------
-- 2. POMOCNÉ FUNKCE (SECURITY DEFINER = obejdou RLS, aby se předešlo rekurzi)
-- ---------------------------------------------------------------------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.app_team() returns text
language sql stable security definer set search_path = public as
$$ select team from public.profiles where id = auth.uid() $$;

create or replace function public.is_mgmt() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('v','a') from public.profiles where id = auth.uid()), false) $$;   -- vedení i správce

-- Správce (role 'a') smí úplně vše, včetně práce za trenéra libovolné kategorie a správy účtů vedení
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'a' from public.profiles where id = auth.uid()), false) $$;

-- Má přihlášený rodič aspoň jedno dítě v kategorii?
create or replace function public.parent_has_team(t text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.parent_players pp join public.players pl on pl.id = pp.player_id
                  where pp.parent_id = auth.uid() and pl.team = t) $$;

-- Smí přihlášený uživatel vidět kategorii (události, zápasy)?
create or replace function public.can_see_team(t text) returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_mgmt()
       or (public.app_role() = 'c' and public.app_team() = t)
       or (public.app_role() = 'p' and public.parent_has_team(t)) $$;

-- Smí přihlášený uživatel psát/číst chat kategorie? (vedení ne)
create or replace function public.can_chat(t text) returns boolean
language sql stable security definer set search_path = public as
$$ select (public.app_role() = 'c' and public.app_team() = t)
       or (public.app_role() = 'c' and t = 'T-' || public.app_team())       -- interní chat trenérů kategorie (team = 'T-U9')
       or public.is_admin()                                                  -- správce smí do všech chatů
       or (public.app_role() = 'p' and public.parent_has_team(t)) $$;

-- Smí přihlášený uživatel vidět hráče?
create or replace function public.can_see_player(pid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_mgmt()
       or exists (select 1 from public.players pl where pl.id = pid and public.app_role() = 'c' and pl.team = public.app_team())
       or exists (select 1 from public.parent_players pp where pp.player_id = pid and pp.parent_id = auth.uid()) $$;

-- Smí přihlášený uživatel upravovat hráče? (trenér své kategorie, vedení)
create or replace function public.can_edit_player(pid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_mgmt()
       or exists (select 1 from public.players pl where pl.id = pid and public.app_role() = 'c' and pl.team = public.app_team()) $$;

-- Smí uživatel vidět notifikaci?
create or replace function public.notif_visible(p_aud text, p_to uuid, p_team text, p_kid text) returns boolean
language sql stable security definer set search_path = public as
$$ select p_to = auth.uid()
       or p_aud = 'a'
       or (p_aud = 'T' and public.app_role() = 'c')
       or (p_aud = 'V' and public.app_role() in ('v','a'))
       or (p_aud = 'C' and public.app_role() = 'c' and public.app_team() = p_team)
       or (p_aud = 'P' and public.app_role() = 'p' and public.parent_has_team(p_team))
       or (p_aud = 'K' and public.app_role() = 'p' and exists (
              select 1 from public.parent_players pp join public.players pl on pl.id = pp.player_id
              where pp.parent_id = auth.uid() and pl.short_name = p_kid)) $$;

-- Trenér smí vidět rodiče, které sám založil nebo kteří mají dítě v jeho kategorii
create or replace function public.coach_sees_parent(pid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select public.app_role() = 'c' and exists (
     select 1 from public.profiles pr where pr.id = pid and pr.role = 'p' and (
       pr.created_by = auth.uid()
       or exists (select 1 from public.parent_players pp join public.players pl on pl.id = pp.player_id
                  where pp.parent_id = pid and pl.team = public.app_team()))) $$;

-- Smí trenér přiřadit/odebrat dítě tomuto rodiči? (dítě z jeho kategorie + rodič, kterého smí vidět)
create or replace function public.coach_can_link(parent uuid, pid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select public.app_role() = 'c'
       and exists (select 1 from public.players pl where pl.id = pid and pl.team = public.app_team())
       and public.coach_sees_parent(parent) $$;

-- Uživatel upraví svůj profil (jméno, telefon). Roli ani e-mail takto změnit nelze.
create or replace function public.update_my_profile(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as
$$ begin
  update public.profiles set name  = coalesce(nullif(btrim(p_name), ''), name),
                             phone = left(btrim(coalesce(p_phone, '')), 40)
   where id = auth.uid();
end $$;

-- Uživatel potvrdí, že si změnil počáteční heslo (heslo samotné mění přímo Supabase Auth)
create or replace function public.password_changed() returns void
language plpgsql security definer set search_path = public as
$$ begin update public.profiles set must_change_password = false where id = auth.uid(); end $$;

-- Smazaný trénink z rozvrhu se nesmí hned znovu vytvořit: zapamatujeme si (rozvrh, datum), které se přeskakují
create table if not exists public.events_skip (plan_id bigint not null, event_date date not null, primary key (plan_id, event_date));
alter table public.events_skip enable row level security;
create or replace function public.events_remember_delete() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  if old.plan_id is not null and old.kind = 't' then
    insert into public.events_skip(plan_id, event_date) values (old.plan_id, old.event_date) on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists events_remember_delete on public.events;
create trigger events_remember_delete before delete on public.events for each row execute function public.events_remember_delete();

-- Z rozvrhu hřišť vytvoří tréninky pro týden začínající week_start (pondělí): každý řádek rozvrhu = jeden trénink
-- kategorie v daný den a čas. Je opakovatelná – existující tréninky nezdvojuje. Vrací počet nově vytvořených.
create or replace function public.sync_plan_events(week_start date) returns int
language plpgsql security definer set search_path = public as
$$ declare n int; begin
  if week_start < current_date - 7 or week_start > current_date + 90 then raise exception 'week out of range'; end if;
  insert into public.events (kind, team, event_date, time, place, meet, coach, opponent, cancelled, plan_id, created_by)
  select 't', p.team, week_start + p.day,
         lpad((p.start_min / 60)::text, 2, '0') || ':' || lpad((p.start_min % 60)::text, 2, '0'),
         case p.field when 'Hala' then 'Hala' when 'B' then 'Hřiště B – Umělka' else 'Hřiště ' || p.field end,
         '15 min předem',
         coalesce((select pr.name from public.profiles pr where pr.role = 'c' and pr.team = p.team order by pr.created_at limit 1), ''),
         '', false, p.id, auth.uid()
    from public.plan p
   where not exists (select 1 from public.events e where e.plan_id = p.id and e.event_date = week_start + p.day)
     and not exists (select 1 from public.events_skip k where k.plan_id = p.id and k.event_date = week_start + p.day)
     and not exists (select 1 from public.events e where e.team = p.team and e.kind = 't' and e.event_date = week_start + p.day
                       and e.time = lpad((p.start_min / 60)::text, 2, '0') || ':' || lpad((p.start_min % 60)::text, 2, '0'))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Doplňky (verze 3): správce, kategorie, souhlasy, variabilní symbol, nastavení, push
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists consent_at timestamptz;                       -- kdy uživatel potvrdil souhlas se zpracováním údajů
alter table public.profiles add column if not exists photo_consent boolean not null default false; -- souhlas s focením dětí
create sequence if not exists public.player_vs_seq start 1001;
alter table public.players add column if not exists vs bigint;                                      -- variabilní symbol plateb hráče
alter table public.players alter column vs set default nextval('public.player_vs_seq');
update public.players set vs = nextval('public.player_vs_seq') where vs is null;
create unique index if not exists players_vs_uq on public.players(vs);

create table if not exists public.teams (            -- kategorie klubu (spravuje vedení)
  name text primary key,
  sort int not null default 0
);
insert into public.teams (name, sort) values ('U7', 7), ('U8', 8), ('U9', 9), ('U11', 11) on conflict do nothing;

create table if not exists public.settings (         -- veřejná nastavení klubu (číslo účtu, VAPID veřejný klíč…)
  key   text primary key,
  value text not null default ''
);

create table if not exists public.app_config (       -- soukromá nastavení (jen databázové funkce): push_url, push_secret
  key   text primary key,
  value text not null default ''
);

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Pojistka: vedení nesmí měnit role vedení/správce ani povyšovat; to smí jen správce
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role and (new.role in ('v','a') or old.role in ('v','a')) then
      raise exception 'Role vedení a správce smí měnit jen správce.';
    end if;
    if old.role in ('v','a') and old.id <> auth.uid() then
      raise exception 'Účty vedení a správce smí upravovat jen správce.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Souhlas se zpracováním údajů (a volitelně s focením)
create or replace function public.save_consent(p_photo boolean) returns void
language plpgsql security definer set search_path = public as
$$ begin
  update public.profiles set consent_at = now(), photo_consent = coalesce(p_photo, false) where id = auth.uid();
end $$;

-- Veřejný VAPID klíč pro push notifikace
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = public as
$$ select value from public.settings where key = 'vapid_public' $$;

-- Komu patří notifikace (pro odeslání push): stejná pravidla jako notif_visible, jen počítaná za všechny uživatele
create or replace function public.notif_recipients(n public.notifications) returns setof uuid
language sql stable security definer set search_path = public as
$$ select distinct u from (
     select n.to_user as u where n.to_user is not null
     union all select id from public.profiles where n.aud = 'a'
     union all select id from public.profiles where n.aud = 'T' and role = 'c'
     union all select id from public.profiles where n.aud = 'V' and role in ('v','a')
     union all select id from public.profiles where n.aud = 'C' and role = 'c' and team = n.team
     union all select pp.parent_id from public.parent_players pp join public.players pl on pl.id = pp.player_id
               where n.aud = 'P' and pl.team = n.team
     union all select pp.parent_id from public.parent_players pp join public.players pl on pl.id = pp.player_id
               where n.aud = 'K' and pl.short_name = n.kid
   ) x where u is not null and u is distinct from n.by_user $$;

-- Po vložení notifikace odešle (pokud je nastavená) Edge Function send-push přes pg_net.
-- Nastavení: viz README – app_config: push_url, push_secret. Chyba odeslání nikdy neblokuje vložení notifikace.
create or replace function public.notifications_push() returns trigger
language plpgsql security definer set search_path = public as
$$ declare url text; sec text; ids uuid[]; begin
  select value into url from public.app_config where key = 'push_url';
  select value into sec from public.app_config where key = 'push_secret';
  if coalesce(url, '') = '' then return new; end if;
  select array_agg(x) into ids from public.notif_recipients(new) x;
  if ids is null then return new; end if;
  perform net.http_post(url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(sec, '')),
    body := jsonb_build_object('user_ids', ids, 'text', new.text, 'tab', new.tab, 'sub', new.sub));
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.notifications_push();

-- Rodič nahraje zdravotní prohlídku → čeká na schválení
create or replace function public.upload_doc(pid uuid) returns void
language plpgsql security definer set search_path = public as
$$ begin
  if not public.can_see_player(pid) then raise exception 'forbidden'; end if;
  update public.players set doc_status = 'wait' where id = pid;
end $$;


-- ---------------------------------------------------------------------
-- 3. TRIGGERY
-- ---------------------------------------------------------------------

-- Nový účet v auth.users → řádek v profiles. Role z metadat se IGNORUJE
-- (jinak by si ji mohl nastavit kdokoli při registraci); roli nastaví správce
-- přes Edge Function / panel Uživatelé.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'p')
  on conflict (id) do nothing;
  return new;
end $$;

-- Pozn.: na auth.users lze vytvořit trigger jen z SQL Editoru (role postgres).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Změna e-mailu v auth.users se přenese do profilu
create or replace function public.sync_user_email() returns trigger
language plpgsql security definer set search_path = public as
$$ begin update public.profiles set email = new.email where id = new.id; return new; end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.sync_user_email();

-- Chat: jméno a role odesílatele doplní databáze (nelze podvrhnout) + upozornění ostatním členům
create or replace function public.chat_before_insert() returns trigger
language plpgsql security definer set search_path = public as
$$ declare p public.profiles; begin
  select * into p from public.profiles where id = auth.uid();
  new.sender_id   := auth.uid();
  new.sender_name := p.name;
  new.sender_role := case p.role when 'c' then 'Trenér' when 'p' then 'Rodič' else 'Vedení' end;
  return new;
end $$;
drop trigger if exists chat_before_insert on public.chat_messages;
create trigger chat_before_insert before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

create or replace function public.chat_after_insert() returns trigger
language plpgsql security definer set search_path = public as
$$ declare r record; n public.notifications; c int; coach_only boolean := new.team like 'T-%'; lbl text; sb text;
begin
  lbl := case when coach_only then 'trenérů ' || substr(new.team, 3) else new.team end;
  sb  := case when coach_only then 'coach' else 'team' end;
  for r in
    select id from public.profiles where role = 'c' and team = case when coach_only then substr(new.team, 3) else new.team end and id <> new.sender_id
    union
    select distinct pp.parent_id from public.parent_players pp join public.players pl on pl.id = pp.player_id
      where not coach_only and pl.team = new.team and pp.parent_id <> new.sender_id
  loop
    -- existující nepřečtené upozornění na chat se sloučí do jednoho
    select * into n from public.notifications x
      where x.aud = 'U' and x.to_user = r.id and x.tab = 'chat' and x.team = new.team
        and not exists (select 1 from public.notification_reads nr where nr.notif_id = x.id and nr.user_id = r.id)
      order by x.id desc limit 1;
    if found then
      c := n.cnt + 1;
      update public.notifications set cnt = c, created_at = now(), by_user = new.sender_id,
        text = format('💬 Chat %s: %s %s (naposledy %s)', lbl, c, case when c < 5 then 'nové zprávy' else 'nových zpráv' end, new.sender_name)
        where id = n.id;
    else
      insert into public.notifications (aud, to_user, team, text, tab, sub, cnt, by_user)
      values ('U', r.id, new.team, format('💬 Chat %s: nová zpráva od %s', lbl, new.sender_name), 'chat', sb, 1, new.sender_id);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists chat_after_insert on public.chat_messages;
create trigger chat_after_insert after insert on public.chat_messages
  for each row execute function public.chat_after_insert();

-- Zprávy vedení: odesílatele doplní databáze
create or replace function public.club_before_insert() returns trigger
language plpgsql security definer set search_path = public as
$$ declare p public.profiles; begin
  select * into p from public.profiles where id = auth.uid();
  new.sender_id := auth.uid(); new.sender_name := p.name; new.sender_role := 'Vedení';
  return new;
end $$;
drop trigger if exists club_before_insert on public.club_messages;
create trigger club_before_insert before insert on public.club_messages
  for each row execute function public.club_before_insert();

-- Docházka: rodič smí měnit jen svou odpověď (response/reason/note/carpool), nikdy značku trenéra (state)
create or replace function public.attendance_guard() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  new.updated_at := now();
  if public.app_role() = 'p' then
    if tg_op = 'INSERT' then new.state := null; else new.state := old.state; end if;
  end if;
  return new;
end $$;
drop trigger if exists attendance_guard on public.attendance;
create trigger attendance_guard before insert or update on public.attendance
  for each row execute function public.attendance_guard();

-- Nová rezervace v rozvrhu hned vytvoří trénink v zobrazovaném týdnu (pondělí týdne podle dneška + 2 dny, jako v aplikaci)
create or replace function public.plan_after_insert() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  perform public.sync_plan_events(date_trunc('week', (now() at time zone 'Europe/Prague')::date + 2)::date);
  return new;
end $$;
drop trigger if exists plan_after_insert on public.plan;
create trigger plan_after_insert after insert on public.plan
  for each row execute function public.plan_after_insert();

-- Zrušení rezervace v rozvrhu smaže i tréninky, které z ní vznikly (od dneška dál)
create or replace function public.plan_before_delete() returns trigger
language plpgsql security definer set search_path = public as
$$ begin delete from public.events where plan_id = old.id and event_date >= current_date; return old; end $$;
drop trigger if exists plan_before_delete on public.plan;
create trigger plan_before_delete before delete on public.plan
  for each row execute function public.plan_before_delete();

-- Role "trenér" musí mít kategorii
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('p','c','v','a'));
alter table public.profiles drop constraint if exists profiles_coach_team;
alter table public.profiles add constraint profiles_coach_team check (role <> 'c' or team is not null);


-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['profiles','players','player_coach','parent_players','pay_items','player_payments',
    'events','results','attendance','coach_attendance','nominations','notes','plan','chat_messages',
    'club_messages','notifications','notification_reads','read_state','teams','settings','app_config','push_subscriptions']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Smaž staré verze pravidel (skript je opakovatelný)
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- profiles: každý vidí sebe, vedení vidí a upravuje všechny (zakládání/mazání jen přes Edge Function)
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_mgmt() or public.coach_sees_parent(id));
create policy profiles_update on public.profiles for update to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

-- kategorie a nastavení: čtou všichni přihlášení, píše vedení; app_config nemá žádné pravidlo (čtou jen databázové funkce)
create policy teams_select    on public.teams    for select to authenticated using (true);
create policy teams_write     on public.teams    for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());
create policy settings_select on public.settings for select to authenticated using (true);
create policy settings_write  on public.settings for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());
create policy push_own        on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- players
-- Pozn.: podmínky jsou zapsané přímo nad sloupci řádku (ne přes funkci can_see_player), aby šel hráč
-- hned po vložení vrátit přes RETURNING – funkce by právě vložený řádek ještě neviděla.
create policy players_select on public.players for select to authenticated using (
  public.is_mgmt()
  or (public.app_role() = 'c' and team = public.app_team())
  or exists (select 1 from public.parent_players pp where pp.player_id = players.id and pp.parent_id = auth.uid()));
create policy players_insert on public.players for insert to authenticated
  with check (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()));
create policy players_update on public.players for update to authenticated
  using (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()))
  with check (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()));
create policy players_delete on public.players for delete to authenticated using (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()));

-- soukromá poznámka trenéra: jen trenér kategorie a vedení
create policy pcoach_all on public.player_coach for all to authenticated
  using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

-- parent_players: vedení spravuje, rodič vidí své
create policy pp_select on public.parent_players for select to authenticated using (parent_id = auth.uid() or public.is_mgmt() or public.can_edit_player(player_id));
create policy pp_write  on public.parent_players for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());
-- trenér přiřazuje děti ze své kategorie rodičům, které založil (nebo kteří už mají dítě v jeho týmu)
create policy pp_coach_insert on public.parent_players for insert to authenticated with check (public.coach_can_link(parent_id, player_id));
create policy pp_coach_delete on public.parent_players for delete to authenticated using (public.coach_can_link(parent_id, player_id));

-- platby
create policy payitems_select on public.pay_items for select to authenticated using (true);
create policy payitems_write  on public.pay_items for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());
create policy ppay_select on public.player_payments for select to authenticated using (public.can_see_player(player_id));
create policy ppay_write  on public.player_payments for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

-- události a výsledky
create policy events_select on public.events for select to authenticated using (public.can_see_team(team));
create policy events_write  on public.events for all    to authenticated
  using (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()))
  with check (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()));
create policy results_select on public.results for select to authenticated using (public.can_see_team(team));
create policy results_write  on public.results for all    to authenticated
  using (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()))
  with check (public.is_mgmt() or (public.app_role() = 'c' and team = public.app_team()));

-- docházka: čtení kdo vidí hráče; zápis rodič (své dítě) / trenér (svůj tým) / vedení
create policy att_select on public.attendance for select to authenticated using (public.can_see_player(player_id));
create policy att_insert on public.attendance for insert to authenticated with check (public.can_see_player(player_id));
create policy att_update on public.attendance for update to authenticated using (public.can_see_player(player_id)) with check (public.can_see_player(player_id));

create policy catt_select on public.coach_attendance for select to authenticated using (coach_id = auth.uid() or public.is_mgmt());
create policy catt_write  on public.coach_attendance for all    to authenticated
  using (coach_id = auth.uid() and public.app_role() in ('c','a')) with check (coach_id = auth.uid() and public.app_role() in ('c','a'));

create policy nom_select on public.nominations for select to authenticated using (public.can_see_player(player_id));
create policy nom_write  on public.nominations for all    to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

-- trenérský deník: jen trenér kategorie
create policy notes_all on public.notes for all to authenticated
  using (public.is_admin() or (public.app_role() = 'c' and exists (select 1 from public.players pl where pl.id = player_id and pl.team = public.app_team())))
  with check (public.is_admin() or (public.app_role() = 'c' and exists (select 1 from public.players pl where pl.id = player_id and pl.team = public.app_team())));

-- plánovač (rozvrh hřišť): čtení vedení + trenéři, zápis vedení
create policy plan_select on public.plan for select to authenticated using (public.app_role() in ('v','a','c'));
create policy plan_write  on public.plan for all    to authenticated using (public.is_mgmt()) with check (public.is_mgmt());

-- chat: jen členové kategorie
create policy chat_select on public.chat_messages for select to authenticated using (public.can_chat(team));
create policy chat_insert on public.chat_messages for insert to authenticated with check (public.can_chat(team));

-- zprávy vedení
create policy club_select on public.club_messages for select to authenticated using (
  public.is_mgmt() or kind = 'all'
  or (kind = 'trainers' and public.app_role() = 'c')
  or (kind = 'user' and recipient_id = auth.uid()));
create policy club_insert on public.club_messages for insert to authenticated with check (public.is_mgmt());

-- notifikace
create policy notif_select on public.notifications for select to authenticated using (public.notif_visible(aud, to_user, team, kid));
create policy notif_insert on public.notifications for insert to authenticated with check (
  by_user = auth.uid() and (
    public.is_mgmt()
    or (public.app_role() = 'c' and aud in ('P','K','V') and (aud <> 'P' or team = public.app_team()))
    or (public.app_role() = 'p' and aud = 'C' and public.parent_has_team(team))));
create policy nread_select on public.notification_reads for select to authenticated using (user_id = auth.uid());
create policy nread_insert on public.notification_reads for insert to authenticated with check (user_id = auth.uid());

create policy rs_all on public.read_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 5. OPRÁVNĚNÍ ROLÍ (RLS je filtruje; anon nemá k datům přístup)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on public.app_config from authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user(), public.sync_user_email() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. REALTIME – okamžité překreslení u všech přihlášených
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['chat_messages','attendance','notifications','events','club_messages','plan',
                           'nominations','player_payments','players','parent_players','profiles','results','teams','settings']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. PRVNÍ SPRÁVCE (spusťte JEDNOU ručně, po vytvoření uživatele)
--    Authentication → Users → Add user (e-mail + heslo, zaškrtněte Auto Confirm),
--    potom nahraďte e-mail a spusťte:
--
--    update public.profiles set role = 'v', name = 'Jan Novák' where email = 'spravce@vas-klub.cz';
--
--    Další účty už zakládá tento správce v aplikaci (záložka Uživatelé).
-- ---------------------------------------------------------------------

-- Aby API hned vidělo nové sloupce a funkce (jinak hlásí „Could not find the column … in the schema cache“)
notify pgrst, 'reload schema';
