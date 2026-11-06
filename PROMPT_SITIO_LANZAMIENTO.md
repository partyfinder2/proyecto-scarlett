# Brief maestro — Sitio web Método Scarlett (México)

Copia el bloque **PROMPT PARA CURSOR** al iniciar un chat nuevo de construcción. Actualiza las secciones `[PENDIENTE]` antes de pegar.

---

## PROMPT PARA CURSOR

```
Contexto
--------
Estoy construyendo la web de venta del ebook "Método Scarlett" (199 MXN, México primero).
Es un manual digital de ingresos independientes, WhatsApp, packs, seguridad y autocuidado.
El tono es Scarlett: directo, empoderador, sin vulgaridad gratuita en la landing pública.

El manuscrito vive en: metodo-scarlett/capitulos/*.md
Paleta (STYLE_GUIDE.md): fondo #120E16, títulos #E87099, dorado #D8B26E, texto #EAE4EC
Asset referencia: metodo-scarlett/assets/diagrama-flujo.jpg

IMPORTANTE — Cumplimiento y ads
--------------------------------
- La landing pública NO debe mostrar contenido sexual explícito, desnudos ni lenguaje pornográfico.
- Posicionamiento: producto digital / educación práctica / seguridad / ingresos — NO "servicios sexuales".
- Gate +18 al entrar (cookie de sesión, botones "Soy mayor" / "Salir").
- Páginas legales MX: Aviso de privacidad (LFPDPPP), Términos de uso, Contacto, Reembolsos.
- Dominio y marca SEPARADOS de VENUZ / nightlife (otro proyecto).
- El PDF descargable se entrega SOLO post-pago (enlace firmado o email), nunca indexado en Google.

Stack deseado
-------------
- Next.js (App Router) + TypeScript, deploy Vercel.
- Carpeta sugerida: metodo-scarlett/web/ (monorepo) O repo nuevo metodo-scarlett-web.
- Estilos: Tailwind o CSS modules con la paleta Scarlett; mobile-first.
- SEO: metadata conservadora; og:image profesional (sin +18 en imagen social).

Páginas mínimas v1
------------------
1. / — Landing: hero, beneficios, qué incluye, precio 199 MXN, CTA comprar, FAQ, disclaimer.
2. /comprar — Checkout o redirect a pasarela (ver abajo).
3. /gracias — Post-compra: instrucciones descarga + código Team Scarlett [PENDIENTE flujo].
4. /legal/privacidad, /legal/terminos, /legal/reembolsos
5. /18 — Age gate reutilizable o middleware

Pagos México (implementar la opción que yo confirme)
----------------------------------------------------
Opción A (rápida): Botón Mercado Pago — Checkout Pro / link de pago 199 MXN (OXXO + tarjeta).
Opción B (escalable): API Mercado Pago + webhook → registrar orden → email con link PDF.
Opción C (afiliados): Hotmart como canal secundario (link externo "Revendedores").
Opción D (internacional): Gumroad solo como backup, no CTA principal en MX.

Comisiones orientativas (verificar al contratar): MP ~3–5% + IVA; Hotmart ~9%+; Gumroad ~10%+.

Entrega digital
---------------
- PDF: almacenar en Vercel Blob o R2 con URL firmada TTL 72h.
- Email transaccional: Resend / Brevo con plantilla Scarlett.
- Código único Team Scarlett: generar UUID por orden; validar en Telegram manual v1.

Publicidad (preparar sitio para medición)
-----------------------------------------
- Meta Pixel + Conversions API (evento Purchase vía webhook MP).
- Google tag / GA4 (evento purchase); evitar palabras prohibidas en URL y títulos de campaña.
- UTM en todos los CTAs: ?utm_source=meta&utm_campaign=lanzamiento
- Página de gracias como destino de conversión (no el PDF directo).

Contenido landing — bullets aprobados (expandir en prosa Scarlett)
--------------------------------------------------------------------
- Pack $200–300 → filtro → base $500+ extras
- Transporte con espera (Uber/InDriver/taxi) + check-in opcional 🟡🟢 — tono empoderador, no alarmista
- Avatar, límites, higiene, imagen, plan 7 días
- Comunidad Team Scarlett post-compra (Telegram privado)

NO prometer en la web: ingresos garantizados, cifras fijas como promesa legal.

Tareas para el agente (orden)
------------------------------
1. Scaffold Next.js en metodo-scarlett/web con paleta y age gate.
2. Landing + legales (texto base LFPDPPP genérico — marcar [REVISAR ABOGADO]).
3. Integrar checkout según variable de entorno MERCADOPAGO_LINK o MP_ACCESS_TOKEN.
4. Webhook /api/webhooks/mercadopago → marcar pagado → enviar email [stub si faltan keys].
5. README con env vars y checklist pre-ads (Meta Business, dominio, SSL).
6. NO mezclar con venuz-repo salvo copiar patrones de age gate si existen.

Variables de entorno esperadas
------------------------------
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
NEXT_PUBLIC_SITE_URL=
RESEND_API_KEY=
DOWNLOAD_PDF_URL= (blob privado)
TELEGRAM_SUPPORT=@...

Estado ebook
------------
El manuscrito sigue en edición (más imágenes, diagramas, cuadros). La web v1 puede lanzarse
con "versión 1.0" y entrega automática cuando el PDF final esté en Blob.

[PENDIENTE — Pablo completa]
- Dominio final: _______________
- ¿Mercado Pago cuenta lista? sí/no
- ¿Hotmart sí/no?
- Email de soporte:
- Handle Telegram Team Scarlett:
- Creativos ads (sin explícito): sí/no
```

---

## Decisión recomendada (Cursor / Pablo)

| Prioridad | Qué | Por qué |
|-----------|-----|--------|
| 1 | Landing +18 + legales MX | Protege ads y LFPDPPP |
| 2 | Mercado Pago Checkout Pro (link o API) | MXN, OXXO, comisión razonable |
| 3 | Webhook + email + PDF firmado | Ventas diarias sin trabajo manual |
| 4 | Hotmart (opcional) | Red de afiliados que revenden |
| 5 | Meta Pixel + UTMs | Tu inversión en ads medible |
| 6 | Team Scarlett token | Ya está en roadmap post-compra |

## Qué NO hacer al inicio

- Stripe/PayPal como única pasarela si el copy del producto menciona sex work explícito en checkout descriptor.
- Anunciar en la misma URL que contenido +18 explícito.
- Hostear el PDF en `/public` abierto.
- Mezclar marca Scarlett con VENUZ en dominio o Analytics.

## Siguiente mensaje a Cursor (cuando Pablo diga "construye")

> Lee `metodo-scarlett/PROMPT_SITIO_LANZAMIENTO.md` y `STYLE_GUIDE.md`. Scaffold `metodo-scarlett/web` con Next.js, age gate y landing v1. Checkout: [Mercado Pago link / API — lo que Pablo haya confirmado].

---

*Actualizado: 2026-11-04*
