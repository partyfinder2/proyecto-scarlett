# BabelDesk — uso personal local (autoridad sobre docs viejos)

**Nombre:** BabelDesk — LabelBabel  
**Carpeta:** `C:\Users\pablo\Downloads\BabelDesk\`  
**Costo app:** $0 (sin Vercel, sin dominio obligatorio)

## Qué corre en tu PC

| Red | Motor v1 |
|---|---|
| Facebook Page | Token Graph pegado a mano → API feed |
| Instagram Pro | Token + Reels (foto JPEG aún necesita URL pública; preferir video) |
| TikTok | **Assist:** abre tiktok.com/upload + clipboard |
| Grupos FB | **Assist:** abre URL + clipboard. Tú publicas |

## Qué NO hace

- Downloader / quitar watermark de terceros
- Groups API (muerta desde abr-2024)
- OAuth con dominio (opcional después; no requerido v1)

## Datos que no borrar al actualizar

- `data/` (SQLite)
- `.env`
- `Inbox/` (tus videos)

## Reintentos

3 intentos: ~1 min, 5 min, 15 min. Luego rojo hasta que pulses Reintentar.

## Tokens

`.env`: `STUDIO_MASTER_KEY=` (frase larga) o `ALLOW_PLAIN_TOKENS=1` solo dev.

## Copy IA

`OPENROUTER_API_KEY=` + opcional `OPENROUTER_MODEL=google/gemini-2.5-flash`
