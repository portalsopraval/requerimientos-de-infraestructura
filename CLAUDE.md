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
app.js       → all logic; ~2000+ lines
```

**External scripts (CDN, loaded at bottom of index.html):**
- Firebase compat SDK v10.12.0 (`firebase-app-compat.js`, `firebase-firestore-compat.js`, `firebase-auth-compat.js`)
- Chart.js v4.4.0
- SheetJS xlsx@0.18.5
- EmailJS browser v4 (`@emailjs/browser`)

## Firebase / Firestore

```js
const fdb   = firebase.firestore();  // global throughout app.js
const fauth = firebase.auth();       // Firebase Auth (Email/Password)
```

**App entry point — persistent session:**
```js
fauth.onAuthStateChanged(async (firebaseUser) => { ... });
```

**Collections:**
- `users` — user profiles: `{ id, email, name, role, areaCode, areaGroup, areaSub, title }`
- `solicitudes` — requests with `historial[]` and `comentarios[]` arrays
- `notificaciones` — per-user in-app notifications
- `config/ticket_counter` — atomic counter for REQ-YYYY-NNN tickets
- `config/notif_backfill` — one-time migration flag

**Important:** Avoid two `where()` clauses on different fields — Firestore requires a composite index. Filter the second condition client-side.

**Admin creates users** via REST API to avoid losing current session:
```js
fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, ...)
```

## Roles and tabs

Tabs per role defined in `TABS` object:
- `user` → Inicio, Nueva Solicitud, Mis Solicitudes
- `jefe_area` → + Revisión (filtered to their areaCode)
- `mantenimiento` → + Dashboard, Gestión de Costos, Revisión, Activables, Gestión Visual
- `supervisor` → + Revisión, Gestión Visual
- `gerente` → Inicio, Mi Dashboard, Autorización Pendiente, Revisión, Gestión Visual
- `admin` → Revisión, Gestión Visual, KPIs, Gestión de Usuarios

**Special mantenimiento sub-roles (same `mantenimiento` role, different behavior):**
- `fescobara@sopraval.cl` → coordinator (`esCoordinador()` returns true): derives solicitudes to technicians, sees Pendiente + PendienteEjecucion + PendienteRevision in Gestión de Costos
- `cmadridp`, `gzapata`, `ccrojas`, `cllopez` @sopraval.cl → technicians: see only `Derivada` solicitudes assigned to them (`asignadoA.id/name/email`)

## Complete approval flow

```
Pendiente
  └─ Fescobara assigns to technician ──────────────► Derivada
       └─ Technician enters cost ──────────────────► Valorizada
            └─ Gerente authorizes ─────────────────► PendienteCodigo
                 └─ Solicitante enters API/SIM+CECO ► PendienteEjecucion
                      └─ Fescobara assigns executor ► EnEjecucion
                           └─ Executor returns work ► PendienteRevision
                                └─ (Fescobara closes)► Completada / final

Gerente can also: Postergar | Rechazar (from Valorizada)
```

**Key solicitud fields added during flow:**
- `asignadoA: { id, name, email }` — technician for cost estimation
- `ceco: { numero, nombre }` — set by gerente on authorization
- `tipoCodigoSolicitud: 'API'|'SIM'`, `codigoSolicitud` — set by solicitante
- `ejecutorAsignado: { id, name, email }` — set by Fescobara for execution
- `esActivable: boolean` — set by Fescobara at first derivation

**Gerente visibility:** only sees solicitudes with estado `Valorizada` or later (`Autorizada`, `PendienteCodigo`, etc.). Never sees `Pendiente` or `Derivada`.

## Modal section visibility logic (openModal)

Each section in the modal is shown/hidden based on `s.estado` and `CU`:

| Section | Condition |
|---------|-----------|
| `modal-derivar-section` | `esCoordinador()` AND (Pendiente OR PendienteEjecucion OR Autorizada+codigoSolicitud) |
| `modal-costo-section` | mantenimiento, not coordinator, Derivada, `asignadoA` matches CU |
| `modal-codigo-section` | (PendienteCodigo OR Autorizada) AND creator matches CU AND no code yet |
| `modal-auth-section` | gerente AND Valorizada |
| `modal-ejecucion-section` | EnEjecucion AND `ejecutorAsignado` matches CU |
| `modal-change-section` | gerente AND post-decision states |

**Creator matching** uses `s.userId === CU.id || s.userName === CU.name` (name as fallback for ID mismatches).
**Executor/assigned matching** uses id OR name OR email checks for robustness.

## EmailJS

Credentials in app.js (init at top):
- Service ID: `service_xcfs28z`
- Template ID: `template_hnkmwy9`
- Public Key: `1r8XDNUiPNKGswq3W`

`sendEmail(toEmail, mensaje, ticket, area, prioridad)` — strips HTML tags, fires and forgets (`.catch` only). Currently disabled — to re-enable, uncomment calls to `sendEmail()`.

## Key patterns

**Global state:** `CU` (current user), `_cache.{users,sols,notifs}`, `_activeTab`, `_pag` (pagination per tab), `openSolId` (modal).

**Real-time listeners** start in `startListeners()`. Notification listener starts in `initDashboard()` for all roles.

**Pagination:** `PAGE_SIZE = 20`. Use `pagSlice(arr, page)` and `pagHTML(total, page, tabKey)`. Reset `_pag[key] = 1` on filter change.

**Historial:** Always `firebase.firestore.FieldValue.arrayUnion({fecha, usuario, rol, accion, detalle, tipo})`.

**Image compression:** `compressImage(file, maxW=1200, quality=0.72)` → base64 JPEG. Max 3 photos per solicitud stored as `fotos[]` + `foto` (backward compat).

**Area encoding:** `areaCode|areaGroup|areaSub` in `<select>` values. `AREA_LABELS` maps areaCode → display name (no letter prefixes).

**Charts:** `chartCount`, `chartCost` (pie, Gestión Visual); `chartTendencia`, `chartRankingAreas`, `chartComparativo` (KPIs admin). Always destroy before re-creating.

## Branding

- Primary blue: `#1B3580` (Agrosuper)
- Accent orange: `#F07B1B` (Agrosuper)
- Font: Open Sans
- Logos: `logo-agrosuper.png`, `logo-sopraval.png`
- Nav title: "Requerimientos de Infraestructura"
