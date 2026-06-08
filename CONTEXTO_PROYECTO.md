# Portal de Requerimientos de Infraestructura – Sopraval / Agrosuper
## Documento de contexto para continuación del desarrollo

---

## 1. DESCRIPCIÓN GENERAL

Sistema web interno para que los trabajadores de la Planta Industrial Sopraval puedan:
- Ingresar solicitudes de mejoras de infraestructura o normalización de condiciones
- Adjuntar fotografías de respaldo
- Hacer seguimiento del estado de sus solicitudes

El flujo de aprobación involucra 3 actores: **Solicitante → Mantenimiento (costo) → Gerente de Planta (decisión)**.

---

## 2. ESTADO ACTUAL DEL PROYECTO

### ✅ COMPLETADO
- Aplicación web funcional (HTML + CSS + JS) con:
  - Login / Registro de usuarios
  - 7 áreas y sus sub-áreas completas
  - Formulario de solicitudes con foto obligatoria
  - Flujo de aprobación por roles
  - Panel de gestión visual con gráficos (Chart.js)
  - Diseño con colores y logos oficiales de Agrosuper/Sopraval

### 🔄 PENDIENTE (próximo paso)
- **Migración a Power Apps** (ver Sección 7)
  - El usuario tiene Microsoft 365 con acceso a Power Apps, SharePoint y Power Automate
  - Tenant SharePoint: `https://agrosuper.sharepoint.com`
  - Usuario responsable: `fescobara@sopraval.cl`

---

## 3. ARCHIVOS DEL PROYECTO

```
agrosuper-solicitudes/
├── index.html          → Estructura HTML de toda la app
├── style.css           → Estilos (paleta Agrosuper: azul #1B3580, naranja #F07B1B)
├── app.js              → Lógica completa (auth, CRUD, gráficos, roles)
├── logo-agrosuper.png  → Logo oficial Agrosuper
├── logo-sopraval.png   → Logo oficial Sopraval
└── CONTEXTO_PROYECTO.md → Este archivo
```

---

## 4. ARQUITECTURA TÉCNICA ACTUAL

- **Frontend:** HTML5 + CSS3 + JavaScript vanilla
- **Almacenamiento:** localStorage del navegador (temporal, solo en 1 PC)
- **Gráficos:** Chart.js v4.4.0 (CDN)
- **Fuente:** Open Sans (Google Fonts)
- **Sin backend:** Todo corre en el navegador

### Servidor local para pruebas:
```powershell
cd "C:\Users\fescobara\Agente Asistente\agrosuper-solicitudes"
python -m http.server 8787
# Acceder en: http://localhost:8787
```

---

## 5. ROLES Y USUARIOS

### Roles del sistema:
| Rol | Descripción | Permisos |
|---|---|---|
| `user` | Trabajador regular | Ingresa solicitudes, ve las suyas |
| `jefe_area` | Jefe de área | Ve solicitudes de su área |
| `mantenimiento` | Subgerente Mantenimiento | Agrega costos, ve todas |
| `supervisor` | Jefa Administración | Ve todas con costos |
| `gerente` | Gerente de Planta | Autoriza / Posterga / Rechaza |

### Usuarios precargados (contraseña: `Sopraval2026`):
| Email | Nombre | Rol |
|---|---|---|
| fescobara@sopraval.cl | Fabián Escobar | mantenimiento |
| bgutierrezl@agrosuper.com | Barbara Gutierrez | supervisor |
| jbarrios@agrosuper.com | Jorge Barrios | jefe_area (Producción) |
| rabarzua@sopraval.cl | Rodrigo Abarzua | gerente |
| mcordovas@agrosuper.com | Gabriela Cordova | jefe_area (Calidad) |
| amorgado@sopraval.cl | Andrea Morgado | jefe_area (Personas) |
| rtrigo@sopraval.cl | Ricardo Trigo | jefe_area (Despacho) |
| nmarquez@sopraval.cl | Nicolás Marquez | jefe_area (Rendering) |

---

## 6. ÁREAS DE LA PLANTA

```
A) Producción:      Recepción, Matanza, Eviscerado, Menudencias,
                    Chiller-Túnel de frío, Trozado-Mezanine,
                    Empaque, Sala de Marinado, Deshuesado

B) Administración:  Control de Producción, Medio Ambiente-RILes,
                    Bodega, Administración Gral.

C) Calidad:         Higiene, Calidad

D) Personas:        SSO, Gestión de Contratistas,
                    Gestión Social, Personas General

E) Mantenimiento:   Mtto. Faenadora, Mtto. Servicios,
                    Mtto. Refrigeración, Planificación Mtto. y Proyectos

F) Despacho

G) Planta de Rendering
```

---

## 7. FLUJO DE APROBACIÓN

```
[Usuario ingresa solicitud]
         ↓
    Estado: PENDIENTE
         ↓
[Mantenimiento (fescobara) agrega costo estimado]
         ↓
    Estado: VALORIZADA
         ↓
[Gerente de Planta (rabarzua) decide]
    ↙         ↓         ↘
AUTORIZADA  POSTERGADA  RECHAZADA
```

---

## 8. CAMPOS DE LA SOLICITUD

| Campo | Tipo | Notas |
|---|---|---|
| Título | Texto | Obligatorio |
| Descripción | Texto largo | Obligatorio |
| Área | Select jerárquico | A/B/C/D/E/F/G + sub-área |
| Motivo | Select | Inocuidad, Medio Ambiente, Productividad, Seguridad, Sindicato, Gerencia |
| Fotografía | Imagen | Obligatorio, máx 2MB, guardada en base64 |
| Costo estimado | Número (CLP) | Lo ingresa Mantenimiento |
| Notas Mantenimiento | Texto | Lo ingresa Mantenimiento |
| Comentario Gerente | Texto | Lo ingresa el Gerente |

---

## 9. PRÓXIMO PASO: MIGRACIÓN A POWER APPS

### Información del tenant Microsoft:
- **SharePoint:** https://agrosuper.sharepoint.com
- **Usuario administrador:** fescobara@sopraval.cl
- **Plan:** Microsoft 365 (incluye Power Apps, Power Automate, SharePoint)

### Listas SharePoint a crear:
1. **Solicitudes** – con todos los campos descritos en Sección 8
2. **Usuarios** – para gestión de roles (o usar grupos de Microsoft 365)

### Arquitectura objetivo Power Apps:
```
Canvas App (Power Apps)
    ↓
SharePoint Lists (datos)
    ↓
Power Automate (notificaciones email):
  - Email a Mantenimiento → nueva solicitud
  - Email a Gerente → solicitud valorizada
  - Email a Solicitante → decisión tomada
```

### Pasos pendientes:
1. ✅ Crear sitio SharePoint "Portal Requerimientos Sopraval"
2. ✅ Crear lista "Solicitudes" con columnas definidas
3. ⬜ Crear Canvas App en Power Apps conectada a SharePoint
4. ⬜ Configurar flujos Power Automate para notificaciones
5. ⬜ Migrar usuarios precargados a grupos/permisos de Microsoft 365

---

## 10. DISEÑO / BRANDING

- **Color primario:** Azul `#1B3580` (Agrosuper)
- **Color acento:** Naranja `#F07B1B` (Agrosuper)
- **Tipografía:** Open Sans
- **Logo login:** logo-agrosuper.png (panel izquierdo)
- **Logo panel derecho login:** logo-sopraval.png (con franja blanca de fondo)
- **Navbar:** fondo blanco, texto azul, borde inferior naranja

---

## 11. INSTRUCCIONES PARA CONTINUAR EN CLAUDE

Para continuar este proyecto en una nueva sesión de Claude, adjunta este archivo
junto con los archivos del proyecto y usa el siguiente prompt inicial:

```
Continúa el desarrollo del Portal de Requerimientos de Infraestructura de Sopraval/Agrosuper.
Adjunto el archivo CONTEXTO_PROYECTO.md con todo el historial y estado actual.
El próximo paso es migrar la app HTML a Power Apps conectado a SharePoint en
https://agrosuper.sharepoint.com con el usuario fescobara@sopraval.cl.
```

---

*Documento generado el 04-06-2026 | Desarrollado con Claude (Anthropic)*
