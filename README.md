# WMS - Warehouse Management System (Projekt Inżynierski)

System zarządzania magazynem (WMS) realizowany jako projekt inżynierski. Aplikacja typu Full-Stack zbudowana w architekturze PERN (PostgreSQL, Express, React, Node.js).

## Wymagania wstępne

- **Node.js** (wersja LTS)
- **PostgreSQL** (uruchomiony lokalnie)

---

## Instalacja i uruchomienie lokalne

### 1. Klonowanie repozytorium

```bash
git clone https://github.com
cd wms-warehouse-management-system
```

### 2. Konfiguracja i start Backend-u

1. Przejdź do katalogu serwera:
   ```bash
   cd backend
   ```
2. Zainstaluj biblioteki:
   ```bash
   npm install
   ```
3. Stwórz plik `.env` na podstawie szablonu:
   - Skopiuj plik `.env.example` i zmień nazwę na `.env`
   - Uzupełnij hasło do swojej lokalnej bazy danych PostgreSQL.
4. Uruchom serwer:
   ```bash
   npm run dev
   ```

### 3. Konfiguracja i start Frontend-u

1. Otwórz nowy terminal w głównym folderze i przejdź do aplikacji klienckiej:
   ```bash
   cd frontend
   ```
2. Zainstaluj biblioteki:
   ```bash
   npm install
   ```
3. Stwórz plik `.env` na podstawie szablonu:
   - Skopiuj plik `.env.example` i zmień nazwę na `.env`
4. Uruchom aplikację:
   ```bash
   npm start
   ```

---

## Struktura projektu

- `/backend` - Serwer API (Node.js + Express) z połączeniem do bazy danych PostgreSQL.
- `/frontend` - Interfejs użytkownika (React).
