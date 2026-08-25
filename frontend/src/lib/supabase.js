// Warstwa Supabase: logowanie linkiem z maila, stan w Postgresie, trener AI w funkcji
// brzegowej. Wszystko, czego wariant z własnym serwerem szuka pod /api/*, tutaj idzie
// prosto z przeglądarki do Supabase — dlatego działa na GitHub Pages, gdzie nic nie chodzi.
//
// Model danych jest celowo taki sam jak w wariancie z serwerem: jeden wiersz na użytkownika,
// całość stanu w kolumnie JSONB. Nie rozbijamy treningów na tabele, bo aplikacja i tak
// operuje na całym stanie naraz (import, kopia, przywracanie), a schemat rozbity na dziesięć
// tabel byłby dziesięcioma miejscami do zmigrowania przy każdej zmianie kształtu danych.
//
// Dostępu pilnuje RLS w bazie (supabase/schema.sql): każdy widzi i zapisuje wyłącznie
// wiersz o swoim `user_id`. Klucz `anon` w paczce jest jawny i to nie jest luka —
// bez ważnego tokenu sesji polityki nie przepuszczą ani odczytu, ani zapisu.

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, HAS_SUPABASE } from './backend.js'

const TABLE = 'states'

let client = null
export function supa() {
  if (!HAS_SUPABASE) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Link z maila wraca z tokenami w adresie; aplikacja chodzi na routerze hashowym,
        // więc sesję wyjmujemy sami w `consumeAuthRedirect` i od razu czyścimy adres.
        detectSessionInUrl: false
      }
    })
  }
  return client
}

/** Zalogowany użytkownik w kształcie, jakiego oczekuje reszta aplikacji, albo null. */
export async function currentUser() {
  const c = supa()
  if (!c) return null
  const { data } = await c.auth.getSession()
  const u = data?.session?.user
  if (!u) return null
  return { id: u.id, name: u.user_metadata?.name || (u.email || '').split('@')[0], email: u.email || '', admin: false }
}

/**
 * Wysyła link logujący. `redirect` musi być dokładnie tym adresem, pod którym stoi
 * aplikacja, i musi być dopisany w Supabase (Authentication → URL Configuration →
 * Redirect URLs) — inaczej Supabase odrzuci powrót, a nie da się tego odgadnąć z błędu.
 */
export async function sendMagicLink(email) {
  const c = supa()
  if (!c) throw new Error('Supabase is not configured')
  const redirect = location.origin + location.pathname
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } })
  if (error) throw new Error(error.message)
}

/**
 * Przechwytuje powrót z linku w mailu. Supabase wrzuca tokeny do fragmentu adresu, a ten
 * sam fragment jest u nas trasą routera — więc czytamy je raz, zapisujemy sesję i czyścimy
 * adres, żeby token nie został w historii przeglądarki ani w zakładce.
 */
export async function consumeAuthRedirect() {
  const c = supa()
  if (!c) return null
  const hash = location.hash || ''
  const q = new URLSearchParams(location.search || '')
  const at = hash.includes('access_token=') ? new URLSearchParams(hash.slice(hash.indexOf('access_token='))) : null

  try {
    if (at?.get('access_token')) {
      const { error } = await c.auth.setSession({
        access_token: at.get('access_token'),
        refresh_token: at.get('refresh_token')
      })
      history.replaceState(null, '', location.pathname + location.search + '#/home')
      if (error) throw new Error(error.message)
      return currentUser()
    }
    // Nowszy przepływ PKCE oddaje jednorazowy kod w query stringu.
    if (q.get('code')) {
      const { error } = await c.auth.exchangeCodeForSession(q.get('code'))
      history.replaceState(null, '', location.pathname + '#/home')
      if (error) throw new Error(error.message)
      return currentUser()
    }
  } catch (e) {
    history.replaceState(null, '', location.pathname + '#/home')
    throw e
  }
  return null
}

export async function signOutSupabase() {
  const c = supa()
  if (c) await c.auth.signOut().catch(() => {})
}

/** Odczyt zapisanego stanu. null = ten użytkownik jeszcze nic nie zapisał. */
export async function pullSupabaseState() {
  const c = supa()
  const user = await currentUser()
  if (!c || !user) return null
  const { data, error } = await c.from(TABLE).select('state').eq('user_id', user.id).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.state || null
}

/** Zapis całego stanu. Wiersz jest jeden na użytkownika, więc to zawsze upsert. */
export async function pushSupabaseState(state) {
  const c = supa()
  const user = await currentUser()
  if (!c || !user) return
  const { error } = await c.from(TABLE)
    .upsert({ user_id: user.id, state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

/**
 * Trener AI. Klucz do Anthropic siedzi w sekretach Supabase i nigdy nie dociera do
 * przeglądarki — funkcja brzegowa jest tu jedynym powodem, dla którego „Zapytaj trenera"
 * może w ogóle działać na hostingu statycznym.
 */
export async function askCoachEdge(payload) {
  const c = supa()
  if (!c) throw new Error('Supabase is not configured')
  const { data, error } = await c.functions.invoke('coach', { body: payload })
  if (error) {
    // Funkcja niewdrożona zwraca 404 — to nie awaria, tylko „ta instalacja nie ma trenera".
    const status = error.context?.status || error.status
    const e = new Error(error.message || 'coach failed')
    e.status = status
    throw e
  }
  return data
}
