# Actualización local + GitHub + respaldo USB mensual

## Cuándo usarlo

Una vez al mes (o antes de un viaje / formateo): **actualizar PC ↔ GitHub** y **copiar a USB** sin borrar respaldos viejos.

## Comando (con USB conectada)

```powershell
cd C:\Users\pablo\Downloads\VENUZ-Complete-App\metodo-scarlett
powershell -ExecutionPolicy Bypass -File .\scripts\actualizar_y_respaldo.ps1
```

USB en otra letra:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\actualizar_y_respaldo.ps1 -UsbRaiz "E:\"
```

Solo revisar Git (sin USB):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\actualizar_y_respaldo.ps1 -SoloGit
```

## Qué hace

1. Copia archivos clave de **metodo-scarlett/babeldesk** → **Downloads\BabelDesk**.
2. `git fetch` en **proyecto-scarlett** y **partyfinder-2.0** (venuz-repo).
3. Crea en la USB: `PROYECTO VENUZ\Respaldo-YYYY-MM-DD\` (nueva carpeta; las de meses pasados **quedan**).
4. Dentro: carpetas del proyecto, bundles `.bundle` con todo el historial git, `LEEME.txt` y `MANIFIESTO.json`.

## Alineación GitHub / Vercel / Supabase

| Pieza | Dónde |
|--------|--------|
| Scarlett (Ranking, Fábrica, BabelDesk en repo) | GitHub `partyfinder2/proyecto-scarlett` |
| VENUZ web | GitHub `partyfinder2/partyfinder-2.0` → Vercel → **labelbabel.com** |
| SQL / Auth datos | `venuz-repo/supabase/` — aplicar en dashboard Supabase tras revisión |
| Deploy Vercel | Commits normales con `[skip vercel]`; deploy solo con `commit push deploy` |

Para **publicar cambios** en GitHub (después del respaldo o antes):

- Pide en Cursor: *«commit y push proyecto-scarlett»* o *«commit y push partyfinder sin deploy»*.

## Logs

`%LOCALAPPDATA%\ProyectoVenuz\actualizacion-YYYY-MM-DD.log`