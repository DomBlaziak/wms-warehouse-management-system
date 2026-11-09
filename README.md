# WMS - System Zarządzania Magazynem (Projekt Inżynierski)

Aplikacja typu Full-Stack zbudowana w architekturze PERN (PostgreSQL, Express, React, Node.js).

## Wymagania systemowe:

- Node.js (wersja LTS)
- PostgreSQL (uruchomiony lokalnie)

---

## Instrukcja uruchomienia aplikacji:

### 1. Pobranie projektu i przejście do katalogu

```bash
git clone https://github.com
cd wms-warehouse-management-system
```

### 2. Konfiguracja i uruchomienie warstwy serwerowej (Backend)

1. Otwórz terminal i przejdź do katalogu serwera:
   ```bash
   cd backend
   ```
2. Zainstaluj wszystkie wymagane pakiety i zależności:
   ```bash
   npm install
   ```
3. Przygotuj plik środowiskowy: skopiuj plik `.env.example`, zmień jego nazwę na `.env` i wprowadź własne dane dostępowe do lokalnej bazy danych PostgreSQL.
4. Uruchom serwer backendowy:
   ```bash
   npm start
   ```

### 3. Konfiguracja i uruchomienie aplikacji klienckiej (Frontend)

1. Otwórz drugi, osobny terminal i przejdź do katalogu aplikacji klienckiej:
   ```bash
   cd frontend
   ```
2. Zainstaluj wymagane pakiety i zależności:
   ```bash
   npm install
   ```
3. Przygotuj plik środowiskowy: skopiuj plik `.env.example` i zmień jego nazwę na `.env`.
4. Uruchom aplikację kliencką React:
   ```bash
   npm start
   ```

---

## Struktura katalogów projektu:

- `/backend` - Serwer aplikacji, logika biznesowa oraz integracja z bazą danych.
- `/frontend` - Interfejs użytkownika (React).
