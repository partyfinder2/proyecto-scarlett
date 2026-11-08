# BabelDesk — empieza aquí (para todo el equipo)

App **local** en Windows. No depende de Vercel ni de labelbabel.com.

**Carpeta del proyecto:** `C:\Users\pablo\Downloads\BabelDesk`

---

## 1. Uso diario (lo único obligatorio)

```powershell
cd C:\Users\pablo\Downloads\BabelDesk
copy .env.example .env
npm install
npm run dev
```

Se abre la ventana **BabelDesk**. Ahí: descargar links, Inbox, cortar, quitar marca de agua, crear posts, cola.

**Video +18 o bloqueado:** ver `docs/YTDLP_COOKIES.md`. **Atajo:** copia el `.mp4` a la carpeta `Inbox/` (sin URL).

**No hace falta** GitHub, push ni apps Meta/TikTok para esto.

---

## 2. Git / push (opcional — backup en la nube)

Los commits están **solo en tu PC** hasta que configures un remoto.

| Situación | Qué hacer |
|-----------|-----------|
| Solo trabajar en esta máquina | **Nada.** Ignora push. |
| Quieres copia en GitHub | Crea repo vacío → una vez: `git remote add origin https://github.com/TU_USUARIO/babeldesk.git` → `git push -u origin main` |

Sin `git remote`, `git push` **fallará** — es normal, no es un error de la app.

---

## 3. Redes sociales (opcional — publicar automático)

| Quieres… | Documento |
|----------|-----------|
| Conectar Facebook Page + Instagram (OAuth) | `docs/META_OAUTH_CHECKLIST.md` |
| Conectar TikTok (OAuth + API) | `docs/TIKTOK_OAUTH_CHECKLIST.md` |
| Solo bajar/cortar/publicar a mano | No configures Meta/TikTok |

**Grupos de Facebook:** solo modo **assist** (abre el grupo y copia texto). No existe API de publicación.

Variables en `.env` — plantilla en `.env.example`. **Nunca** subas `.env` a GitHub.

---

## 4. Marca de agua en videos

Ver **`docs/WATERMARK_REMOVER.md`**.

Resumen: modo **Máximo** usa ffmpeg + (si hay API key en Ajustes) visión IA para detectar marcas grandes. No es perfecto al 100% en marcas incrustadas en todo el fotograma.

---

## 4b. OpenRouter (copy IA + marca de agua Máximo)

Crea una **key aparte** de la de VENUZ para ver gastos solo de BabelDesk: **`docs/OPENROUTER_BABELDESK.md`**.

En la app: **Ajustes → Probar conexión** (gasta centavos de prueba).

---

## 5. Instalador .exe

Ver `README.md` → `npm run build:win` → carpeta `release/`.

---

## 6. Más docs

| Archivo | Contenido |
|---------|-----------|
| `README.md` | Instalar, tests, exe |
| `docs/babeldesk-social-connect-spec.json` | Spec técnica redes P0–P3 |
| `docs/GROK_RESULT_CONEXION_REDES_2026-09-30.md` | Roadmap redes |
| `docs/OPENROUTER_BABELDESK.md` | Key dedicada y Activity |

**Regla:** si algo no está en esta carpeta `docs/`, no es documentación oficial de BabelDesk.
