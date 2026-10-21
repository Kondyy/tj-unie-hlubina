// =====================================================================
//  Supabase Edge Function:  calendar
//  Odkaz (ICS) pro kalendář v telefonu: tréninky a zápasy kategorie uživatele, v kalendáři se samy aktualizují.
//  Odkaz je tajný (token z tabulky calendar_tokens, každý uživatel má svůj, lze ho v Nastavení vyměnit),
//  proto se nasazuje s VYPNUTÝM „Verify JWT“ – kalendář v telefonu se nepřihlašuje.
//    rodič → kategorie jeho dětí · trenér → jeho kategorie · vedení a správce → všechny kategorie
//
//  NASAZENÍ:  supabase functions deploy calendar --no-verify-jwt
//  nebo v Dashboardu: Edge Functions → Deploy a new function → vložte kód a vypněte „Verify JWT“.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

type Ev = { id: number; kind: string; team: string; event_date: string; time: string; place: string; meet: string; coach: string; opponent: string; cancelled: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const esc = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Řádek ICS maximálně 75 bajtů, delší se zalomí (RFC 5545). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = []; let cur = "", len = 0, first = true;
  for (const ch of line) {
    const l = enc.encode(ch).length, lim = first ? 75 : 74;
    if (len + l > lim) { out.push(cur); cur = ch; len = l; first = false; } else { cur += ch; len += l; }
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Čas „16:00“ (nebo „16.00“) → [hodiny, minuty]; když se nedá přečíst, je to 16:00. */
export function parseTime(t: string): [number, number] {
  const m = /(\d{1,2})[:.](\d{2})/.exec(t ?? "");
  return m ? [Math.min(+m[1], 23), Math.min(+m[2], 59)] : [16, 0];
}

const local = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;

/** Sestaví kalendář. Časy jsou „plovoucí“ (místní čas telefonu), takže se nemusí řešit časové pásmo. */
export function buildIcs(events: Ev[], now: Date = new Date()): string {
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TJ Unie Hlubina//Kalendar//CS", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:TJ Unie Hlubina", "X-WR-TIMEZONE:Europe/Prague", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  for (const e of events) {
    const [y, mo, d] = e.event_date.split("-").map(Number);
    const [hh, mm] = parseTime(e.time);
    const start = new Date(Date.UTC(y, mo - 1, d, hh, mm));
    const end = new Date(start.getTime() + (e.kind === "z" ? 120 : 90) * 60000);
    const title = (e.kind === "z" ? `🏆 Zápas ${e.team}${e.opponent ? " vs. " + e.opponent : ""}` : `⚽ Trénink ${e.team}`);
    const desc = [e.meet ? `Sraz: ${e.meet}` : "", e.coach ? `Trenér: ${e.coach}` : ""].filter(Boolean).join("\n");
    L.push("BEGIN:VEVENT", `UID:event-${e.id}@tj-unie-hlubina`, `DTSTAMP:${dtstamp}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`,
      `SUMMARY:${esc((e.cancelled ? "ZRUŠENO: " : "") + title)}`);
    if (e.place) L.push(`LOCATION:${esc(e.place)}`);
    if (desc) L.push(`DESCRIPTION:${esc(desc)}`);
    L.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: tok } = await admin.from("calendar_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tok) return new Response("Not found", { status: 404 });
  const { data: me } = await admin.from("profiles").select("role,team").eq("id", tok.user_id).maybeSingle();
  if (!me) return new Response("Not found", { status: 404 });

  let teams: string[] | null = null;                                   // null = všechny kategorie
  if (me.role === "p") {
    const { data } = await admin.from("parent_players").select("players(team)").eq("parent_id", tok.user_id);
    teams = [...new Set((data ?? []).map((r: any) => r.players?.team).filter(Boolean))] as string[];
  } else if (me.role === "c") {
    teams = me.team ? [me.team] : [];
  }

  const day = (off: number) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
  let events: Ev[] = [];
  if (!teams || teams.length) {
    let q = admin.from("events").select("*").gte("event_date", day(-14)).lte("event_date", day(240)).order("event_date");
    if (teams) q = q.in("team", teams);
    const { data } = await q;
    events = (data ?? []) as Ev[];
  }
  return new Response(buildIcs(events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="unie.ics"', "Cache-Control": "no-cache" },
  });
});
