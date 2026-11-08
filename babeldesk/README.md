# BabelDesk — LabelBabel

App de **escritorio local**: descargar (yt-dlp), quitar marca de agua, cortar, encolar y publicar Page/IG/TikTok.

- Carpeta: `C:\Users\pablo\Downloads\BabelDesk\`
- **Leer primero (todo el equipo):** [`docs/EMPEZAR_AQUI.md`](docs/EMPEZAR_AQUI.md) — uso diario, git opcional, redes opcionales
- Marca de agua: [`docs/WATERMARK_REMOVER.md`](docs/WATERMARK_REMOVER.md)
- Redes Meta/TikTok: `docs/META_OAUTH_CHECKLIST.md`, `docs/TIKTOK_OAUTH_CHECKLIST.md`

## Correr

```powershell
cd C:\Users\pablo\Downloads\BabelDesk
copy .env.example .env
npm install
npm run dev
```

## Tests

```powershell
npm run test:src
```

## Acceso rápido (escritorio)

| Launcher | Consola |
|---|---|
| `abrir-babeldesk.bat` | Sí (minimízala; si la cierras, cierra la app) |
| `abrir-babeldesk-oculto.vbs` | No (solo dev con `npm run dev`) |

## Instalador Windows (.exe) — sin terminal

```powershell
cd C:\Users\pablo\Downloads\BabelDesk
npm install
npm run build:win
```

Salida en **`release/`** (no `dist/` — ahí va el JS compilado):

- `release/BabelDesk Setup.exe` — instalador NSIS (icono escritorio + menú Inicio)
- `release/BabelDesk-Portable-0.2.0.exe` — portable

Tras instalar, copia tu `.env`, `data/` e `Inbox/` a la carpeta donde quedó **BabelDesk.exe** (o deja datos en la carpeta de dev y apunta desde ahí la primera vez).

## Actualizar sin perder datos

Cierra la app → copia carpeta nueva encima → **no borres** `data/`, `.env`, `Inbox/`.
