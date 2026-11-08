# HANDOFF Cursor — integración Claude + fixes (29-sep-2026)

## Hecho en este commit

- Renombre producto **BabelDesk** (ventana `BabelDesk — LabelBabel`)
- `src/main/db.ts` SQLite + cifrado real (no key cero)
- `src/scheduler/worker.ts` cron solo Page/IG; grupos/TikTok assist manual
- Reglas nivel: **B → solo IG**, **C → sin TikTok**
- Electron main + preload IPC + panel HTML (cuentas, inbox, cola, composer, grupos, logs)
- Inbox watcher (`Inbox/` — sin downloader)
- CopyEngine OpenRouter (`src/main/copyEngine.ts`) — P1
- Fixes: TikTok `published_private`, IG poll timeout
- **Recovery publishing:** ver `docs/10-HANDOFF-CURSOR-CORREGIDO.md` (timeout 5 min + rutas reales)

## Bugs Claude que se corrigieron

1. TikTok status siempre `published`
2. Grupos en cron automático
3. Nivel B/C incompletos
4. Cifrado con key de ceros
5. `crypto` import al final del worker
6. Tests que validaban comportamiento incorrecto

## Archivos clave para la siguiente IA

| Archivo | Rol |
|---|---|
| `docs/07-USO-PERSONAL-LOCAL.md` | Norte v1 sin dominio |
| `docs/09-COMPONENTES-Y-IA.md` | Prioridades P0–P3 |
| `src/main/main.ts` | Electron + IPC |
| `src/scheduler/worker.ts` | Cola y reglas |
| `docs/01-API-REALIDAD.md` | Verdad APIs (Grok) |

## Cómo correr (Pablo)

```powershell
cd C:\Users\pablo\Downloads\BabelDesk
copy .env.example .env
npm install
npm run dev
```

## P1 / P2 (detalle en doc 10)

**P1 (próxima sesión):**

- Timeout automático `publishing` (>5 min) — `src/main/db.ts` ✅
- IG resumable upload sin URL — `src/connectors/instagram.ts` (polling ya existe; upload local no)
- `scripts/encode-reel.ps1` — **no existe aún** (ffmpeg 9:16 → carpeta `Library/`)
- Calendario visual de cola — `src/renderer/`

**P2 (después):** Clipper local · TikTok API real (post-audit) · plantillas + UTM

**Mandato operativo:** `docs/10-HANDOFF-CURSOR-CORREGIDO.md`

## SIGUIENTE TAREA PARA CURSOR

Implementar **Tarea 2** (IG resumable) según doc 10. No pasar a encode-reel hasta test IG verde.

## NO hacer

- Downloader
- Playwright en grupos
- Commitear `.env`
