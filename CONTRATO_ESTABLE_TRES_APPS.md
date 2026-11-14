# CONTRATO DE ESTABILIDAD Y CANDADOS DE CÓDIGO (TRES APPS)
Fecha de sellado: 13 de noviembre de 2026  
Autorizado para: Pablo — Ecosistema Afiliado Scarlett

Este documento fija la **SUPERFICIE DE CÓDIGO CERRADA Y BLINDADA** para las tres aplicaciones del ecosistema.  
**Cualquier programador, modelo de IA (Cursor, AntiGravity, Copilot) o actualización futura TIENE ESTRICTAMENTE PROHIBIDO modificar o eliminar lo especificado aquí sin orden explícita de Pablo.**

---

## 1. BABELDESK (`Downloads/BabelDesk` y `metodo-scarlett/babeldesk`)

### Componentes Cerrados (No Tocar)
1. **Descarga de Máxima Calidad (`downloader.ts`):**
   - El selector de formatos de yt-dlp debe priorizar la resolución nativa original (hasta 4K / 2160p) para permitir recortar y encuadrar verticalmente en 9:16 sin perder nitidez.
   - **Prohibido:** volver a limitar o 'cappear' descargas a 1080p o 720p.
2. **Corte Rápido sin Pérdida (`videoCutter.ts`):**
   - Operaciones de corte optimizadas que conservan la fidelidad original del clip.
3. **Vigilante de Inbox con Metadatos (`inbox-watcher.ts` y SQLite `db.ts`):**
   - Lee archivos gemelos `.json` generados por la Fábrica o Ranking App.
   - Carga automáticamente `title` (gancho) y `caption` en el formulario de "Crear Post".
4. **Puente con Rankings Scarlett (`main.ts` y `src/renderer/app.js`):**
   - Botón de Trofeo 🏆 en cada tarjeta de video.
   - Envia el video vía POST a `http://127.0.0.1:5002/api/importar-y-guardar`.
   - Si Rankings está cerrado, ofrece abrirlo automáticamente (`ranking:launch`).
   - Límite de 10 clips con aviso interactivo de vaciado y reinicio.
5. **Script de Sincronización:**
   - `scripts/sync_babeldesk_repo_a_descargas.bat` es el canal oficial de despliegue de cambios entre repo y la app en Descargas.

---

## 2. FÁBRICA DE CONTENIDO (`metodo-scarlett/fabrica-de-contenido`)

### Componentes Cerrados (No Tocar)
1. **Puerto Fijo y Worker (`worker/app.py`):**
   - Corre exclusivamente en `127.0.0.1:5001`.
   - Prohibido cambiar el puerto o mezclarlo con Ranking App (5002).
2. **Pestaña y Endpoints de 🏆 Rankings:**
   - `GET /api/rankings`: lista los videos de ranking exportados.
   - `GET /api/rankings/{stem}/video`: streaming de video MP4.
   - `GET /api/rankings/{stem}/miniatura`: preview de imagen.
   - `POST /api/rankings/{stem}/enviar-a-babeldesk`: entrega atómica con archivo gemelo `.json` en `BabelDesk\Inbox`.
3. **Módulo de Entrega (`worker/babeldesk_entrega.py`):**
   - Función canónica `entregar_ranking_en_inbox` con soporte de título, gancho y caption.
4. **Ventana de Escritorio Propia (`scripts/ventana_fabrica.py`):**
   - Debe abrir mediante WebView2 nativo (`webview.start(gui="edgechromium", icon=ico)`) con `assets/fabrica.ico` y AppUserModelID `Scarlett.FabricaContenido.1`.
   - **Prohibido:** abrir Google Chrome con pestañas o iconos de navegador externo.

---

## 3. RANKINGS SCARLETT (`metodo-scarlett/ranking-app`)

### Componentes Cerrados (No Tocar)
1. **Puerto Fijo y Servidor (`app.py`):**
   - Corre exclusivamente en `127.0.0.1:5002`.
   - Prohibido cambiar el puerto o invadir el 5001.
2. **Calidad Cinematográfica de Render (`render/exportar.py` y `render/segmentos.py`):**
   - Factor de calidad constante: `CRF 15` con `-tune film` (preset `medium` / `fast`).
   - Escalado de alta precisión: flags `lanczos+accurate_rnd`.
   - Nitidez adaptativa: filtro `unsharp=5:5:0.5:5:5:0.0` para recuperar textura sin artefactos.
   - Concatenación sin pérdida: `-c copy` para empalmar los segmentos normalizados sin re-codificación.
   - **Prohibido:** reintroducir `veryfast`, bajar a CRF 18-24, o cambiar el escalado a bilinear/bicubic.
3. **Overlays Pillow (No drawtext):**
   - Letreros y listas generados como PNGs transparentes de alta resolución mediante Pillow.
4. **Sincronización en Tiempo Real (SSE y Anti-Caché):**
   - `GET /api/proyecto/stream`: Server-Sent Events que empuja cambios instantáneos al panel cuando BabelDesk manda un clip.
   - `GET /api/proyecto/version`: hash MD5 de estado.
   - Cabeceras `Cache-Control: no-store, no-cache, must-revalidate` en `GET /` y `GET /api/proyecto`.
5. **Ventana de Escritorio Propia (`scripts/ventana_ranking.py`):**
   - Debe abrir mediante WebView2 nativo (`webview.start(gui="edgechromium", icon=ico)`) con `assets/ranking_app.ico` y AppUserModelID `Scarlett.RankingApp.1`.
   - **Prohibido:** abrir Google Chrome con pestañas o iconos de navegador externo.

---

## 4. PROTOCOLO DE ACTUALIZACIONES FUTURAS
1. **Toda nueva funcionalidad debe ser ADITIVA:** se crean nuevos endpoints, nuevas pantallas o nuevos scripts auxiliares sin modificar la firma ni el comportamiento de los componentes sellados.
2. **Ejecución obligatoria del test de candados:** Antes de dar por finalizada cualquier sesión o cambio de código, es obligatorio correr:
   ```bash
   python metodo-scarlett/tests/test_candados_tres_apps.py
   ```
   Si el test no pasa con 100% de éxito, el cambio se considera inválido y debe revertirse.

