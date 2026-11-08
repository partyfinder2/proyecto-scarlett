# HANDOFF — VENUZ Social Studio

Fecha: 2026-09-29  
Owner idea: Pablo  
Orquesta: Grok  
Código: Cursor / Claude / Antigravity  

## Objetivo

App **local** que:

1. Guarda piezas (video, foto, caption por red, hashtags, link destino).
2. Programa fecha/hora.
3. Publica donde la API lo permite.
4. Para Facebook Groups: genera el post y **abre el grupo** para que Pablo pulse Publicar.

## Top 3 hoy

| Quién | Qué |
|---|---|
| Pablo manual | Crear App Meta + App TikTok. Decidir nombre Page IG Business. Pegar App ID (no secret en chat si no hace falta). |
| Grok | Investigación + carpeta (este repo). |
| Esperar Cursor | Implementar conectores Page/IG y UI calendario. |

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `publish_to_groups` no existe | Quien prometa “auto-post a 50 grupos” miente o usa bot | Modo ASSIST + delays humanos |
| TikTok unaudited = posts PRIVATE | Crees que publicaste y nadie lo ve | UI debe mostrar `visibility=SELF_ONLY` en rojo |
| IG personal no publica por API | Fallo al conectar | Forzar cuenta Professional |
| Media debe ser URL pública para Meta/TikTok | Local file no basta | Subir a storage propio o resumable upload |
| Ban si scrapers/sesión | Cuenta +18 | Prohibido en v1 |

## Hecho / no hecho

- [x] Investigación APIs 2026
- [x] Arquitectura y schema SQLite
- [x] Prompts listos para Claude/Cursor/Antigravity
- [x] Stubs de conectores
- [ ] OAuth real
- [ ] UI calendario
- [ ] Encode ffmpeg 9:16
- [ ] App Review Meta / Audit TikTok

## Flujo producto (ya acordado)

Facebook Group EN → Instagram → TikTok  
TikTok bio = sitio + IG (2 botones). No el grupo.

Nivel A relax → IG+TT+FB  
Nivel B moderado → IG  
Nivel C morboso → no TT, no auto.

## 5 bullets Pablo

1. Crear Facebook **Page** (no perfil) y pasar IG a Professional.
2. Registrar app en developers.facebook.com (use case: content publishing).
3. Registrar app en developers.tiktok.com (Content Posting API + `video.upload` primero).
4. Tener dominio HTTPS para redirect OAuth (túnel en dev).
5. No pegar App Secret en GitHub.

## 5 bullets Cursor

1. Levantar Electron + renderer mínimo (cola + composer).
2. Implementar SQLite schema de `docs/02-ARQUITECTURA.md`.
3. Conector `metaPage.publish` + `instagram.publishReel`.
4. Conector `tiktok.uploadDraft` (inbox, no direct public).
5. Assist Groups: clipboard + `shell.openExternal(groupUrl)`.
