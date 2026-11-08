# Checklist Meta — BabelDesk (Development → publicar)

**App:** BabelDesk local · Graph **v26.0** · OAuth loopback `127.0.0.1`

## 1. App en developers.facebook.com

1. Tipo **Business** (recomendado).
2. Añade producto **Facebook Login for Business** (o Facebook Login).
3. **Settings → Basic:** copia **App ID** y **App Secret** → `.env`:
   - `META_APP_ID`
   - `META_APP_SECRET`
4. **Facebook Login → Settings → Valid OAuth Redirect URIs** (exacto):
   - `http://127.0.0.1:8765/oauth/meta/callback`
   - Debe coincidir con `META_OAUTH_REDIRECT_URI` en `.env`.
5. Modo **Development:** solo usuarios con rol **Admin/Developer/Tester** en la app pueden autorizar.
6. **App Review / Advanced Access** (cuando quieras usuarios fuera del equipo):
   - `pages_manage_posts`, `pages_show_list`, `instagram_content_publish`, etc.

## 2. `.env` mínimo

```env
STUDIO_MASTER_KEY=frase-larga-secreta
META_APP_ID=
META_APP_SECRET=
META_OAUTH_PORT=8765
META_OAUTH_REDIRECT_URI=http://127.0.0.1:8765/oauth/meta/callback
```

## 3. Probar en BabelDesk

1. `npm run dev`
2. **Mis Redes → Conectar Meta** → login en navegador → elige **Page** (+ IG opcional).
3. **Probar** en la tarjeta (GET Page/IG, sin publicar).
4. **Crear Post** con mp4 9:16 → Page = **Reel**; foto = `/photos`; solo texto = `/feed`.

## 4. Errores frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| Redirect URI mismatch | URI en Meta = `.env` carácter por carácter |
| (#190) token | Reconectar Meta o token Explorer caducado |
| (#200) / (#10) permiso | Scopes + rol en Page + modo Live/Review |
| Reel atascado en processing | Esperar 1–2 min; formato 9:16; reintentar finish |
| Puerto ocupado | Cambia `META_OAUTH_PORT` y actualiza redirect en Meta |

## 5. Page token

El **Page access token** no trae expiry propio en Graph, pero se invalida si cambias contraseña, revocas la app o pierdes rol en la Page. Usa **Reconectar Meta** cuando **Probar** marque Inválida.
