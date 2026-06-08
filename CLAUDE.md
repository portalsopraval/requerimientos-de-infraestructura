# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

```powershell
cd "C:\Users\gvelizm\Downloads\Portal-Requerimientos-Sopraval"
python -m http.server 8787
# Open: http://localhost:8787
```

No build step. No dependencies to install. All libraries load from CDN at runtime.

## Deploy

Push to `main` → Netlify auto-deploys.
Live URL: **https://portal-necesidades-la-calera.netlify.app**

```powershell
git add -A && git commit -m "mensaje" && git push origin main
```

## Architecture

Single-page app: **one HTML file, one CSS file, one JS file**. No framework, no bundler.

```
index.html   → all screens as <div class="screen"> blocks; only one has class "active" at a time
style.css    → all styles; dark mode via [data-theme="dark"] on <html>
app.js       → all logic; ~1300 lines
```

**External scripts (CDN, loaded at bottom of index.html):**
- Firebase compat SDK v10.12.0 (`firebase-app-compat.js`, `firebase-firestore-compat.js`)
- Chart.js v4.4.0
- SheetJS xlsx@0.18.5

## Firebase / Firestore

```js
const fdb = firebase.firestore();  // global throughout app.js
```

**Collections:**
- `users` — user profiles with role, area, password (plaintext — pending Firebase Auth migration)
- `solicitudes` — all requests; each has `historial[]` and `comentarios[]` arrays
- `notificaciones` — per-user notifications for mantenimiento role
- `config/ticket_counter` — atomic counter for REQ-YYYY-NNN tickets
- `config/notif_backfill` — one-time migration flag

**Important:** Avoid two `where()` clauses on different fields in the same query — Firestore requires a composite index. Filter the second condition client-side instead.

## Screens and roles

Screens: `login`, `register`, `recover`, `dashboard`

Dashboard shows role-specific tabs defined in `TABS` object in `app.js`. Each role sees only its tabs:
- `user` → Nueva Solicitud, Mis Solicitudes
- `jefe_area` → + Revisión (filtered to their areaCode)
- `mantenimiento` → + Gestión de Costos, Gestión Visual; receives in-app notifications
- `supervisor` → Nueva, Mis, Revisión, Gestión Visual
- `gerente` → Autorización Pendiente, Revisión, Gestión Visual
- `admin` → Revisión, Gestión Visual, KPIs, Gestión de Usuarios

## Approval flow

```
Pendiente → (Mantenimiento sets costo) → Valorizada → (Gerente decides) → Autorizada | Postergada | Rechazada
```

`esActivable: true` on a solicitud means Mantenimiento must create an API or SIM document when authorized.

## Key patterns

**State:** `CU` (current user object), `_cache.users`, `_cache.sols`, `_cache.notifs`, `_activeTab`, `_pag` (pagination state per tab).

**Real-time listeners** start in `startListeners()` (called once after login via `appInit()`). Notification listener is started separately in `initDashboard()` only for mantenimiento role.

**Pagination:** `PAGE_SIZE = 20`. Use `pagSlice(arr, page)` and `pagHTML(total, page, tabKey)`. Reset `_pag[key] = 1` when filters change.

**Historial recording:** Always use `firebase.firestore.FieldValue.arrayUnion({...})` when appending to `historial` or `comentarios` arrays on update.

**Dark mode:** Toggle via `toggleDarkMode()`. Preference stored in `localStorage('theme')`. Applied on page load before app init (IIFE at top of app.js).

**Area encoding:** Areas stored as `areaCode|areaGroup|areaSub` in `<select>` values, split with `.split('|')` on use.

## Branding

- Primary blue: `#1B3580` (Agrosuper)
- Accent orange: `#F07B1B` (Agrosuper)
- Font: Open Sans
- Logos: `logo-agrosuper.png`, `logo-sopraval.png`

## Pending work

- **Firebase Authentication migration** (#1 + #2): Replace plaintext `password` field in Firestore with Firebase Auth Email/Password. Requires enabling in Firebase Console → Authentication → Sign-in method (already done). This will also provide persistent sessions (auto-login on page refresh).
