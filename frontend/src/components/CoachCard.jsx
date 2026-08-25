import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { coachReport } from '../lib/coach.js'
import { askCoach } from '../lib/coach-ai.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button, TextArea } from './ui.jsx'

// Karta trenera na ekranie głównym. Pokazuje wyłącznie to, co znalazł — pusty przegląd
// znaczy „nic się nie pali", a karta z napisem „wszystko OK" zabierałaby miejsce
// dokładnie wtedy, gdy nie ma nic do powiedzenia.
//
// Domyślnie widać dwie pierwsze pozycje: przegląd jest posortowany od najgroźniejszej,
// więc obcięcie nigdy nie chowa czegoś ważniejszego od tego, co zostało na wierzchu.

export const ICON = { stop: 'shield', warn: 'flame', info: 'lightbulb' }
export const TINT = { stop: 'var(--red)', warn: 'var(--yellow)', info: 'var(--acc)' }

// Argument będący tablicą to lista nazw do przetłumaczenia po kolei (partie mięśniowe).
const arg = a => (Array.isArray(a) ? a.map(x => t(x)).join(', ') : a)

export function CoachLine({ item }) {
  return <div className="row" style={{ alignItems: 'flex-start', gap: 8, padding: '7px 0' }}>
    <Icon name={ICON[item.level]} style={{ color: TINT[item.level], fontSize: 15, marginTop: 2, flex: 'none' }} />
    <div>
      <div className="small" style={{ fontWeight: 600 }}>{t(item.title, ...item.args.map(arg))}</div>
      <div className="dim" style={{ fontSize: '.78rem', lineHeight: 1.45 }}>{t(item.detail, ...item.args.map(arg))}</div>
    </div>
  </div>
}

// Pytanie do trenera AI. Osobny arkusz, nie pole na karcie: odpowiedź bywa akapitem,
// a karta na ekranie głównym ma zostać skanowalna.
function AskSheet({ close }) {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [err, setErr] = useState('')

  const ask = async () => {
    setBusy(true); setErr(''); setAnswer('')
    try {
      const r = await askCoach(S, q)
      setAnswer(r.text || t('The coach had nothing to add.'))
    } catch (e) {
      setErr(e.status === 501 ? t('This instance has no AI coach configured.')
        : e.status === 429 ? t('Daily limit reached — try again tomorrow.')
        : t('The coach is unavailable right now.'))
    }
    setBusy(false)
  }

  return <>
    <h3>{t('Ask the coach')}</h3>
    <div className="muted small" style={{ margin: '2px 0 10px' }}>
      {t('Your last weeks of training go to the model as a summary — not the full log.')}
    </div>
    <TextArea rows={3} value={q} placeholder={t('e.g. my bench has not moved in a month — what now?')}
      onChange={e => setQ(e.target.value)} />
    <div style={{ height: 10 }} />
    <Button variant="primary" icon="sparkles" disabled={busy} onClick={ask}>
      {busy ? t('Thinking…') : t('Ask')}
    </Button>
    {err && <div className="small" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
    {answer && <div className="card" style={{ marginTop: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{answer}</div>}
  </>
}

export default function CoachCard() {
  const S = useStore(s => s.S)
  const aiCoach = useStore(s => s.aiCoach)
  const openSheet = useUI(s => s.openSheet)
  const [all, setAll] = useState(false)
  // Przegląd chodzi po całej historii, więc liczymy go raz na zmianę stanu, nie na render.
  const found = useMemo(() => coachReport(S), [S.workouts, S.bodyweight, S.unit])
  // Karta znika, gdy nie ma ani ustaleń, ani trenera AI do zapytania.
  if (!found.length && !aiCoach) return null

  const shown = all ? found : found.slice(0, 2)
  return <div className="card">
    <div className="row between" style={{ marginBottom: 2 }}>
      <h2 style={{ margin: 0 }}>{t('Coach')}</h2>
      <span className="dim" style={{ fontSize: '.72rem' }}>{t('from your history')}</span>
    </div>
    {shown.map(item => <CoachLine key={item.id} item={item} />)}
    {found.length > 2 && <button className="btn" style={{ marginTop: 6 }} onClick={() => setAll(a => !a)}>
      {all ? t('Show less') : t('{0} more', found.length - 2)}
    </button>}
    {aiCoach && <Button variant="tinted" icon="sparkles" style={{ marginTop: 8 }}
      onClick={() => openSheet(close => <AskSheet close={close} />)}>{t('Ask the coach')}</Button>}
  </div>
}
