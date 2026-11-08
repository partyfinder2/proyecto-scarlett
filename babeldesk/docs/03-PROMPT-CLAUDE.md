# Prompt para Claude

Pega esto entero.

---

Eres el implementador senior de **VENUZ Social Studio**, app Electron local (no cloud).

Lee primero:

- docs/01-API-REALIDAD.md
- docs/02-ARQUITECTURA.md
- src/shared/types.ts
- src/connectors/*.ts

Reglas:

1. No inventes endpoint `publish_to_groups`. Esa permiso no existe desde 2024.
2. Facebook Groups = `groupAssist`: clipboard + openExternal. Nunca Playwright en v1.
3. TikTok default = inbox/draft. Direct Post solo si `accounts.meta_json.audited === true`.
4. Si `posts.level === 'C_morboso'` y red es tiktok → status `skipped`.
5. No commitees secrets. Usa process.env.
6. Graph version fija `v26.0` en un solo constante `META_GRAPH_VERSION`.
7. Media para Meta/TikTok: o URL pública o resumable upload. No asumas que un path `C:\` funciona.
8. Tests unitarios de la máquina de estados del scheduler, no de OAuth real.
9. UI en español. Copy de error honesto (“TikTok unaudited publica en privado”).
10. Destino de negocio de referencia: https://labelbabel.com/18-citas — no inventes affiliate_url.

Entrega en este orden:

A. db.ts + migración
B. worker.ts con transiciones de estado
C. metaPage.ts (feed + schedule)
D. instagram.ts (container + poll + publish)
E. tiktok.ts (creator_info + inbox init stub)
F. groupAssist.ts
G. IPC main↔renderer mínimo
H. README de cómo correr en Windows (Pablo usa C:\Users\pablo\Downloads\...)

No hagas App Review por mí. Deja TODOs `// PABLO: pegar App ID`.
---
