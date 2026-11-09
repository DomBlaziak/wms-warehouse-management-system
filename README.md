# WMS - System Zarządzania Magazynem (Projekt Inżynierski)

Aplikacja typu Full-Stack zbudowana w architekturze PERN (PostgreSQL, Express, React, Node.js).

## Wymagania systemowe:

- Node.js (wersja LTS)
- PostgreSQL (uruchomiony lokalnie)

---

## Instrukcja uruchomienia:

### 1. Pobranie projektu i przejście do katalogu

```bash
git clone https://github.com
cd wms-warehouse-management-system
```

### 2. Instalacja zależności (Backend i Frontend)

Uruchom poniższą komendę w głównym folderze projektu, aby zainstalować wymagane biblioteki dla obu warstw aplikacji jednocześnie:

```bash
npm run install-all
```

### 3. Konfiguracja plików środowiskowych (.env)

1. Przejdź do folderu `backend`, skopiuj plik `.env.example`, zmień jego nazwę na `.env` i wprowadź swoje dane dostępowe do bazy PostgreSQL.
2. Przejdź do folderu `frontend`, skopiuj plik `.env.example` i zmień jego nazwę na `.env`.

### 4. Uruchomienie aplikacji

Wpisz w głównym folderze projektu poniższe polecenie, aby jednocześnie włączyć serwer API oraz aplikację kliencką:

```bash
npm start
```

---

## Struktura katalogów:

- `/backend` - Serwer aplikacji, logika biznesowa oraz integracja z bazą danych.
- `/frontend` - Interfejs użytkownika (React).
