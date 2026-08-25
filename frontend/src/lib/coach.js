// Trener — warstwa, która czyta historię i mówi, kiedy coś nie trzyma się kupy.
//
// Wszystko tutaj to czyste funkcje stanu: nic nie zapisuje, nic nie liczy „na boku"
// i nie trzyma własnych liczników, które mogłyby się rozjechać z logiem. Ten sam wybór
// co w progression.js — ocena jest zawsze wyprowadzana z tego, co faktycznie zapisane,
// więc poprawka literówki w serii natychmiast daje poprawną ocenę.
//
// Nie zastępuje progresji: progression.js mówi „ile następnym razem", trener mówi
// „to, co właśnie wpisałeś, jest o tyle poza tym, co dotąd robiłeś". Dlatego wynik jest
// zawsze porównaniem z historią, a nie z tabelą norm — norma dla kogoś innego nic
// nie mówi o twojej sztandze.
//
// Teksty wracają jako angielskie źródła + argumenty, dokładnie jak w `why` z progresji,
// żeby warstwa widoku mogła je przepuścić przez t() i żeby testy nie zależały od języka.

import { defaultIncrement } from './progression.js'
import { estimate1RM, best1RM } from './onerm.js'
import { sessionsFor } from './progression.js'
import { modeOf, workoutVolume } from './history.js'
import { rirOf } from './effort.js'
import { loadOfWorkouts, MUSCLE_NAME } from './muscles.js'
import { EXIDX } from './exercises.js'

const DAY = 86400000

// Poziomy ostrzeżeń. 'stop' = to prawie na pewno się nie uda albo skończy kontuzją,
// 'warn' = da się, ale to więcej niż zwykle robisz, 'info' = obserwacja, nie ostrzeżenie.
export const LEVELS = { stop: 3, warn: 2, info: 1 }
export const worst = list => list.reduce((a, c) => (LEVELS[c.level] > LEVELS[a] ? c.level : a), null)

const pct = (a, b) => (b > 0 ? (a - b) / b * 100 : 0)
const round1 = v => Math.round(v * 10) / 10
const daysSince = ts => Math.floor((Date.now() - ts) / DAY)
const tsOf = w => w.start || new Date(w.d).getTime()

/**
 * Ostatnia sesja tego ćwiczenia, w której cokolwiek podniesiono.
 * Sesje bez ciężaru (masa własna) nie mają tu czego porównywać.
 */
function lastLoaded(S, cfg) {
  const sessions = sessionsFor(S, cfg.id, cfg).filter(s => s.mode === modeOf(cfg) && s.weight > 0)
  return sessions[sessions.length - 1] || null
}

/**
 * Czy skok ciężaru jest za duży?
 *
 * Dwa niezależne sita, bo każde samo w sobie kłamie:
 *  · procent — 2,5 kg na wyciskaniu 20 kg to 12,5 %, na przysiadzie 140 kg to 1,8 %,
 *  · krotność standardowego przyrostu — chroni lekkie ćwiczenia przed fałszywym alarmem
 *    („podniosłeś o jeden zwykły krok") i łapie na ciężkich to, czego procent nie złapie.
 *
 * Ostrzega dopiero powyżej obu progów naraz, więc normalna progresja jest cicha.
 * `reps` jest opcjonalne — jeśli je podasz, dochodzi trzecie sito: czy przy tej liczbie
 * powtórzeń wynik nie wymagałby rekordu życiowego.
 */
export function checkJump(S, cfg, weight, reps) {
  const w = Number(weight)
  if (!isFinite(w) || w <= 0 || !cfg?.id) return null
  const last = lastLoaded(S, cfg)
  if (!last) return null
  const diff = w - last.weight
  if (diff <= 0) return null

  const inc = cfg.inc > 0 ? cfg.inc : defaultIncrement(cfg.id, S.unit || 'kg')
  const steps = inc > 0 ? diff / inc : 0
  const p = pct(w, last.weight)
  const unit = S.unit || 'kg'

  let level = null
  if (steps >= 3 && p >= 12) level = 'stop'
  else if (steps > 1.5 && p >= 6) level = 'warn'

  // Przy równym poziomie wygrywa ocena po 1RM: „to o 20 % ponad twój rekord" mówi więcej
  // niż „to o 20 % więcej niż ostatnio", bo uwzględnia powtórzenia, a nie sam ciężar.
  const oneRm = checkAgainst1RM(S, cfg, w, reps)
  if (oneRm && (!level || LEVELS[oneRm.level] >= LEVELS[level])) return oneRm
  if (!level) return null

  return {
    id: 'jump',
    level,
    from: last.weight,
    to: w,
    pct: round1(p),
    title: 'Big jump in weight',
    detail: 'Last time {0} {1} — now {2} {1}, that is {3} % more. Two smaller steps hold better than one that stalls you for three sessions.',
    args: [round1(last.weight), unit, round1(w), round1(p)]
  }
}

/**
 * Czy ten ciężar przy tej liczbie powtórzeń nie wymaga rekordu życiowego?
 *
 * Porównanie idzie przez szacowany 1RM, bo tylko ono uczciwie zestawia 80×5 z 100×2.
 * Margines 3 % to szum samego wzoru — poniżej niego nie ma o czym mówić.
 */
export function checkAgainst1RM(S, cfg, weight, reps) {
  if (!reps || !cfg?.id) return null
  const need = estimate1RM(weight, reps)
  const best = best1RM(S, cfg.id)
  if (need == null || !best) return null
  const over = pct(need, best.est)
  if (over < 3) return null
  return {
    id: '1rm',
    level: over >= 10 ? 'stop' : 'warn',
    title: 'Above your best',
    detail: '{0} × {1} works out to about {2} {3} for a single — {4} % over your best of {5} {3}. Doable on a great day, not on a normal one.',
    args: [round1(weight), reps, need, S.unit || 'kg', round1(over), best.est]
  }
}

/** Ile dni minęło od ostatniej sesji tego ćwiczenia; null, jeśli nigdy go nie było. */
export function daysOff(S, exId) {
  const done = (S.workouts || []).filter(w => (w.entries || []).some(e => e.id === exId && (e.sets || []).some(s => s.done)))
  if (!done.length) return null
  return daysSince(tsOf(done[done.length - 1]))
}

/** Tonaż tygodniami, od najstarszego. `weeks` to liczba pełnych 7-dniowych okien wstecz. */
export function weeklyVolume(S, weeks = 5) {
  const now = Date.now()
  const out = []
  for (let i = weeks - 1; i >= 0; i--) {
    const to = now - i * 7 * DAY
    const from = to - 7 * DAY
    const vol = (S.workouts || [])
      .filter(w => { const t = tsOf(w); return t > from && t <= to })
      .reduce((a, w) => a + (w.vol ?? workoutVolume(w)), 0)
    out.push(Math.round(vol))
  }
  return out
}

/** Średni RIR z okna dni — niższy znaczy bliżej upadku. null, gdy za mało ocenionych serii. */
function avgRirWindow(S, days, minRated = 8) {
  const from = Date.now() - days * DAY
  const vs = []
  ;(S.workouts || []).forEach(w => {
    if (tsOf(w) < from) return
    ;(w.entries || []).forEach(e => (e.sets || []).forEach(s => {
      if (!s.done) return
      const r = rirOf(s)
      if (r != null) vs.push(r)
    }))
  })
  return vs.length >= minRated ? vs.reduce((a, b) => a + b, 0) / vs.length : null
}

/** Ile dni treningowych z rzędu, licząc wstecz od ostatniego treningu. */
function streakDays(S) {
  const days = [...new Set((S.workouts || []).map(w => w.d))].sort().reverse()
  if (!days.length) return 0
  let n = 1
  for (let i = 1; i < days.length; i++) {
    const gap = (new Date(days[i - 1]) - new Date(days[i])) / DAY
    if (gap !== 1) break
    n++
  }
  // Seria licząca się tylko wtedy, gdy trwa do dzisiaj lub wczoraj — inaczej to historia.
  return daysSince(new Date(days[0]).getTime()) <= 1 ? n : 0
}

/**
 * Pełny przegląd: co w ostatnich tygodniach wygląda źle.
 *
 * Kolejność wyniku to kolejność ważności — widok pokazuje pierwsze kilka pozycji,
 * więc to, co najgroźniejsze, musi być na górze samo z siebie, bez sortowania w UI.
 */
export function coachReport(S) {
  const out = []
  const unit = S.unit || 'kg'
  const workouts = S.workouts || []

  // 1. Skok tonażu. Ostry wzrost obciążenia tygodniowego wyprzedza kontuzje przeciążeniowe
  //    lepiej niż jakikolwiek pojedynczy ciężar — dlatego to pierwszy test, a nie ostatni.
  const vols = weeklyVolume(S, 5)
  const thisWeek = vols[vols.length - 1]
  const prior = vols.slice(0, -1).filter(v => v > 0)
  if (thisWeek > 0 && prior.length >= 2) {
    const base = prior.reduce((a, b) => a + b, 0) / prior.length
    const up = pct(thisWeek, base)
    if (up >= 60) out.push({
      id: 'volume', level: up >= 100 ? 'stop' : 'warn',
      title: 'Volume jumped this week',
      detail: 'You have moved {0} % more weight than your average of the last weeks. Tendons adapt slower than muscle — around {1} % a week is the pace they keep up with.',
      args: [Math.round(up), 10]
    })
  }

  // 2. Trening stale na upadku. Niski RIR raz na jakiś czas to plan, przez trzy tygodnie
  //    to droga do zastoju — regeneracja przestaje nadążać, zanim spadną liczby.
  const rir = avgRirWindow(S, 21)
  if (rir != null && rir <= 0.8) out.push({
    id: 'effort', level: 'warn',
    title: 'Everything goes to failure',
    detail: 'Average of about {0} reps in reserve over three weeks. One or two sets a session at that level is enough — the rest of the progress comes from volume you can repeat.',
    args: [round1(rir)]
  })

  // 3. Brak dnia wolnego.
  const streak = streakDays(S)
  if (streak >= 7) out.push({
    id: 'streak', level: 'warn',
    title: '{0} days in a row',
    detail: 'No rest day in {0} days. Strength is built between sessions, not during them — take one off, the plan will wait.',
    args: [streak]
  })

  // 4. Zastój na konkretnym ćwiczeniu — liczony po szacowanym 1RM, bo sam ciężar
  //    nie widzi sesji, w której zrobiłeś ten sam ciężar o dwa powtórzenia więcej.
  const stuck = stuckExercises(S)
  stuck.slice(0, 2).forEach(s => out.push({
    id: 'stall:' + s.id, level: 'info', exId: s.id,
    title: 'No progress in {0}',
    detail: '{1} sessions at the same level. Drop the weight by {2} % for one session and build back — that beats grinding the same number a fourth time.',
    args: [EXIDX[s.id]?.n || s.id, s.n, 10]
  }))

  // 5. Nietrenowane partie. Pytanie brzmi „czego brakuje", więc porównanie idzie
  //    do partii najmocniej obciążonej, a nie do żadnej normy z zewnątrz.
  const gap = neglected(S, 28)
  if (gap.length) out.push({
    id: 'balance', level: 'info',
    title: 'Untrained for a month',
    detail: 'Nothing for {0} in the last four weeks, while the rest of the plan runs normally. An unbalanced set of muscles is the cheapest injury there is.',
    args: [gap.map(m => MUSCLE_NAME[m] || m)]   // widok tłumaczy każdą nazwę osobno
  })

  // 6. Masa ciała. Bez pomiarów wykres i cel są ozdobą.
  const bw = (S.bodyweight || [])
  if (workouts.length >= 4) {
    const last = bw.length ? bw[bw.length - 1] : null
    const gapDays = last ? daysSince(last.t || new Date(last.d).getTime()) : null
    if (!last) out.push({
      id: 'bw', level: 'info',
      title: 'No body weight logged',
      detail: 'Without it there is nothing to read the strength numbers against — the same lift means something different at two body weights.',
      args: []
    })
    else if (gapDays >= 21) out.push({
      id: 'bw', level: 'info',
      title: 'Last weigh-in {0} days ago',
      detail: 'One measurement a week is enough to see a trend; a month apart shows only noise.',
      args: [gapDays]
    })
  }

  return out
}

/**
 * Ćwiczenia stojące w miejscu: co najmniej `min` sesji z rzędu bez poprawy
 * szacowanego 1RM. Zwraca [{ id, n }], najdłuższy zastój pierwszy.
 */
export function stuckExercises(S, min = 4) {
  const ids = new Set()
  ;(S.workouts || []).forEach(w => (w.entries || []).forEach(e => ids.add(e.id)))
  const out = []
  ids.forEach(id => {
    const series = (S.workouts || []).map(w => {
      const e = (w.entries || []).find(x => x.id === id)
      if (!e) return null
      const best = Math.max(0, ...(e.sets || []).filter(s => s.done).map(s => estimate1RM(s.w, s.r) || 0))
      return best > 0 ? best : null
    }).filter(v => v != null)
    if (series.length < min) return
    // Zastój liczymy od PIERWSZEJ sesji, która ustanowiła obecny szczyt: wszystko po niej
    // stoi w miejscu, a ona sama jest tą, na której stanęło. Porównanie idzie po szacowanym
    // 1RM, więc te same 60 kg zrobione o dwa powtórzenia więcej liczy się jako postęp.
    const peak = Math.max(...series)
    const first = series.findIndex(v => v >= peak - 1e-9)
    const n = series.length - first
    if (n >= min) out.push({ id, n })
  })
  return out.sort((a, b) => b.n - a.n)
}

/** Partie bez ani jednej serii w oknie, mimo że reszta planu chodzi normalnie. */
export function neglected(S, days = 28) {
  const from = Date.now() - days * DAY
  const recent = (S.workouts || []).filter(w => tsOf(w) >= from)
  if (recent.length < 4) return []
  const load = loadOfWorkouts(recent)
  const max = Math.max(0, ...Object.values(load))
  if (max <= 0) return []
  // Tylko duże partie: brak pracy nad przedramieniem nie jest problemem, brak nad plecami jest.
  const MAJOR = ['chest', 'upper-back', 'quadriceps', 'hamstring', 'gluteal', 'deltoids', 'abs']
  return MAJOR.filter(m => !(load[m] > 0))
}
