import { describe, it, expect } from 'vitest'
import { checkJump, checkAgainst1RM, weeklyVolume, stuckExercises, neglected, coachReport } from './coach.js'
import { EXDB } from './exercises.js'

const DAY = 86400000
// Lekkie ćwiczenie (przyrost 2,5 kg) i ciężkie (5 kg) — progi trenera zależą od obu.
const LIFT = EXDB.find(e => e.bp !== 'cardio' && !['upper legs', 'lower legs', 'back', 'hips', 'glutes'].includes(e.bp)).id
const HEAVY = EXDB.find(e => e.bp === 'upper legs').id

const iso = daysAgo => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10)

// Historia jako lista [dniTemu, ciężar, ...powtórzeniaSerii].
const hist = (id, rows, extra = {}) => ({
  unit: 'kg',
  bodyweight: [],
  workouts: rows.map(([ago, w, ...reps]) => ({
    d: iso(ago),
    start: Date.now() - ago * DAY,
    entries: [{ id, target: { sets: reps.length, reps: reps[0], weight: w }, sets: reps.map(r => ({ w, r, done: true })) }]
  })),
  ...extra
})

describe('checkJump — czy skok ciężaru jest za duży', () => {
  const S = hist(LIFT, [[10, 50, 5, 5, 5], [3, 50, 5, 5, 5]])
  const cfg = { id: LIFT, sets: 3, reps: 5 }

  it('milczy przy normalnej progresji o jeden standardowy przyrost', () => {
    expect(checkJump(S, cfg, 52.5)).toBe(null)
  })

  it('milczy, gdy ciężar spada — zejście w dół nie jest ryzykiem', () => {
    expect(checkJump(S, cfg, 45)).toBe(null)
  })

  it('ostrzega przy skoku o dwa przyrosty naraz', () => {
    const r = checkJump(S, cfg, 55)
    expect(r.level).toBe('warn')
    expect(r.pct).toBe(10)
  })

  it('zatrzymuje przy skoku o ponad 12 % i trzy przyrosty', () => {
    expect(checkJump(S, cfg, 60).level).toBe('stop')
  })

  it('nie alarmuje na ciężkim ćwiczeniu, gdzie ten sam procent to jeden krok', () => {
    const heavy = hist(HEAVY, [[10, 100, 5, 5, 5], [3, 100, 5, 5, 5]])
    expect(checkJump(heavy, { id: HEAVY }, 105)).toBe(null)
  })

  it('zatrzymuje przy pięciu standardowych krokach naraz', () => {
    const heavy = hist(HEAVY, [[10, 200, 5, 5, 5], [3, 200, 5, 5, 5]])
    expect(checkJump(heavy, { id: HEAVY }, 225).level).toBe('stop')
  })

  it('respektuje własny przyrost ustawiony na ćwiczeniu', () => {
    const heavy = hist(HEAVY, [[10, 100, 5, 5, 5], [3, 100, 5, 5, 5]])
    expect(checkJump(heavy, { id: HEAVY, inc: 20 }, 110)).toBe(null)
  })

  it('nie ma czego porównać bez historii z ciężarem', () => {
    expect(checkJump({ unit: 'kg', workouts: [] }, cfg, 100)).toBe(null)
  })
})

describe('checkAgainst1RM — ciężar ponad rekord życiowy', () => {
  const S = hist(LIFT, [[20, 80, 5, 5, 5], [10, 80, 5, 5, 5]])
  const cfg = { id: LIFT }

  it('milczy, gdy wynik mieści się w dotychczasowym rekordzie', () => {
    expect(checkAgainst1RM(S, cfg, 80, 5)).toBe(null)
  })

  it('ostrzega, gdy wymagałby kilku procent ponad rekord', () => {
    const r = checkAgainst1RM(S, cfg, 87.5, 5)
    expect(r.level).toBe('warn')
  })

  it('zatrzymuje przy dziesięciu procentach ponad rekord', () => {
    expect(checkAgainst1RM(S, cfg, 100, 5).level).toBe('stop')
  })

  it('bez podanych powtórzeń nie ma czego szacować', () => {
    expect(checkAgainst1RM(S, cfg, 200)).toBe(null)
  })

  it('wchodzi zamiast oceny skoku, gdy jest groźniejsza', () => {
    // 55 kg to sam w sobie tylko „warn", ale przy 5 powtórzeniach to rekord życiowy.
    const light = hist(LIFT, [[20, 50, 5, 5, 5], [10, 50, 5, 5, 5]])
    expect(checkJump(light, { id: LIFT }, 60, 5).id).toBe('1rm')
  })
})

describe('weeklyVolume — tonaż tygodniami', () => {
  it('rozdziela treningi na właściwe okna i sumuje ciężar × powtórzenia', () => {
    const S = hist(LIFT, [[9, 100, 10], [2, 100, 10]])
    const v = weeklyVolume(S, 2)
    expect(v).toEqual([1000, 1000])
  })

  it('zwraca zera, gdy w oknie nic nie ma', () => {
    expect(weeklyVolume({ workouts: [] }, 3)).toEqual([0, 0, 0])
  })
})

describe('stuckExercises — zastój liczony po szacowanym 1RM', () => {
  it('nie zgłasza ćwiczenia, które rośnie', () => {
    const S = hist(LIFT, [[28, 50, 5], [21, 52.5, 5], [14, 55, 5], [7, 57.5, 5]])
    expect(stuckExercises(S)).toEqual([])
  })

  it('zgłasza cztery sesje na tym samym poziomie', () => {
    const S = hist(LIFT, [[28, 60, 5], [21, 60, 5], [14, 60, 5], [7, 60, 5]])
    expect(stuckExercises(S)[0]).toMatchObject({ id: LIFT, n: 4 })
  })

  it('nie ocenia serii krótszej niż próg', () => {
    expect(stuckExercises(hist(LIFT, [[7, 60, 5], [3, 60, 5]]))).toEqual([])
  })

  it('widzi postęp zrobiony powtórzeniami przy tym samym ciężarze', () => {
    const S = hist(LIFT, [[28, 60, 5], [21, 60, 6], [14, 60, 7], [7, 60, 8]])
    expect(stuckExercises(S)).toEqual([])
  })
})

describe('neglected — partie bez ani jednej serii', () => {
  it('nie orzeka niczego przy zbyt krótkiej historii', () => {
    expect(neglected(hist(LIFT, [[3, 50, 5]]))).toEqual([])
  })

  it('wskazuje duże partie pominięte mimo regularnych treningów', () => {
    const S = hist(LIFT, [[20, 50, 5], [15, 50, 5], [10, 50, 5], [5, 50, 5]])
    const gap = neglected(S)
    expect(gap.length).toBeGreaterThan(0)
    expect(gap).not.toContain('forearm')      // tylko duże partie
  })
})

describe('coachReport — pełny przegląd', () => {
  it('nie ma nic do powiedzenia o pustym profilu', () => {
    expect(coachReport({ workouts: [], bodyweight: [] })).toEqual([])
  })

  it('zgłasza skok tonażu ponad średnią poprzednich tygodni', () => {
    const S = hist(LIFT, [[25, 50, 5], [18, 50, 5], [11, 50, 5], [2, 50, 5, 5, 5, 5, 5, 5]])
    const r = coachReport(S).find(c => c.id === 'volume')
    expect(r).toBeTruthy()
    expect(['warn', 'stop']).toContain(r.level)
  })

  it('zgłasza brak dnia wolnego przy siedmiu dniach z rzędu', () => {
    const S = hist(LIFT, [6, 5, 4, 3, 2, 1, 0].map(d => [d, 50, 5]))
    expect(coachReport(S).find(c => c.id === 'streak')).toBeTruthy()
  })

  it('zgłasza brak pomiarów masy ciała przy istniejącej historii treningów', () => {
    const S = hist(LIFT, [[20, 50, 5], [15, 50, 5], [10, 50, 5], [5, 50, 5]])
    expect(coachReport(S).find(c => c.id === 'bw')).toBeTruthy()
  })

  it('milczy o masie ciała, gdy pomiar jest świeży', () => {
    const S = hist(LIFT, [[20, 50, 5], [15, 50, 5], [10, 50, 5], [5, 50, 5]],
      { bodyweight: [{ d: iso(2), t: Date.now() - 2 * DAY, w: 80 }] })
    expect(coachReport(S).find(c => c.id === 'bw')).toBeFalsy()
  })

  it('zgłasza trening stale na upadku', () => {
    const S = hist(LIFT, [[14, 50, 5, 5, 5], [10, 50, 5, 5, 5], [5, 50, 5, 5, 5]])
    S.workouts.forEach(w => w.entries[0].sets.forEach(s => { s.rir = 0 }))
    expect(coachReport(S).find(c => c.id === 'effort')).toBeTruthy()
  })
})
