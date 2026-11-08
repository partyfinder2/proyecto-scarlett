# Checklist TikTok — BabelDesk (P3)

**Portal:** [developers.tiktok.com](https://developers.tiktok.com) · Content Posting API

## 1. App TT4D

1. Crea app → habilita **Login Kit** (Desktop) y **Content Posting API**.
2. Redirect URI (exacto):
   - `http://127.0.0.1:8766/oauth/tiktok/callback`
3. Copia **Client Key** y **Client Secret** → `.env`:
   - `TIKTOK_CLIENT_KEY`
   - `TIKTOK_CLIENT_SECRET`
   - `TIKTOK_OAUTH_PORT=8766`
   - `TIKTOK_OAUTH_REDIRECT_URI=http://127.0.0.1:8766/oauth/tiktok/callback`

## 2. Scopes

Por defecto BabelDesk pide: `user.info.basic,video.upload,video.publish`

Sin **audit** de Direct Post: la API suele limitar a **inbox / SELF_ONLY** (no público masivo).

Si TikTok ya aprobó Direct Post para tu app:

```env
TIKTOK_APP_AUDITED=1
TIKTOK_USE_API=1
```

Reinicia la app tras cambiar `.env`.

## 3. Probar

1. **Mis Redes → Conectar TikTok**
2. Cuenta aparece en destinos del compositor
3. Con `TIKTOK_USE_API=1`: encola post con mp4 local
4. Sin audit: revisa **Publicados** — puede quedar `published_private` / inbox

## 4. Assist manual (siempre disponible)

Sin OAuth ni API: cuenta TikTok tipo **assist** + cola → abre tiktok.com/upload y copia caption.
