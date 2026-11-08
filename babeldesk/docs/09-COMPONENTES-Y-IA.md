# Componentes BabelDesk + IA

## Prioridad

| Pri | Componente | Estado |
|---|---|---|
| P0 | Ventana BabelDesk + Inbox + cola + panel fallos | ✅ base Cursor 29-sep |
| P0 | Token Meta manual + assist grupos/TikTok | ✅ |
| P1 | CopyEngine OpenRouter (3 variantes JSON) | ✅ stub usable |
| P1 | Encode 9:16 + ffmpeg | ⬜ `scripts/encode-reel.ps1` |
| P2 | Plantillas + UTM | ⬜ |
| P3 | TikTok API (`TIKTOK_USE_API=1`) | ⬜ |

## Copy por red

Ver tabla en brief Pablo — implementado en `copyEngine.ts`.

## OpenRouter

Una llave en `.env`. Modelo en Settings vía `OPENROUTER_MODEL`.

## trends.txt (opcional)

Pega 10 palabras/semana; pásalas a `copy:generate` como `trends[]`.

## Multi-IA

Cursor integra y commitea local. Claude/Grok editan docs o entregan zip → «integra» en Cursor.
