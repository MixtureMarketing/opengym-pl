# Wdrożenie openGym — telefon, serwer, GitHub

Trzy scenariusze, od najprostszego. Wybierz jeden — nie wykluczają się, ale każdy daje co innego.

| Scenariusz | Co dostajesz | Czego nie dostajesz | Koszt |
|---|---|---|---|
| **A. GitHub Pages** | aplikacja pod adresem HTTPS, instalowalna na telefonie jako PWA, działa offline | kont, synchronizacji między urządzeniami, trenera AI | 0 zł |
| **A+. GitHub Pages + Supabase** | to samo co A **plus** konto, synchronizacja telefon↔laptop i trener AI — bez własnego serwera | logowania kluczem dostępu (jest logowanie mailem), panelu administratora | 0 zł |
| **B. Własny serwer (Docker)** | pełny openGym: klucze dostępu, synchronizacja, panel admina, trener AI | — | VPS, ok. 20–30 zł/mies. |
| **C. Render.com (jeden kontener)** | to samo co B, bez własnego serwera | darmowy plan usypia usługę po 15 min bezczynności | 0 zł / od ok. 7 USD za plan bez usypiania |

Dane treningowe **nigdy** nie trafiają do repozytorium — w wariancie A siedzą w pamięci przeglądarki
telefonu, w B i C w katalogu `data/` na serwerze.

---

## A. GitHub Pages — najszybsza droga na telefon

Repozytorium musi być publiczne (na darmowym koncie GitHub Pages nie działa z prywatnych repo).
Sam kod jest publiczny już u autora projektu, więc nic prywatnego nie ujawniasz.

1. Wypchnij repozytorium na swoje konto (patrz [Wypchnięcie na własny GitHub](#wypchnięcie-na-własny-github)).
2. W repozytorium: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → „Publikacja na GitHub Pages" → Run workflow** (albo po prostu zrób dowolny commit na `main`).
4. Po ok. 2 minutach adres pojawi się w zakładce Actions oraz w Settings → Pages:
   `https://<twój-login>.github.io/<nazwa-repo>/`

Na telefonie:

- **iPhone (Safari):** otwórz adres → przycisk udostępniania → *Do ekranu początkowego*.
- **Android (Chrome):** otwórz adres → menu ⋮ → *Dodaj do ekranu głównego*.

Aplikacja działa wtedy na pełnym ekranie, bez paska przeglądarki, także offline.

**Ograniczenie, o którym trzeba wiedzieć:** dane są w pamięci tej jednej przeglądarki.
Wyczyszczenie danych witryny = utrata historii. Regularnie rób kopię: *Ustawienia → Kopia zapasowa*.
Jeśli chcesz mieć te same treningi na telefonie i na laptopie — potrzebujesz wariantu B lub C.

Obrazki i animacje ćwiczeń w tym wariancie ładują się z CDN (jsDelivr), żeby nie pakować
140 MB grafik do repozytorium.

---

## A+. GitHub Pages + Supabase — konto i synchronizacja bez własnego serwera

Aplikacja zostaje tam, gdzie jest (statyczne pliki na GitHub Pages), a rolę serwera przejmuje
Supabase: Postgres na dane, logowanie linkiem z maila i funkcja brzegowa dla trenera AI.
Nic twojego nie chodzi 24/7, a treningi widzisz i na telefonie, i na laptopie.

### 1. Projekt

1. [supabase.com](https://supabase.com) → **New project**. Region wybierz europejski
   (Frankfurt), hasło do bazy zapisz w menedżerze haseł — przyda się tylko awaryjnie.
2. **Settings → API** — stamtąd bierzesz dwie wartości:
   - **Project URL**, np. `https://abcdefgh.supabase.co`
   - **anon public** — długi klucz zaczynający się od `eyJ…`

Klucza **service_role** nie wolno nigdzie wkleić po stronie aplikacji: on omija wszystkie
reguły dostępu. Używa go wyłącznie funkcja brzegowa, po stronie Supabase.

### 2. Schemat bazy

**SQL Editor → New query**, wklej całą zawartość [`supabase/schema.sql`](../supabase/schema.sql)
i uruchom. Skrypt tworzy tabelę `states` (jeden wiersz na użytkownika, cały stan w JSONB),
polityki RLS i licznik pytań do trenera.

Polityki RLS to jedyna rzecz stojąca między czyimiś treningami a resztą internetu. Klucz `anon`
jest jawny z założenia — jedzie w każdym żądaniu z przeglądarki i nie da się go ukryć.
Bez ważnego tokenu sesji polityki nie przepuszczą ani odczytu, ani zapisu, a z tokenem widać
wyłącznie własny wiersz.

### 3. Adresy powrotu dla logowania

**Authentication → URL Configuration**:

- **Site URL**: `https://<twój-login>.github.io/<repo>/`
- **Redirect URLs**: dodaj ten sam adres oraz `http://localhost:5173/` do pracy lokalnej.

Bez tego wpisu link z maila odbije się od Supabase, a komunikat błędu nie powie ci dlaczego.

### 4. Wpięcie do aplikacji

W repozytorium: **Settings → Secrets and variables → Actions → Variables → New variable**,
dwa razy:

| Nazwa | Wartość |
|---|---|
| `SUPABASE_URL` | Project URL z kroku 1 |
| `SUPABASE_ANON_KEY` | klucz `anon public` z kroku 1 |

Potem **Actions → „Publikacja na GitHub Pages" → Run workflow**. Po deployu ekran startowy
pokazuje *Zaloguj się mailem* zamiast trybu bez konta.

### 5. Trener AI (opcjonalnie)

Wymaga [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <ref-projektu>        # ref to człon z adresu: abcdefgh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy coach
```

Klucz do Anthropic jest sekretem projektu i nigdy nie trafia do przeglądarki. Bez wdrożonej
funkcji przycisk „Zapytaj trenera" zwraca komunikat, że ta instalacja nie ma trenera —
reszta aplikacji działa normalnie.

### Czego ten wariant nie ma

- **Logowania kluczem dostępu** — Supabase Auth nie oferuje passkey jako metody logowania,
  więc jest link w mailu. Klucze dostępu zostają w wariancie B i C.
- **Panelu administratora** — jest częścią serwera Node.
- Darmowy plan Supabase **usypia projekt po tygodniu bez ruchu** (odblokowujesz jednym
  kliknięciem w panelu). Przy treningach kilka razy w tygodniu to się nie zdarza.

### Praca lokalna z Supabase

```bash
cd frontend
VITE_SUPABASE_URL=https://abcdefgh.supabase.co \
VITE_SUPABASE_ANON_KEY=eyJ... \
npm run dev
```

---

## B. Własny serwer — pełna wersja przez Docker

Wymagania: maszyna z Dockerem (VPS, NAS, mini-PC w domu) i domena kierująca na jej adres IP.

```bash
git clone https://github.com/<twój-login>/<nazwa-repo>.git opengym
cd opengym
cp .env.example .env
```

W pliku `.env` ustaw trzy rzeczy:

```ini
RP_ID=silownia.twojadomena.pl
ORIGIN=https://silownia.twojadomena.pl
WEB_PORT=8080
```

`RP_ID` to sama nazwa hosta (bez `https://` i bez portu), `ORIGIN` to pełny adres.
Muszą się zgadzać z tym, co widzi przeglądarka — **rozjazd między nimi to przyczyna
90% problemów z logowaniem kluczem dostępu**.

Start:

```bash
docker compose pull      # gotowe obrazy; pomiń, jeśli chcesz budować ze źródeł
docker compose up -d
```

Za pierwszym razem dociągnie się ok. 140 MB grafik ćwiczeń do `media/` (jednorazowo).

### HTTPS

Klucze dostępu (passkey) **wymagają HTTPS** — wyjątkiem jest tylko `http://localhost`.
Najprościej postawić przed openGym reverse proxy z automatycznym certyfikatem. Caddy, `Caddyfile`:

```caddy
silownia.twojadomena.pl {
    reverse_proxy localhost:8080
}
```

Caddy sam pobierze certyfikat Let's Encrypt. Alternatywy: Traefik, nginx + certbot, Cloudflare Tunnel.

### Panel administratora

1. Załóż profil w aplikacji.
2. Znajdź swoje id: `grep -o '"id":"[^"]*"' data/db.json | head`.
3. Wpisz je do `.env` jako `ADMIN_UIDS=<id>` i zrestartuj: `docker compose restart api`.
4. Panel pojawi się w *Ustawieniach*. Znajdziesz tam kody zaproszeń i podgląd trwających treningów.

Ustaw też `INVITE_ONLY=1`, jeśli instancja jest wystawiona do internetu — bez tego
każdy, kto zna adres, założy sobie u ciebie profil.

### Kopia zapasowa

Wszystko istotne siedzi w katalogu `data/`: `db.json` (profile i publiczne klucze),
`state-<user>.json` (plany, treningi, masa ciała), `secret` (klucz podpisujący ciasteczka sesji).

```bash
tar czf opengym-backup-$(date +%F).tar.gz data/
```

Prywatne klucze passkey nigdy nie są na serwerze — zostają w bezpiecznym module telefonu
albo w twoim menedżerze haseł.

### Aktualizacja

```bash
git pull
docker compose pull && docker compose up -d
```

---

## C. Render.com — pełna wersja bez własnego serwera

Plik `render.yaml` opisuje jedną usługę zbudowaną z `Dockerfile.allinone`: proces Node
serwuje jednocześnie API i frontend, więc wszystko jest na jednym origin (wymóg WebAuthn),
a grafiki ćwiczeń lecą z CDN.

1. Na [render.com](https://render.com): **New → Blueprint** i wskaż swoje repozytorium.
2. Render odczyta `render.yaml` i poprosi o dwie zmienne:
   - `RP_ID` — sama nazwa hosta, np. `opengym-abc123.onrender.com`
   - `ORIGIN` — pełny adres, np. `https://opengym-abc123.onrender.com`
   (Nazwę usługi znasz dopiero po pierwszym deployu — wtedy uzupełnij zmienne i wdróż ponownie.)
3. Dysk `opengym-data` montowany w `/data` trzyma profile i treningi między wdrożeniami.
   **Darmowy plan Rendera nie ma trwałych dysków** — na nim dane znikną przy restarcie.
   Do realnego użytku potrzebny jest płatny plan (od ok. 7 USD/mies.).

Ten sam obraz zadziała na Railway, Fly.io i każdej innej platformie przyjmującej Dockerfile —
wystarczy podać `RP_ID`, `ORIGIN` i podmontować wolumen pod `/data`.

Lokalnie ten wariant sprawdzisz tak:

```bash
docker build -f Dockerfile.allinone -t opengym-aio .
docker run --rm -p 3000:3000 -v "$PWD/data:/data" \
  -e RP_ID=localhost -e ORIGIN=http://localhost:3000 opengym-aio
```

---

## Wypchnięcie na własny GitHub

Z zainstalowanym [GitHub CLI](https://cli.github.com/):

```bash
cd opengym
gh repo create <nazwa-repo> --public --source=. --remote=origin --push
```

Bez `gh`: załóż puste repozytorium przez stronę GitHuba, a potem:

```bash
git remote set-url origin https://github.com/<twój-login>/<nazwa-repo>.git
git push -u origin main
```

Po pierwszym pushu w zakładce **Actions** czekają dwa procesy:

- **Publikacja na GitHub Pages** — buduje aplikację i wystawia ją pod adresem HTTPS (wariant A).
- **Obrazy Dockera (GHCR)** — buduje obrazy `opengym-api` i `opengym-web` pod twoim kontem
  i wypycha do `ghcr.io`. Gdy przejdzie, możesz w `.env` na serwerze wskazać własne obrazy:

  ```ini
  OPENGYM_API_IMAGE=ghcr.io/<twój-login>/opengym-api:latest
  OPENGYM_WEB_IMAGE=ghcr.io/<twój-login>/opengym-web:latest
  ```

  Obrazy w GHCR są domyślnie prywatne — żeby serwer mógł je pobrać bez logowania,
  ustaw je jako publiczne w *Packages → Package settings → Change visibility*.

Projekt jest na licencji AGPL-3.0: publiczny fork ze zmianami to dokładnie to,
czego ta licencja oczekuje.

---

## Trener

Aplikacja ma dwie warstwy podpowiedzi. Pierwsza działa zawsze, druga wymaga serwera i klucza API.

### Warstwa lokalna — zawsze, za darmo, offline

Liczona w przeglądarce z twojej własnej historii, bez żadnego API. Sprawdza:

- **skok ciężaru** — porównuje to, co masz wpisane w niezrobionych seriach, z ostatnią sesją
  tego ćwiczenia; ostrzega dopiero, gdy skok przekracza jednocześnie próg procentowy
  i krotność standardowego przyrostu, więc normalna progresja jest cicha,
- **ciężar ponad rekord** — przelicza ciężar × powtórzenia na szacowany 1RM i mówi,
  gdy wynik wymagałby pobicia twojego rekordu życiowego,
- **skok objętości** — tonaż tygodnia względem średniej z poprzednich tygodni,
- **trening stale na upadku** — średni zapas powtórzeń (RIR) poniżej jednego przez trzy tygodnie,
- **brak dnia wolnego** — siedem dni treningowych z rzędu,
- **zastój** — cztery sesje bez poprawy szacowanego 1RM, z propozycją zejścia o 10 %,
- **pominięte partie** — duża grupa mięśniowa bez ani jednej serii przez cztery tygodnie,
- **brak pomiarów masy ciała**.

Ostrzeżenie o ciężarze pojawia się w trakcie treningu, nad tabelą serii. Reszta trafia
na kartę „Trener" na ekranie głównym — karta znika, gdy nie ma nic do powiedzenia.

### Warstwa AI — opcjonalna, wymaga serwera

Przycisk „Zapytaj trenera" i swobodne pytania po polsku. Klucz API nie może leżeć we froncie
(każdy odwiedzający odczytałby go z kodu strony i wygenerował rachunek na twoje konto),
więc ta warstwa istnieje wyłącznie w wariancie B i C.

W `.env`:

```ini
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
COACH_DAILY_LIMIT=40
```

Klucz wygenerujesz w [console.anthropic.com](https://console.anthropic.com). Po zmianie
`.env` zrestartuj kontener: `docker compose restart api`.

Do modelu idzie **podsumowanie**, nie dziennik: tonaż tygodniami, osiem najczęstszych ćwiczeń
z ostatnimi seriami i szacowanym 1RM, ostatnie pomiary masy ciała oraz ustalenia warstwy
lokalnej. Około 1,7 kB na pytanie, czyli grosze. `COACH_DAILY_LIMIT` to twarda blokada
liczby pytań na użytkownika na dobę — zabezpieczenie rachunku przed pętlą w kliencie.

Bez klucza `/api/coach` odpowiada 501, a aplikacja po prostu nie pokazuje przycisku.

---

## Kopia zapasowa danych treningowych

Raz w tygodniu aplikacja sama zapisuje plik JSON z całym stanem — plan, treningi, masę ciała,
ustawienia. Uruchamia się przy otwarciu aplikacji (przeglądarka nie pozwoli zapisać pliku
przy zamkniętej karcie), więc w praktyce zdarza się to przy pierwszym wejściu po upływie tygodnia.

- **przeglądarka** — plik ląduje w Pobranych, tak samo jak po kliknięciu eksportu,
- **aplikacja natywna** — plik ląduje w katalogu dokumentów, bez pytania,
- **gdy pobieranie jest zablokowane** (zdarza się w PWA na iOS i przy zaostrzonych ustawieniach
  przeglądarki) — po dwóch tygodniach bez kopii ekran główny pokazuje pasek z przyciskiem
  „Zapisz kopię teraz". Aplikacja nie udaje, że kopia jest, skoro jej nie ma.

Data ostatniej kopii i przełącznik automatu siedzą w *Ustawienia → Dane*. Ręczny eksport
zeruje licznik — kopia to kopia, niezależnie od tego, kto ją zlecił.

W wariancie B i C dochodzi drugi, niezależny mechanizm: dane są na serwerze w `data/`,
więc utrata telefonu nic nie kosztuje. Plik JSON pozostaje wtedy zabezpieczeniem na wypadek
utraty samego serwera.

---

## Typowe problemy

**„Logowanie kluczem nie działa"** — sprawdź, czy `ORIGIN` w `.env` co do znaku odpowiada
adresowi w pasku przeglądarki (schemat, host, port) i czy `RP_ID` to sama nazwa hosta.
Passkey działa tylko po HTTPS albo na `http://localhost`.

**„Brak obrazków ćwiczeń"** — w wariancie B pobierz je ponownie:
`docker compose run --rm media`. W wariantach A i C idą z CDN — sprawdź, czy coś nie blokuje
`cdn.jsdelivr.net`.

**„Błąd 405 po kliknięciu logowania"** — tak odpowiada serwer plików statycznych (GitHub Pages)
na żądanie POST. Znaczy to, że aplikacja została zbudowana tak, jakby stał za nią serwer Node.
Build dla Pages musi mieć `VITE_STATIC=1` (workflow ustawia to sam) — wtedy ekran startowy
w ogóle nie proponuje logowania kluczem, bo nie ma czego pytać. Jeśli chcesz mieć konto na
Pages, to jest dokładnie ten moment na wariant A+ z Supabase.

**„Link z maila nie loguje"** — adres aplikacji musi być dopisany w Supabase w
*Authentication → URL Configuration → Redirect URLs*, co do znaku, razem z ukośnikiem na końcu.

**„Pages pokazuje 404"** — Settings → Pages → Source musi być ustawione na **GitHub Actions**,
nie na gałąź.

**„Zalogowałem się, ale nie widzę swoich danych z telefonu"** — synchronizacja działa tylko
w wariantach B i C. GitHub Pages nie ma serwera, więc każde urządzenie ma własny komplet danych.
