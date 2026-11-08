# Arquitectura

## Procesos

```
┌─────────────────────────────────────────────┐
│  Electron main                              │
│  - SQLite                                   │
│  - cron cada 30s                            │
│  - OAuth loopback                           │
│  - IPC a renderer                           │
└──────────────┬──────────────────────────────┘
               │
     ┌─────────┴──────────┐
     │ renderer (React)   │
     │ Library / Composer │
     │ Calendar / Logs    │
     └────────────────────┘
               │
     connectors/
       metaPage.ts
       instagram.ts
       tiktok.ts
       groupAssist.ts
```

Todo local. DB: `data/studio.sqlite`. Media: `data/media/`.

## Schema SQL

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,          -- facebook_page | instagram | tiktok | facebook_group
  display_name TEXT,
  external_id TEXT,
  access_token_enc TEXT,          -- cifrar con key en OS keychain si se puede
  refresh_token_enc TEXT,
  token_expires_at INTEGER,
  meta_json TEXT,                 -- page_id, ig_user_id, audited flag
  created_at INTEGER
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,             -- video | image
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  public_url TEXT,                -- tunnel / cdn cuando se publica
  created_at INTEGER
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  title TEXT,
  media_id TEXT,
  caption_default TEXT,
  link_url TEXT,                  -- https://labelbabel.com/18-citas
  level TEXT,                     -- A_relax | B_moderado | C_morboso
  created_at INTEGER
);

CREATE TABLE post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  caption_override TEXT,
  scheduled_at INTEGER,           -- unix seconds
  status TEXT NOT NULL,           -- draft | queued | publishing | published | awaiting_human | failed | skipped
  external_post_id TEXT,
  error TEXT,
  attempt INTEGER DEFAULT 0
);

CREATE TABLE group_catalog (
  id TEXT PRIMARY KEY,
  name TEXT,
  url TEXT NOT NULL,
  notes TEXT,
  last_posted_at INTEGER
);

CREATE TABLE job_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER,
  target_id TEXT,
  level TEXT,
  message TEXT
);
```

## Estados

```
draft → queued → publishing → published
                         └→ failed (retry ≤3)
                         └→ awaiting_human   (solo groups)
                         └→ skipped          (nivel C + tiktok)
```

Regla dura en scheduler:

```
if target.network === 'tiktok' && post.level === 'C_morboso' → skipped
if target.network === 'facebook_group' → nunca API, solo assist
```

## Módulos a implementar (orden)

1. `src/shared/types.ts`
2. `src/main/db.ts`
3. `src/scheduler/worker.ts`
4. `src/connectors/*.ts`
5. `src/assist/groups.ts`
6. UI composer + calendar

## Seguridad

- `.env` gitignored
- Tokens AES-256-GCM con `STUDIO_MASTER_KEY` en env local
- No loguear tokens
- Rate limit local: IG 80/24h, FB Reels 25/24h, TikTok 4/hora hasta conocer quota real
- Delay groups assist: random 7–20 min

## Puerto / OAuth

- App UI: `http://127.0.0.1:5173` (dev) / Electron custom protocol `studio://`
- Meta redirect: `https://<tunnel>/oauth/meta/callback`
- TikTok redirect: `https://<tunnel>/oauth/tiktok/callback` (nunca localhost)
