# Quitar marca de agua — BabelDesk

## Modos (UI al descargar o botón 💧 en Mis Videos)

| Modo | Qué hace |
|------|----------|
| **Off** | Solo descarga el video. |
| **Estándar** | ffmpeg `delogo` en esquinas típicas (TikTok, IG, etc.). |
| **Máximo** (recomendado) | Estándar + **rejilla agresiva** (banda inferior, superior, franja central) + **detección IA** (OpenRouter/Gemini) en 3 fotogramas → más cajas delogo + **difuminado** en marcas muy grandes. |

## Requisitos

- **ffmpeg** en PATH (igual que Cortar).
- Modo **Máximo con IA:** API key de OpenRouter en **Ajustes** (o `OPENROUTER_API_KEY` en `.env`). Sin key, Máximo = solo capa agresiva ffmpeg.

## Límites honestos

- No es inpainting Hollywood: zonas muy grandes se **difuminan** o **delogo** (puede verse suavizado).
- Marcas animadas en el centro del sujeto pueden dejar rastro.
- Revisar siempre el preview antes de publicar.
- **Batch / Máximo:** el difuminado usa `boxblur` con radio ≤9 (compatible ffmpeg reciente). Si blur falla en una zona, se usa `delogo` de respaldo; no deberían quedar `.__nowm.*.mp4` rotos.

## Archivos de código

- `src/connectors/watermarkRemover.ts` — pipeline ffmpeg
- `src/connectors/watermarkVision.ts` — detección IA (OpenRouter)
- IPC: `watermark:remove`, descarga `{ url, removeWatermarkMode }`

## Probar

1. `npm run dev`
2. Ajustes → OpenRouter OK (para IA).
3. Descargar con **Máximo** o 💧 en un video del Inbox.
