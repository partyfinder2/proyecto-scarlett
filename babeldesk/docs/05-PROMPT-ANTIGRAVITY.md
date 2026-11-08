# Prompt para Antigravity

Contexto: desktop social scheduler. Código base en esta carpeta.

Tu trabajo no es inventar producto. Es:

1. Revisar tipos y connectors vs docs/01.
2. Señalar cualquier llamada a Groups API y borrarla.
3. Añadir validación de media (ffprobe):
   - Reels/TikTok: 9:16 ±5%, h264, < 90s en v1
   - IG image: jpeg
4. Añadir cifrado de tokens (AES-256-GCM).
5. Checklist de App Review Meta / TikTok audit en UI Settings (checkboxes persistidos, no “aprobado” falso).

Si algo no está verificado en docs/01, márcalo `NO VERIFICADO` en comentario, no lo inventes.
