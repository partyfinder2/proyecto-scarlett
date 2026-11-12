# Fábrica — operación urgente (post-auditoría 2026-11-10)

## Decisiones aplicadas en código

| Tema | Decisión |
|------|----------|
| Publicación | **BabelDesk** → `C:\Users\pablo\Downloads\BabelDesk\Inbox\` (Fase B activa tras QC verde) |
| Prioridad | **Lote afiliado** (Telegram / CSV) para *El Libro de la Sabiduría* |
| Descarga fallida | Estado `roto` / `necesita_cookies` — **sin** `video_demo` ni barras `testsrc` |
| Voz | **edge-tts** por defecto; si falla, el lote se detiene (no audio silencioso falso) |

## Antes de tu primer lote real

1. **Reinicia la Fábrica** (`arrancar_todo.bat` o acceso Escritorio) + **Ctrl+F5** en el panel.
2. **Cookies (recomendado):** `data/cookies.txt` — ver `data/COOKIES_INSTRUCCIONES.txt`.
3. **BabelDesk:** carpeta `C:\Users\pablo\Downloads\BabelDesk` con `npm run dev` abierto a la hora de publicar.
4. Los videos **#1 y #2** antiguos usaron fondo de prueba: **no los subas**. Manda de nuevo el link o márcalos como revisar en panel.

## Flujo diario

1. Telegram → links al bot.
2. Panel **📦 Lote** → Procesar siguiente (espera aviso).
3. **▶️** previsualizar en panel; archivo en `output/` y copia en BabelDesk `Inbox/`.
4. **Reinicia BabelDesk** tras actualizar código: `metodo-scarlett\scripts\sync_babeldesk_repo_a_descargas.bat`
5. BabelDesk → el video debe salir en biblioteca con **título + caption** del `.json` gemelo → Crear Post → programar/publicar FB+IG.

## Pendiente (no bloquea lote, sí escala masiva)

- Tarea Windows 02:00 + música en `assets/music_fallback/*.mp3`
- Meta OAuth en BabelDesk (checklist en BabelDesk docs)
- Panel: importar CSV masivo, botón pausa global
