# ROADMAP — Team Scarlett (post-lanzamiento ebook)

> **Estado:** agendado — no bloquea cierre del PDF.  
> **Ebook:** 199 MXN · validación de demanda primero.

## Visión

Lectoras aplican el método → confían en Scarlett → entran a **Team Scarlett** (Telegram privado) → (fase 2) bot/check-in opcional → ingresos recurrentes sin depender de afiliados de apps de seguridad.

## Fases

### Fase 0 — Ahora (cerrar libro)

- [x] Cap. 5: Protocolo Ángel de Guardia (🟡🟢🔴, ubicación 1:1).
- [x] Cap. 9: invitación Team Scarlett + código de compra.
- [ ] PDF final + Gumroad + enlace Telegram con código único por compra.

### Fase 1 — Lanzamiento (semanas 1–4)

- Telegram privado moderado (reglas fijas, cero clientes).
- Contenido: plantillas, FAQ, voz Scarlett, alertas de plazas (opcional).
- Afiliados **reales:** Amazon / ML (cola de zorro, lubricante, condones) — no Life360/WhatsApp.

### Fase 2 — Bot Telegram (si hay demanda)

- Acceso solo con token post-compra Gumroad.
- Comandos tentativos: `/entro`, `/check`, `/sali`, `/sos`.
- **Datos mínimos;** retención corta (24–48 h); aviso de privacidad (LFPDPPP).
- Cron: si no hay `/sali` → aviso al círculo de emergencia acordado.

### Fase 3 — PWA / app (solo si Fase 2 valida)

- Check-in con botón, SOS, borrado automático.
- Asesoría legal + contador antes de centralizar geolocalización.

## Principios (Argon + Cursor)

| Tema | Decisión |
|------|----------|
| Ubicación | Descentralizada 1:1 al inicio; no mapa público del team. |
| Grupos masivos | Evitar; círculos 2–4 + comunidad moderada aparte. |
| Afiliados seguridad | No basar el modelo; WhatsApp/Telegram no pagan comisión. |
| Monetización extra | Comunidad (opcional mensual), afiliados Amazon/ML, futuro bot. |
| Legal | Custodia de datos sensibles = aviso de privacidad + mínimo necesario. |

## Investigación pendiente

- [ ] Programas afiliados Amazon MX / Mercado Libre (links en ebook).
- [ ] Gumroad → código único → invite link Telegram (1 bot o Zapier manual al inicio).
- [ ] Abogado: aviso privacidad si hay bot con check-ins.
- [ ] Costo hosting bot (Vercel + Supabase vs solo Telegram + Google Sheet).

## Notas técnicas bot (borrador)

```
Usuario → /entro Hotel X · 412 · 16:00 · check 16:40
Bot → confirma + timer
16:40 → ¿/sali?
Sin respuesta → notify chat_emergencia (IDs pre-registrados)
```

No implementar hasta ebook en venta y >N compradoras pidiendo herramienta.

---

*Última actualización: 2026-11-04*
