# Realidad de APIs — septiembre 2026

Fuente: docs oficiales Meta Graph v26.0 + TikTok Content Posting API.  
Si un tutorial de 2023 dice “post to groups with Graph”, está muerto.

## 1. Facebook Page — SÍ

Endpoint: `POST https://graph.facebook.com/v26.0/{page-id}/feed`

Token: **Page Access Token** (no User token).

Permisos típicos:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

Publicar ahora:

```
message, link, published=true
```

Programar en Meta (10 min – 30 días):

```
published=false
scheduled_publish_time=<unix seconds>
```

Reels de Page: `POST /{page-id}/video_reels` — tope ~30 Reels API / 24 h.

No se puede:

- Perfil personal (`publish_actions` murió 2018–2020)
- Groups por API

## 2. Facebook Groups — NO (API)

Meta quitó `publish_to_groups` y `groups_access_member_info` el **22 abr 2024** (Graph v19).  
Sigue fuera en v26.0 (jul 2026). Buffer/Hootsuite tampoco pueden.

Lo que SÍ existe:

| Camino | Quién | Riesgo |
|---|---|---|
| Manual en facebook.com | Cualquier miembro | Ninguno extra |
| Programar nativo en grupo | Solo admin/mod del grupo, 1 grupo, ~29 días | Bajo |
| Browser extension / Playwright “como si fueras tú” | ToS gris / detección | Ban, checkpoint |
| Graph API third-party | Nadie | 400/200 permission |

**Decisión v1 de esta app:** modo `ASSIST_GROUP`.

1. Usuario elige grupos (lista local de URLs).
2. App copia caption + adjunta media al clipboard.
3. Abre `https://www.facebook.com/groups/{id}`.
4. Log: `awaiting_human`.
5. Opcional: delay 8–25 min entre grupos (humano).

No implementar login guardado ni click automático en v1.

## 3. Instagram — SÍ, con condiciones

Solo cuenta **Professional** (Business o Creator).

Dos logins:

| | Instagram Login | Facebook Login |
|---|---|---|
| Host | graph.instagram.com | graph.facebook.com |
| Token | Instagram User | Page token |
| Permisos publish | `instagram_business_basic` + `instagram_business_content_publish` | `instagram_basic` + `instagram_content_publish` + pages_* |

Flujo:

1. `POST /{ig-user-id}/media` → container (`image_url` o `video_url` + `media_type=REELS`)
2. Poll `status_code` hasta FINISHED
3. `POST /{ig-user-id}/media_publish?creation_id=`

Límites (verificar con `content_publishing_limit`, no hardcodear):

- ~100 posts API / 24 h (carousel = 1)
- Imagen JPEG
- Reel: mp4/mov, ~3 s–15 min
- Container vive 24 h
- Media debe ser **URL pública** que Meta pueda descargar, o resumable upload a `rupload.facebook.com`

Cuentas personales: no.

## 4. TikTok — SÍ, pero audit

Productos:

- `video.upload` → draft en inbox del creador (**recomendado v1**)
- `video.publish` Direct Post → público solo si el **cliente** pasó audit

Unaudited (oficial):

- Visibility forzada `SELF_ONLY` (privado)
- Máx ~5 users/24 h
- Cuenta debe estar private al postear
- 6 req/min por token
- Consent UX obligatorio (preview + checkbox branded/AIGC)

Endpoints:

```
POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/
POST https://open.tiktokapis.com/v2/post/publish/video/init/
POST https://open.tiktokapis.com/v2/post/publish/inbox/video/init/
GET  https://open.tiktokapis.com/v2/post/publish/status/fetch/
```

OAuth TikTok **no acepta localhost**. Dev = Cloudflare Tunnel / ngrok + redirect HTTPS registrado.

`PULL_FROM_URL` exige dominio verificado en la app TikTok.

## 5. Mapa honestidad producto

```
Composer
   ├─ Facebook Page     [API] schedule nativo o cola local
   ├─ Instagram Pro     [API] container → publish
   ├─ TikTok            [API] DRAFT default / DIRECT si audited=true
   └─ FB Groups[]       [ASSIST] open URL + clipboard
```

Cualquier “repost 40 grupos a la vez sin tocar” es bot. Fuera de alcance v1.

## 6. Media pipeline (obligatorio)

Todas las redes quieren 9:16 para Reels/TikTok.

Spec encode (ffmpeg local, skill del entorno):

- Video: H.264 yuv420p, AAC, 1080x1920, 30 fps, -movflags +faststart
- Duración: 15–45 s para test
- Foto IG: JPEG, ratio 4:5 a 1.91:1

Subida:

1. v1: carpeta local + servidor estático temporal (túnel) para que Meta/TikTok bajen el file.
2. v2: R2/S3 + URL firmada de corta vida **si** la red acepta; TikTok PULL suele querer dominio fijo verificado.

## 7. Apps que “ya hacen esto” (referencia, no copiar)

| Tipo | Ejemplos | Groups |
|---|---|---|
| Cloud API | Buffer, Later, Hootsuite, Meta Business Suite | No |
| Browser session | extensiones “group poster” | Sí, riesgo ban |
| Nativo | Business Suite, composer FB | Page / admin group |

Esta app se parece a **Later local + assist groups**, no a un spammer.
