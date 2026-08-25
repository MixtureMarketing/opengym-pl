// Trener AI — cienka warstwa nad /api/coach.
//
// Model dostaje podsumowanie, nie historię. Trzy powody, w tej kolejności:
//  · prywatność — im mniej wyjeżdża poza serwer, tym lepiej, a pełny log nie jest potrzebny,
//  · rachunek — 2 kB podsumowania kosztuje ułamek tego, co 300 kB zapisów,
//  · jakość — model, który dostaje gotowe liczby, nie ma ich po co przeliczać i zmyślać.
//
// Endpoint istnieje tylko w instalacji z serwerem (klucz API nie może leżeć we froncie),
// więc wszystko tutaj musi umieć zwrócić „nie ma trenera" zamiast się wywalić.

import { api } from './api.js'
import { coachReport } from './coach.js'
import { weeklyVolume } from './coach.js'
import { best1RM } from './onerm.js'
import { EXIDX } from './exercises.js'
import { effortSummary } from './effort.js'
import { getLang } from './i18n.js'

const DAY = 86400000
const round = v => Math.round(v * 10) / 10

/** Ile ćwiczeń trafia do podsumowania. Ponad to prompt rośnie, a wartość nie. */
const TOP_EXERCISES = 8

/**
 * Kompaktowy obraz ostatnich tygodni: tyle, ile trzeba, żeby powiedzieć coś sensownego,
 * i nic ponadto. Angielskie klucze, bo idą do modelu, a nie na ekran.
 */
export function coachSummary(S) {
  const workouts = S.workouts || []
  const recent = workouts.filter(w => (w.start || new Date(w.d).getTime()) > Date.now() - 56 * DAY)

  // Ćwiczenia posortowane po tym, jak często wracają — te rzadkie nic nie mówią o formie.
  const seen = {}
  recent.forEach(w => (w.entries || []).forEach(e => { seen[e.id] = (seen[e.id] || 0) + 1 }))
  const top = Object.keys(seen).sort((a, b) => seen[b] - seen[a]).slice(0, TOP_EXERCISES)

  const exercises = top.map(id => {
    const best = best1RM(S, id)
    const last = [...recent].reverse().find(w => (w.entries || []).some(e => e.id === id))
    const entry = last && last.entries.find(e => e.id === id)
    const sets = (entry?.sets || []).filter(s => s.done)
    return {
      name: EXIDX[id]?.n || id,
      sessions: seen[id],
      lastDate: last?.d || null,
      lastSets: sets.map(s => ({ w: s.w, reps: s.r })).slice(0, 6),
      est1RM: best?.est ?? null
    }
  })

  const bw = (S.bodyweight || []).slice(-8).map(b => ({ d: b.d, w: b.w }))
  const eff = effortSummary(S, 28)

  return {
    unit: S.unit || 'kg',
    effortScale: S.effort || 'none',
    workoutsTotal: workouts.length,
    workoutsLast4Weeks: workouts.filter(w => (w.start || new Date(w.d).getTime()) > Date.now() - 28 * DAY).length,
    weeklyVolume: weeklyVolume(S, 5),
    plannedDaysPerWeek: Object.values(S.week || {}).filter(Boolean).length,
    bodyweight: bw,
    bodyweightGoal: S.targetW ?? null,
    avgRepsInReserve: eff.avg != null ? round(eff.avg) : null,
    exercises
  }
}

/**
 * Pytanie do trenera. Zwraca { text, left } albo rzuca błędem z czytelnym powodem —
 * 501 znaczy „ta instalacja nie ma trenera AI", nie „coś się zepsuło".
 */
export async function askCoach(S, question) {
  const body = {
    question: (question || '').slice(0, 500),
    lang: getLang(),
    summary: coachSummary(S),
    // Ustalenia lokalnego trenera jako angielskie źródła — model widzi to samo, co użytkownik.
    findings: coachReport(S).map(c => ({ level: c.level, title: c.title, detail: c.detail, args: c.args }))
  }
  return api('/api/coach', { method: 'POST', body: JSON.stringify(body) })
}
