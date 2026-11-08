# Descargas bloqueadas (+18, login, Instagram)

Cuando ves *age-gate*, *sign in* o *DRM*, yt-dlp va sin tu sesión de YouTube/IG.

---

## Opción B — recomendada (sin extensión)

1. En Chrome, entra a YouTube con la cuenta donde **ya confirmaste edad** y reproduce el video una vez.
2. En `BabelDesk/.env` añade:

```env
YTDLP_COOKIES_FROM_BROWSER=chrome
```

Si usas **Edge**:

```env
YTDLP_COOKIES_FROM_BROWSER=edge
```

3. **Cierra Chrome por completo** (todas las ventanas; revisa el icono en la bandeja).
4. **No vuelvas a abrir YouTube** hasta que BabelDesk termine la descarga.
5. Reinicia BabelDesk si hace falta (`npm run dev`) y pulsa **Descargar**.

Perfil distinto (opcional): `YTDLP_COOKIES_FROM_BROWSER=chrome:Profile 1`

### Error: `Could not copy Chrome cookie database`

Significa que **Chrome sigue corriendo** (a veces en segundo plano aunque no veas ventanas).

1. `Ctrl+Shift+Esc` → **Administrador de tareas** → busca **Google Chrome** → **Finalizar tarea** (todos los `chrome.exe`).
2. En Chrome (cuando lo abras otra vez): **Configuración → Sistema** → desactiva *«Continuar ejecutando apps en segundo plano al cerrar Chrome»*.
3. Actualiza yt-dlp: `winget upgrade yt-dlp`
4. **Descargar en BabelDesk sin abrir Chrome.**

Orden correcto: ves el video en Chrome → cierras Chrome del todo → BabelDesk Descargar.  
**Incorrecto:** cerrar Chrome → abrir YouTube otra vez → Descargar (Chrome ya está abierto otra vez).

---

## Opción B — archivo `cookies.txt` (más estable en Windows)

En `.env` **comenta** la línea del navegador:

```env
#YTDLP_COOKIES_FROM_BROWSER=chrome
```

### Método 1 — script (sin extensión)

1. Cierra Chrome (`Administrador de tareas` → todos `chrome.exe`).
2. En PowerShell:

```powershell
cd C:\Users\pablo\Downloads\BabelDesk
npm run cookies:export
```

3. Debe aparecer `data/cookies.txt`. Luego `npm run dev` → **Descargar**.

### Método 2 — extensión Chrome (mejor para YouTube +18)

1. Instala **Get cookies.txt LOCALLY**.
2. Abre **https://www.youtube.com** (cuenta logueada; el video +18 debe reproducirse ahí).
3. En **esa pestaña**, extensión → **Export** (no exportes solo desde instagram.com).
4. Guarda **reemplazando**:

`C:\Users\pablo\Downloads\BabelDesk\data\cookies.txt`

5. Comprueba que el archivo menciona cookies de sesión (`LOGIN_INFO` o `__Secure-3PSID` en líneas `.youtube.com`).  
   Si solo ves `VISITOR_INFO1_LIVE` / `YSC`, no hay login → repite el export en youtube.com.

6. Reinicia BabelDesk y **Descargar** (Chrome puede estar abierto).

Renueva cada ~2–4 semanas si vuelve a fallar. **No** subas `cookies.txt` a git.

---

## Opción C — manual (sin yt-dlp para ese video)

1. Baja el **.mp4** como prefieras (Premium, otra app, etc.) — lo importante es el archivo en disco.
2. Copia o mueve el archivo a:

`C:\Users\pablo\Downloads\BabelDesk\Inbox\`

Formatos: **mp4**, mov, webm, mkv (y fotos jpg/png).

3. En **1 · Mis Videos** debería aparecer solo (watcher ~2 s).  
   Si no: cierra y abre la pestaña o reinicia la app.
4. Sigue en **2 · Cortar** → **3 · Crear Post**.

Marca de agua **Máximo** en manual: en la lista del inbox usa el botón **💧** o vuelve a procesar desde Cortar si ya está integrado ahí.

---

## Probar que B funciona

Link público sin +18 (cualquier travel vlog). Si baja bien, el fallo del otro link era solo restricción de edad.
