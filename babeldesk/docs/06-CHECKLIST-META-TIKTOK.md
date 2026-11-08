# Checklist Pablo — apps oficiales

## Meta

- [ ] developers.facebook.com → crear app tipo Business
- [ ] Facebook Login for Business
- [ ] Permisos: pages_show_list, pages_manage_posts, pages_read_engagement
- [ ] Instagram: instagram_basic + instagram_content_publish (o instagram_business_*)
- [ ] Page real + IG Professional vinculado
- [ ] Completar Page Publishing Authorization si Meta lo pide
- [ ] Redirect URI HTTPS
- [ ] App Review cuando salgas de dev/test users
- [ ] Token de Page de larga duración (exchange)

## TikTok

- [ ] developers.tiktok.com app
- [ ] Productos: Content Posting API
- [ ] Scopes v1: `user.info.basic`, `video.upload` (draft)
- [ ] Scope después: `video.publish` + audit
- [ ] Redirect URI HTTPS **no localhost**
- [ ] Verificar dominio para PULL_FROM_URL
- [ ] Legal pages (ToS / Privacy) en HTTPS — las pide el audit
- [ ] UX de consentimiento (preview + branded + AIGC checkbox)
- [ ] Hasta audit: UI debe decir “se publica PRIVATE”

## Local

- [ ] Node 20+
- [ ] ffmpeg en PATH
- [ ] `.env` desde `.env.example`
- [ ] `STUDIO_MASTER_KEY` de 32 bytes
- [ ] Cloudflare Tunnel o similar para OAuth
