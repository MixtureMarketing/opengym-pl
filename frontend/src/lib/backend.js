// Skąd aplikacja bierze dane i przy czym się loguje.
//
// openGym istnieje w trzech konfiguracjach i do tej pory front zakładał, że zawsze jest
// pod nim serwer Node. Na statycznym hostingu (GitHub Pages) kończyło się to tak, że
// przycisk „Zaloguj kluczem" wysyłał POST do /api/… i dostawał **405 Method Not Allowed**
// od serwera plików statycznych. Stąd ten moduł: tryb jest znany w czasie budowania,
// a ekran logowania pokazuje wyłącznie to, co w danej konfiguracji naprawdę działa.
//
//   server    — własny serwer Node (docker compose / Render). Klucze dostępu, /api/*.
//   supabase  — hosting statyczny + Supabase: logowanie linkiem z maila, dane w Postgresie,
//               trener AI w funkcji brzegowej. Nic własnego nie musi chodzić.
//   local     — hosting statyczny bez Supabase. Wszystko zostaje w tej przeglądarce.
//
// Zmienne VITE_* są podstawiane w czasie budowania, więc nieużywana gałąź wypada z paczki.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Klucz `anon` jest jawny z założenia — jedzie w każdym żądaniu z przeglądarki i nie da się
// go ukryć. Dostępu pilnuje RLS w bazie, nie tajność tego klucza. Klucza `service_role`
// nie wolno tu wstawić nigdy: on omija RLS.
export const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

// Build dla hostingu statycznego ustawia VITE_STATIC=1 — nie ma wtedy czego pytać pod /api.
export const STATIC_BUILD = import.meta.env.VITE_STATIC === '1'

export const MODE = HAS_SUPABASE ? 'supabase' : STATIC_BUILD ? 'local' : 'server'

export const usesServer = MODE === 'server'
export const usesSupabase = MODE === 'supabase'
// Czy w tej konfiguracji w ogóle istnieje konto i synchronizacja między urządzeniami.
export const hasAccounts = MODE !== 'local'
