import { describe, it, expect, vi, afterEach } from 'vitest'

// Regresja, przez którą powstał ten moduł: build na GitHub Pages pokazywał logowanie
// kluczem dostępu, kliknięcie wysyłało POST do /api/… i serwer plików statycznych
// odpowiadał 405. Tryb musi więc wychodzić z konfiguracji budowania, nie z założenia,
// że pod aplikacją zawsze stoi serwer.
const load = async env => {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('./backend.js')
}

afterEach(() => vi.unstubAllEnvs())

describe('backend — wybór trybu', () => {
  it('domyślnie zakłada własny serwer', async () => {
    const b = await load({ VITE_STATIC: '', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' })
    expect(b.MODE).toBe('server')
    expect(b.usesServer).toBe(true)
    expect(b.hasAccounts).toBe(true)
  })

  it('build statyczny bez bazy nie ma kont — i nie ma czego wysłać pod /api', async () => {
    const b = await load({ VITE_STATIC: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' })
    expect(b.MODE).toBe('local')
    expect(b.hasAccounts).toBe(false)
    expect(b.usesServer).toBe(false)
  })

  it('komplet danych Supabase wygrywa z buildem statycznym', async () => {
    const b = await load({
      VITE_STATIC: '1',
      VITE_SUPABASE_URL: 'https://przyklad.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-klucz'
    })
    expect(b.MODE).toBe('supabase')
    expect(b.usesSupabase).toBe(true)
    expect(b.hasAccounts).toBe(true)
  })

  it('sam adres bez klucza to nie konfiguracja — zostaje tryb bez kont', async () => {
    const b = await load({ VITE_STATIC: '1', VITE_SUPABASE_URL: 'https://przyklad.supabase.co', VITE_SUPABASE_ANON_KEY: '' })
    expect(b.HAS_SUPABASE).toBe(false)
    expect(b.MODE).toBe('local')
  })
})
