// Automatyczna kopia zapasowa raz w tygodniu.
//
// Powód jest konkretny: w trybie gościa (a tak działa instalacja bez serwera — GitHub Pages,
// PWA na telefonie) jedyną kopią danych jest localStorage tej jednej przeglądarki.
// Wyczyszczenie danych witryny kasuje całą historię i nic tego nie odzyska. Tydzień to
// kompromis: częściej znaczy plik w Pobranych po każdym treningu, rzadziej znaczy, że awaria
// kosztuje miesiąc zapisów.
//
// Zapis jest robiony na trzy sposoby, zależnie od tego, gdzie aplikacja chodzi:
//  · aplikacja natywna (Capacitor) — plik ląduje w katalogu dokumentów, bez pytania,
//  · przeglądarka — pobranie pliku przez blob (to samo, co robi przycisk w Ustawieniach),
//  · gdy jedno i drugie odpadnie — zostaje `lastFailed`, a ekran główny prosi o ręczny eksport.
//
// Sam stan zapisu (`S.backup`) jest częścią zwykłego stanu, więc synchronizuje się i wchodzi
// do kopii tak jak wszystko inne. Świadomie: dzięki temu drugie urządzenie tego samego
// profilu nie robi drugiej kopii tego samego dnia.

import { MOBILE, shareExport } from './mobile.js'
import { todayISO } from './format.js'

export const WEEK = 7 * 86400000
// Po dwóch nieudanych tygodniach przestajemy udawać, że automat działa, i prosimy o ręczny
// eksport. Tyle wystarczy, żeby odróżnić jednorazową blokadę pobierania od trwałej.
export const NAG_AFTER = 14 * 86400000

export const backupName = () => 'opengym-backup-' + todayISO() + '.json'

// Sam plan i ustawienia bez treningów nie są warte pliku — kopia ma sens od pierwszej sesji.
export const hasSomethingToSave = S => !!((S.workouts || []).length || (S.bodyweight || []).length)

/** Czy wypada zrobić kopię? Świeży profil dostaje tydzień spokoju od pierwszego zapisu. */
export function backupDue(S, now = Date.now()) {
  if (!S || S.backup?.auto === false) return false
  if (!hasSomethingToSave(S)) return false
  const last = S.backup?.last || S.backup?.started
  if (!last) return false                       // pierwszy raz odmierzamy od `markStart`
  return now - last >= WEEK
}

/** Czy automat najwyraźniej nie działa i trzeba poprosić człowieka? */
export function backupNagging(S, now = Date.now()) {
  if (!S || S.backup?.auto === false || !hasSomethingToSave(S)) return false
  const last = S.backup?.last
  if (!last) return !!S.backup?.started && now - S.backup.started >= NAG_AFTER
  return now - last >= NAG_AFTER
}

/**
 * Zapisuje kopię tam, gdzie się da. Zwraca 'file' | 'download' | 'failed'.
 * Nigdy nie rzuca — nieudana kopia nie może przerwać startu aplikacji.
 */
export async function writeBackup(S) {
  const json = JSON.stringify(S, null, 2)
  const name = backupName()
  if (MOBILE) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({ path: name, directory: Directory.Documents, data: json, encoding: Encoding.UTF8 })
      return 'file'
    } catch (e) {
      // Brak uprawnień do katalogu dokumentów — arkusz udostępniania wymaga gestu, więc
      // tu już nie próbujemy; ekran główny poprosi o ręczny eksport.
      return 'failed'
    }
  }
  try {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Odwołanie po chwili: część przeglądarek czyta blob dopiero po powrocie z pętli zdarzeń.
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'download'
  } catch (e) { return 'failed' }
}

/** Ręczny eksport z Ustawień — ta sama ścieżka, ale arkusz udostępniania jest dozwolony. */
export async function exportNow(S) {
  if (MOBILE) {
    await shareExport(JSON.stringify(S, null, 2), backupName())
    return 'share'
  }
  return writeBackup(S)
}
