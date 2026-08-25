# Wdrożenie openGym — telefon, serwer, GitHub

Trzy scenariusze, od najprostszego. Wybierz jeden — nie wykluczają się, ale każdy daje co innego.

| Scenariusz | Co dostajesz | Czego nie dostajesz | Koszt |
|---|---|---|---|
| **A. GitHub Pages** | aplikacja pod adresem HTTPS, instalowalna na telefonie jako PWA, działa offline | logowania kluczem, synchronizacji między urządzeniami, panelu administratora | 0 zł |
| **B. Własny serwer (Docker)** | pełny openGym: klucze dostępu, synchronizacja telefon↔laptop, panel admina | — | VPS, ok. 20–30 zł/mies. |
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

## Typowe problemy

**„Logowanie kluczem nie działa"** — sprawdź, czy `ORIGIN` w `.env` co do znaku odpowiada
adresowi w pasku przeglądarki (schemat, host, port) i czy `RP_ID` to sama nazwa hosta.
Passkey działa tylko po HTTPS albo na `http://localhost`.

**„Brak obrazków ćwiczeń"** — w wariancie B pobierz je ponownie:
`docker compose run --rm media`. W wariantach A i C idą z CDN — sprawdź, czy coś nie blokuje
`cdn.jsdelivr.net`.

**„Pages pokazuje 404"** — Settings → Pages → Source musi być ustawione na **GitHub Actions**,
nie na gałąź.

**„Zalogowałem się, ale nie widzę swoich danych z telefonu"** — synchronizacja działa tylko
w wariantach B i C. GitHub Pages nie ma serwera, więc każde urządzenie ma własny komplet danych.
