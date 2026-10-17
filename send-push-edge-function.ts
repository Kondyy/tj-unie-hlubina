// =====================================================================
//  Supabase Edge Function:  send-push
//  Odesílá push notifikace do telefonů (Web Push). Volá ji databáze (trigger na tabulce notifications
//  přes pg_net) a ověřuje se sdíleným tajemstvím v hlavičce x-push-secret – ne přihlášením uživatele.
//
//  NASAZENÍ – viz README.md, část „Push notifikace“:
//    1) klíče VAPID:  npx web-push generate-vapid-keys
//    2) Secrets funkce:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (např. mailto:vy@email.cz), PUSH_SECRET
//    3) nasadit s vypnutým „Verify JWT“ (volá ji databáze, ne uživatel)
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = Deno.env.get("PUSH_SECRET") ?? "";
  if (!secret || req.headers.get("x-push-secret") !== secret) return new Response("forbidden", { status: 401 });

  let b: { user_ids?: string[]; text?: string; tab?: string; sub?: string };
  try { b = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
  const ids = Array.isArray(b.user_ids) ? b.user_ids : [];
  if (!ids.length) return new Response("no recipients", { status: 200 });

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id", ids);

  const payload = JSON.stringify({ title: "TJ Unie Hlubina", body: String(b.text ?? "").slice(0, 200), tab: b.tab ?? "", sub: b.sub ?? "" });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);   // odhlášené zařízení
    }
  }));
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
