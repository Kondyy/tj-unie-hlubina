// =====================================================================
//  Supabase Edge Function:  admin-users
//  Zakládání, změna hesla/e-mailu a mazání uživatelských účtů.
//  Vedení smí vše. Trenér smí JEN založit účet role Rodič a přiřadit mu děti ze své kategorie.
//
//  PROČ EDGE FUNCTION: k vytvoření/smazání účtu je potřeba klíč service_role, který
//  se NIKDY nesmí dostat do HTML aplikace. Klíč zná jen tato funkce (Supabase ho
//  do ní doplní automaticky jako SUPABASE_SERVICE_ROLE_KEY).
//
//  NASAZENÍ (Supabase CLI):
//    supabase functions new admin-users          → obsah souboru nahraďte tímto kódem
//    supabase functions deploy admin-users       (nechte zapnuté "Verify JWT")
//  nebo v Dashboardu: Edge Functions → Deploy a new function → vložte tento kód.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Povolena je jen metoda POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1) kdo volá? (ověření JWT z hlavičky) a je to vedení?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller?.user) return json({ error: "Nejste přihlášeni." }, 401);
  const { data: me } = await admin.from("profiles").select("role,team").eq("id", caller.user.id).single();
  const isMgmt = me?.role === "v", isCoach = me?.role === "c" && !!me?.team;
  if (!isMgmt && !isCoach) return json({ error: "Tuto akci smí provést jen vedení klubu nebo trenér." }, 403);

  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: "Neplatný požadavek." }, 400); }
  // trenér: jen vytvoření rodiče
  if (!isMgmt && !(b.action === "create" && String(b.role ?? "") === "p"))
    return json({ error: "Trenér smí zakládat jen účty rodičů." }, 403);

  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim();
  const role = String(b.role ?? "");
  const team = String(b.team ?? "").trim();
  const password = String(b.password ?? "");

  // 2) akce
  if (b.action === "create") {
    if (!name) return json({ error: "Vyplňte jméno." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Neplatný e-mail." }, 400);
    if (password.length < 8) return json({ error: "Heslo musí mít aspoň 8 znaků." }, 400);
    if (!["p", "c", "v"].includes(role)) return json({ error: "Neplatná role." }, 400);
    if (role === "c" && !team) return json({ error: "Trenér musí mít kategorii (např. U9)." }, 400);

    // děti: trenér smí přiřadit jen hráče své kategorie
    const kids: string[] = Array.isArray(b.kids) ? [...new Set<string>(b.kids.map(String))] : [];   // id hráčů (uuid)
    if (!isMgmt) {
      if (!kids.length) return json({ error: "Vyberte alespoň jedno dítě." }, 400);
      const { data: pl } = await admin.from("players").select("id").in("id", kids).eq("team", me!.team);
      if ((pl?.length ?? 0) !== kids.length) return json({ error: "Můžete přiřadit jen hráče své kategorie." }, 403);
    }

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (error || !data.user) {
      const dup = /already|registered|exists/i.test(error?.message ?? "");
      return json({ error: dup ? "Uživatel s tímto e-mailem už existuje." : (error?.message ?? "Účet se nepodařilo vytvořit.") }, 400);
    }
    // role a kategorii nastavuje výhradně tato funkce (trigger ve výchozím stavu zakládá rodiče)
    const base = { id: data.user.id, email, name, role, team: role === "c" ? team : null };
    let { error: pErr } = await admin.from("profiles").upsert({ ...base, must_change_password: true, created_by: caller.user.id });
    // databáze ještě nemá nové sloupce (nespuštěné aktualizované SQL) → zkusit bez nich, účet se nesmí ztratit
    if (pErr && /must_change_password|created_by|schema cache/i.test(pErr.message))
      ({ error: pErr } = await admin.from("profiles").upsert(base));
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id);       // vrátit zpět, ať nevznikne účet bez profilu
      return json({ error: pErr.message }, 400);
    }
    if (kids.length) {
      const { error: kErr } = await admin.from("parent_players")
        .insert(kids.map((player_id) => ({ parent_id: data.user!.id, player_id })));
      if (kErr) { await admin.auth.admin.deleteUser(data.user.id); return json({ error: kErr.message }, 400); }
    }
    return json({ ok: true, id: data.user.id });
  }

  if (b.action === "update") {
    const id = String(b.id ?? "");
    if (!id) return json({ error: "Chybí id uživatele." }, 400);
    const patch: Record<string, unknown> = {};
    if (email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Neplatný e-mail." }, 400);
      patch.email = email; patch.email_confirm = true;
    }
    if (password) {
      if (password.length < 8) return json({ error: "Heslo musí mít aspoň 8 znaků." }, 400);
      patch.password = password;
    }
    if (name) patch.user_metadata = { name };
    if (Object.keys(patch).length) {
      const { error } = await admin.auth.admin.updateUserById(id, patch);
      if (error) return json({ error: error.message }, 400);
    }
    const prof: Record<string, unknown> = {};
    if (email) prof.email = email;
    if (name) prof.name = name;
    const flagPw = !!password;                           // heslo nastavil admin → uživatel si ho musí změnit
    if (role) {
      if (!["p", "c", "v"].includes(role)) return json({ error: "Neplatná role." }, 400);
      if (id === caller.user.id && role !== "v") return json({ error: "Sami sobě nemůžete odebrat roli vedení." }, 400);
      prof.role = role; prof.team = role === "c" ? team || null : null;
      if (role === "c" && !team) return json({ error: "Trenér musí mít kategorii." }, 400);
    }
    if (Object.keys(prof).length) {
      const { error } = await admin.from("profiles").update(prof).eq("id", id);
      if (error) return json({ error: error.message }, 400);
    }
    if (flagPw) await admin.from("profiles").update({ must_change_password: true }).eq("id", id);   // bez chyby, pokud sloupec ještě není
    return json({ ok: true });
  }

  if (b.action === "delete") {
    const id = String(b.id ?? "");
    if (!id) return json({ error: "Chybí id uživatele." }, 400);
    if (id === caller.user.id) return json({ error: "Sami sebe smazat nemůžete." }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);   // profil a vazby na děti se smažou kaskádně
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Neznámá akce." }, 400);
});
