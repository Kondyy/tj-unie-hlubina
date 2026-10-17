# TJ Unie Hlubina – klubová aplikace

Jednosouborová webová aplikace (`index.html`) napojená na Supabase. Role: Rodič, Trenér, Vedení.

- `index.html` – celá aplikace (otevře se přímo v prohlížeči)
- `schema.sql` – databázové schéma + pravidla přístupu (RLS); lze spouštět opakovaně v Supabase SQL Editoru
- `admin-users-edge-function.ts` – Edge Function `admin-users` (zakládání/mazání účtů)

V kódu je jen publikovatelný klíč Supabase. Tajný `service_role` klíč sem nikdy nepatří.
