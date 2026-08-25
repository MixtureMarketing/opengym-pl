# openGym — polska wersja

Samodzielnie hostowany dziennik treningów siłowych i masy ciała. Plan tygodnia, prowadzony
trening seria po serii, historia, statystyki i wykres masy ciała — wszystko na twoim sprzęcie,
bez konta u kogoś obcego, bez abonamentu i bez reklam.

Fork [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym) (AGPL-3.0)
z interfejsem po polsku.

## Co zmienia ta wersja

- **Polski domyślnie** — aplikacja startuje w języku przeglądarki, a gdy go nie zna, po polsku.
  Inne języki nadal są w *Ustawieniach*.
- **Przetłumaczony panel administratora** — w oryginale celowo pozostawiony po angielsku.
- **Uzupełnione brakujące teksty** — komunikaty trybu demo i drobne etykiety, których
  nie miał żaden pakiet językowy.
- **Trener** — analiza historii liczona w przeglądarce: ostrzega, gdy skok ciężaru jest
  za duży albo wynik wymagałby rekordu życiowego, wykrywa zastój, skok objętości, brak dnia
  wolnego i pominięte partie. Działa offline, bez API. Opcjonalnie, w instalacji z serwerem,
  dochodzi przycisk „Zapytaj trenera" oparty o Claude.
- **Cotygodniowa kopia zapasowa** — aplikacja sama zapisuje plik JSON z całym stanem raz
  w tygodniu, a gdy przeglądarka zablokuje pobieranie, prosi o jedno kliknięcie.
- **`Dockerfile.allinone`** — API i frontend w jednym kontenerze, na jednym porcie.
  Wdrożenie na Render / Railway / Fly.io bez stawiania nginxa.
- **Supabase jako baza** — logowanie linkiem z maila, dane w Postgresie z RLS, trener AI
  w funkcji brzegowej. Efekt: konto i synchronizacja telefon↔laptop bez stawiania serwera.
  Włącza się dwiema zmiennymi w ustawieniach repozytorium.
- **Tryby uruchomienia** — aplikacja wie, co za nią stoi (własny serwer, Supabase albo nic)
  i pokazuje tylko to logowanie, które w danej konfiguracji naprawdę działa. Wcześniej
  na hostingu statycznym kończyło się to błędem 405.
- **Workflow GitHuba** — publikacja na GitHub Pages (aplikacja na telefon w 2 minuty)
  i budowanie obrazów Dockera do GHCR.
- **`.env.example`** — z opisem każdej zmiennej po polsku (w oryginale plik nie istniał).

Nazwy ćwiczeń pochodzą z zewnętrznej bazy i pozostają po angielsku; opisy wykonania
(instrukcje krok po kroku) są po polsku.

## Szybki start

Aplikacja na telefonie, bez serwera:

> Settings → Pages → Source: **GitHub Actions**, a potem Actions → **Publikacja na GitHub Pages**.
> Adres `https://<login>.github.io/<repo>/` otwierasz na telefonie i dodajesz do ekranu głównego.

Pełna wersja (logowanie kluczem dostępu, synchronizacja telefon↔laptop) na własnym serwerze:

```bash
cp .env.example .env      # ustaw RP_ID i ORIGIN na swoją domenę
docker compose up -d
```

Szczegóły wszystkich trzech wariantów wdrożenia, HTTPS, kopii zapasowej i panelu
administratora: **[docs/WDROZENIE.md](docs/WDROZENIE.md)**.

## Praca nad kodem

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm test         # 192 testy
```

Teksty interfejsu żyją w [`frontend/src/locales/pl.js`](frontend/src/locales/pl.js) —
kluczem jest angielski oryginał, wartością tłumaczenie. Nowy tekst w kodzie owijasz w `t('…')`
i dopisujesz do tego pliku.

Pełna dokumentacja projektu (po angielsku): [README.md](README.md).

## Licencja

AGPL-3.0-or-later, tak jak oryginał. Uruchamiasz to publicznie — udostępniasz kod ze zmianami.
