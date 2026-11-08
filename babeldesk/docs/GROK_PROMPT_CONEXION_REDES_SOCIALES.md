# Prompt para Grok — Mejorar conexión de redes en BabelDesk

**Proyecto:** BabelDesk v0.2.0 (Electron, Windows, uso personal Pablo / LabelBabel)  
**Ruta local:** `C:\Users\pablo\Downloads\BabelDesk`  
**No confundir con:** VENUZ (`venuz-repo`, Next.js, labelbabel.com). BabelDesk **no tiene dominio público** ni servidor en la nube para OAuth callback (salvo que propongas uno mínimo).

**Frase para Pablo en Grok:** «Lee el brief BabelDesk conexión redes y entrégame el plan P0–P3 + spec OAuth Electron».

---

## Copiar desde aquí (mensaje a Grok)

Eres **Grok**, investigador y arquitecto de producto. Trabajas con **Pablo** y **Cursor** (único que implementa código cuando Pablo dice «aplica»). **Tú no tocas el repo ni inventas que algo ya está hecho.** Responde en **español**, directo, con **URLs oficiales** (Meta, TikTok, Microsoft). Si algo no está verificado en docs 2025–2026, marca **«no verificado»**.

### 1. Qué es BabelDesk

App **Electron + SQLite** en la PC de Pablo. Flujo: bajar video (yt-dlp) → cortar (ffmpeg 9:16) → crear post → cola → publicar.

- **Stack:** Node en main process, renderer HTML/JS, `better-sqlite3`, tokens cifrados con `STUDIO_MASTER_KEY` en `.env` (o `ALLOW_PLAIN_TOKENS=1` solo dev).
- **Scheduler:** cada 30 s **solo con la app abierta**; no hay worker en la nube.
- **Meta Graph API:** versión fijada `v26.0` en código.

### 2. Estado ACTUAL de «conectar redes» (lo que ya existe)

**No hay OAuth.** La pestaña **Mis Redes** es un formulario manual:

| Tipo en UI | `network` en DB | Conexión hoy | Publicación |
|------------|-----------------|--------------|-------------|
| Facebook Page | `facebook_page` | Pegar **Page access token** + **Page ID** | **Auto** vía `POST /{page-id}/feed` (texto + link). **Video local NO:** código tiene TODO — no usa `/videos` ni Reels todavía |
| Instagram Pro | `instagram` | Mismo token (Page) + **IG User ID** numérico | **Auto** si hay **mp4 local** en Inbox → upload resumable (Reels). Fotos necesitan URL pública |
| Grupo FB | `facebook_group` | Solo nombre + URL del grupo | **Assist:** copia caption al clipboard + abre URL en navegador (`awaiting_human`) |
| TikTok | `tiktok` | Nombre + ID/URL, token opcional | **Assist v1** por defecto. API solo si `TIKTOK_USE_API=1`; endpoint inbox/draft si app no audited |

**Indicadores UI:** 🟢 si hay `access_token_enc` (Page/IG) o si es grupo/TikTok (no exigen token). 🔴 = falta token en Page/IG.

**IPC relevante:** `accounts:save`, `accounts:list`, `accounts:delete` (delete **sin botón en UI** aún).

**Archivos clave (para que propongas cambios concretos):**

- `src/renderer/index.html` — form `#account-form`
- `src/renderer/app.js` — `refreshAccounts`, checkboxes en composer
- `src/main/main.ts` — IPC accounts, scheduler
- `src/main/db.ts` — `encryptToken` / `decryptToken`
- `src/connectors/metaPage.ts` — feed only + TODO video
- `src/connectors/instagram.ts` + `instagram-resumable.ts` — Reels local
- `src/connectors/groupAssist.ts`, `assistTiktok.ts`
- `src/connectors/tiktok.ts` — Content Posting API
- `src/scheduler/worker.ts` — auto vs manual assist
- `src/shared/types.ts` — `isSchedulerAutoNetwork`, niveles A/B/C de contenido

**Reglas de contenido (no romper):**

- Nivel A → Page + IG + TikTok (+ grupos manual)
- Nivel B → solo IG (+ grupos)
- Nivel C → Page + IG, no TikTok (+ grupos)

### 3. Dolores de Pablo (por qué hay que mejorar)

1. Pegar tokens a mano en Graph API Explorer es frágil (caducan, permisos confusos).
2. No hay flujo «**Conectar con Meta**» ni renovación automática.
3. Facebook Page con **video** no publica como reel/video nativo — solo feed texto/link.
4. Grupos y TikTok son **semi-manuales**; quiere saber el camino realista a **más automatización** sin violar ToS.
5. Quiere UX clara: probar conexión, ver permisos faltantes, borrar/editar cuenta, errores legibles en español.

### 4. Restricciones duras (respeta en tu propuesta)

- **App local / personal** — preferir soluciones que funcionen **sin** montar SaaS grande; si hace falta callback OAuth, explica opciones: `localhost` redirect en Electron, custom protocol (`babeldesk://`), o túnel temporal — pros/contras.
- **Secretos:** tokens nunca en git; seguir cifrado con master key.
- **Sin hotlinking** de media a terceros para IG (ya resuelven con archivo local).
- **TikTok:** muchas apps quedan en **Draft / SELF_ONLY** hasta audit — documenta el camino real de TikTok for Developers.
- **Meta:** permisos de Page + Instagram Content Publishing; diferencia **User token → Page token** → **long-lived**; App Review si aplica.
- **Cursor implementa** — tú entregas **spec**, no pseudocódigo gigante sin prioridad.

### 5. Lo que necesito que INVESTIGUES y ENTREGUES

#### A) Diagnóstico comparativo (tabla)

Para **Meta (Page + IG)**, **FB Groups**, **TikTok**:

- ¿OAuth oficial recomendado en 2025–2026 para app de escritorio?
- Permisos/scopes exactos (nombres actuales en Meta/TikTok docs).
- Duración de tokens y flujo refresh (Page long-lived, System User, etc.).
- Límites rate / cuotas relevantes para ~5–20 posts/día personal.
- Qué **sigue siendo imposible** por API (grupos, ciertos formatos).

#### B) Roadmap priorizado P0 → P3

Ejemplo de estructura (ajústala con evidencia):

- **P0 (mínimo viable UX):** botón «Probar conexión», mensajes de error Meta traducidos, editar/borrar cuenta en UI, wizard «qué pegar dónde» sin OAuth aún.
- **P1 (Meta OAuth en Electron):** flujo login Meta → seleccionar Page → resolver IG Business ID → guardar Page token long-lived cifrado; pantalla de «reconectar» cuando expire.
- **P2 (publicación completa):** video/reel en Page (`/videos`, `video_reels` o lo que indiquen docs actuales); scheduling Meta alineado con UI `scheduledAt`.
- **P3 (TikTok + grupos):** API TikTok con FILE_UPLOAD desde local; grupos — ¿solo assist mejorado (Deep link, WebView logged-in) o nada oficial?

Para **cada fase:** esfuerzo (días), riesgos, dependencias (App Review, dominio, HTTPS).

#### C) Spec UX (texto + wireframe ASCII)

Pantalla **Mis Redes** mejorada:

- Tarjetas por cuenta con estado (conectada / expira en X días / permiso faltante).
- Botones: Conectar Meta, Probar, Reconectar, Eliminar.
- Flujo primera vez para alguien no developer (sin asumir que conoce Graph Explorer).

#### D) Spec técnica para Cursor (handoff)

- Variables `.env` nuevas (ej. `META_APP_ID`, `META_APP_SECRET`, redirect URI).
- Cambios de schema SQLite si hace falta (`refresh_token_enc`, `token_expires_at`, `scopes_json`).
- Lista de **nuevos IPC** y endpoints Graph/TikTok a llamar (orden del flujo).
- **Checklist de prueba manual** (10 pasos) en Windows.

#### E) Alternativas si OAuth es overkill

- ¿Vale la pena **Buffer / Late / Publer API** para uso personal?
- ¿Riesgo de ban vs API oficial?
- Una recomendación honesta: **oficial vs tercero vs seguir assist manual** para grupos/TikTok.

#### F) Seguridad y compliance

- Almacenamiento de tokens en Electron (keytar vs cifrado actual).
- Qué pedir en Meta App Dashboard (Privacy Policy URL mínima si hace falta — app local sin web).

### 6. Formato de respuesta obligatorio

1. **Resumen ejecutivo** (≤ 15 líneas).
2. **Tabla** redes × auto/assist × API disponible.
3. **Roadmap P0–P3** con criterios «done».
4. **P0 detallado** listo para que Cursor lo implemente en 1 sesión.
5. **P1 OAuth Meta** — diagrama de secuencia (Mermaid) login → token → DB.
6. **Enlaces** (mínimo 8) a documentación oficial.
7. **Riesgos / no hacer** (3–5 bullets).
8. **JSON opcional** `babeldesk-social-connect-spec.json` con `{ "phases": [...], "meta_scopes": [...], "env_vars": [...] }` para importar en Cursor.

### 7. Lo que NO debes hacer

- No digas que OAuth «ya está» en BabelDesk — **no está**.
- No prometas autopost masivo en grupos FB si la API no lo permite.
- No inventes nombres de permisos — cita docs.
- No mezcles con VENUZ, Supabase, Vercel deploy, ni feed v8.
- No ejecutes git push ni toques `venuz-repo`.

### 8. Contexto multi-IA

- **Grok:** investigación, UX, roadmap, JSON spec.
- **Cursor:** código en `BabelDesk` cuando Pablo diga «aplica».
- **Antigravity:** solo tareas acotadas si Pablo las asigna.

Si tienes acceso al disco de Pablo, puedes leer la carpeta `BabelDesk` para validar; si no, usa **solo** este brief.

**Empieza por el resumen ejecutivo y la tabla; luego P0 y P1 Meta OAuth en Electron.**

---

## Notas para Pablo (no pegar a Grok)

- Tras la respuesta de Grok, pásale a Cursor: «aplica P0 del brief conexión redes» o pega el JSON.
- Probar siempre con `npm run dev` en BabelDesk; no es localhost:3000 de VENUZ.
- Meta Developers: tener app en modo Development vs Live afecta quién puede autorizar.
