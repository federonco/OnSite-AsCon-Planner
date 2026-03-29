# OnSite Pipeline Tracker — Plan de Acción

## Proyecto
Pipeline tracker para acueducto DN1600 MSCL de 27km (Water Corporation, Perth WA).
- **App**: https://onsite-ascon.vercel.app/tracker
- **Repo**: https://github.com/federonco/OnSite-Ascon

---

## Estado actual
- [x] Proyecto Next.js 14 inicializado (TypeScript, Tailwind, App Router)
- [x] Dependencias instaladas (Leaflet, Turf.js, Supabase, SheetJS)
- [x] Mapa satelital ESRI funcionando en `/tracker`
- [x] Componentes: SegmentLayer, CheckpointLayer, LookaheadPanel, ViewportControls, StatusUpdater, ExcelImporter
- [x] API routes: `/api/segments`, `/api/checkpoints`, `/api/progress`, `/api/import`
- [x] Supabase: 3 tablas creadas (`alignment_segments`, `alignment_checkpoints`, `alignment_progress`) con RLS
- [x] Deploy en Vercel funcionando
- [x] Buscador de direcciones con Nominatim (Enter → fly to location)
- [ ] **Cargar polilínea de diseño (Shapefile)** ← PRÓXIMO
- [ ] Plotear cañería instalada sobre la polilínea
- [ ] Integrar data de OnSite-D y OnSite-PSP

---

## Data disponible en Supabase

### OnSite-D (Drainer) — Instalación de cañería
| Campo | Detalle |
|---|---|
| Registros | **100 pipe records** |
| Sección | McLennan Dr - Sec 3 (Ch 1800 → 3211.88m, backwards) |
| Crew | A (North region) |
| Campos clave | `chainage`, `date_installed`, `pipe_fitting_id`, `joint_type`, deflexiones V/H |
| Coordenadas | **NO** — solo chainage. Necesitamos la polilínea de diseño para interpolar lat/lng |
| Período | Enero–Marzo 2026 |

### OnSite-PSP (Backfill) — Compactación
| Campo | Detalle |
|---|---|
| Registros | **55 PSP records** |
| Sección | Section 2 (increment: 20m) |
| Campos clave | `chainage`, penetrómetro L1/L2/L3 a 150/450/750mm, `site_inspector`, `compactor_sn` |
| Coordenadas | **NO** — solo chainage |
| Inspector | Adam O'Neill |

---

## Plan de desarrollo — Próximos pasos

### Fase 1: Polilínea de diseño (Shapefile)
- [ ] Instalar librería `shapefile` (shp.js) para parsear .shp/.dbf en el browser
- [ ] Crear componente `ShapefileLoader.tsx` — botón para subir .shp + .dbf
- [ ] Parsear geometría → GeoJSON LineString
- [ ] Renderizar polilínea de diseño en el mapa (color blanco/gris, debajo de los segments)
- [ ] Guardar geometría en Supabase (nueva tabla o campo en `drainer_sections`)
- [ ] API route `/api/alignment` para CRUD de la polilínea

### Fase 2: Plotear cañería instalada
- [ ] Leer `drainer_pipe_records` de OnSite-D
- [ ] Interpolar coordenadas lat/lng a partir de chainage + polilínea de diseño
- [ ] Generar `alignment_segments` automáticamente desde los pipe records
- [ ] Colorear segmentos en el mapa: azul (pending), verde (installed), naranja (backfilled)
- [ ] Cruzar con PSP records para marcar segmentos como "backfilled"

### Fase 3: Funcionalidad completa del tracker
- [ ] Identificar laying front automáticamente (último pipe instalado)
- [ ] Viewport zones: backfill zone (60m atrás), lookahead (200m adelante)
- [ ] Cargar checkpoints (bends, fittings, crossings) desde el shapefile o manualmente
- [ ] Panel lateral con estadísticas en tiempo real
- [ ] "Go to Front" vuela al frente de instalación

### Fase 4: Integración avanzada
- [ ] Sync en tiempo real con OnSite-D (cuando se instala un pipe nuevo, aparece en el mapa)
- [ ] Sync con OnSite-PSP (cuando se compacta, el segmento cambia a naranja)
- [ ] Excel export de progreso
- [ ] Filtros por fecha, crew, sección
- [ ] Auth con Supabase Auth (ya existe en el ecosistema)

---

## Stack técnico
| Componente | Tecnología |
|---|---|
| Framework | Next.js 14, TypeScript, App Router |
| Styling | Tailwind CSS |
| Maps | Leaflet + React-Leaflet + ESRI Satellite tiles |
| Geospatial | Turf.js |
| Database | Supabase (PostgreSQL + RLS) |
| Excel | SheetJS (xlsx) |
| Shapefile | shp.js (por instalar) |
| Deploy | Vercel (free tier) |
| Auth | Supabase Auth (futuro) |

---

## Esquema de base de datos
```
regions
  └── crews (region_id → regions)
        ├── drainer_sections (crew_id → crews)
        │     ├── drainer_pipe_records (section_id)  ← OnSite-D
        │     ├── alignment_segments (section_id)    ← Pipeline Tracker
        │     └── alignment_checkpoints (section_id) ← Pipeline Tracker
        └── user_app_roles / permisos por app (modelo compartido; RLS vía get_admin_crew_ids u equivalente)

alignment_progress (segment_id → alignment_segments) ← Pipeline Tracker
psp_records (section_id → psp_sections)              ← OnSite-PSP
```
