# Contacto anónimo Scarlett + revisión de anuncios (interno Pablo)

## Lo que quieres (traducido a producto)

| Necesidad | Solución segura |
|-----------|-----------------|
| **Anonimato total** (nadie sabe quién eres en la vida real) | Persona Scarlett separada: número/eSIM, @usuario Telegram, Proton Mail, VPN; **nunca** WhatsApp personal ni tu nombre |
| **Consulta privada** (tarot, orientación, consejo) | **Solo bajo cita / pago** → enlace del libro abre **bot o formulario**, no tu chat personal abierto |
| **“¿Cómo quedó mi publicación?”** | Flujo **Revisión de anuncio**: captura de la **plataforma** (Mileroticos/Skokka), no fotos íntimas por DM |
| **Que no parezca raro** | Reglas públicas: *“Solo reviso marketing: screenshot del anuncio publicado o borrador con rostro opcional pixelado”* |

---

## Arquitectura recomendada (mejor equilibrio 2026)

### Capa 1 — Lo que va en el **ebook** (lectoras)

Un solo enlace tipo: `t.me/MetodoScarlettBot` (nombre ejemplo).

Texto sugerido para el Cap. 9 (Team Scarlett):

> **Contacto con Scarlett (opcional)**  
> No es WhatsApp personal ni chat 24/7. Es un **enlace oficial del método** con dos botones:  
> **1) Revisión de anuncio** — envías **captura de pantalla** de tu anuncio ya publicado (o borrador en la plataforma), con la cola/vestido como en el Cap. 2. **No** pidas opinión mandando fotos íntimas por privado; solo **material de anuncio** (como si le enseñaras a una hermana mayor tu perfil).  
> **2) Consulta privada** — tarot terapéutico u orientación; **cita con horario y pago** (se anuncia en el canal).  
> Scarlett responde en **horarios publicados**; el método completo ya está en el libro.

### Capa 2 — Lo que **tú** montas (sin dejar rastros)

1. **Chip o eSIM solo Scarlett** → cuenta Telegram con **@MetodoScarlett** (o similar).  
   - Ajustes → Privacidad → **Número: Nadie**.  
   - **Foto:** avatar Scarlett (retrato IA / sofá), no tu cara.  
   - **2FA** activado.

2. **Bot de Telegram** (gratis, BotFather) — las lectoras hablan con **@Bot**, no ven tu cuenta admin.  
   - Botón **“Revisión de anuncio”** → mensaje automático con reglas + “envía **una captura** del anuncio”.  
   - Botón **“Consulta privada”** → “Lista de espera / link de pago / horario martes y jueves”.  
   - El bot **reenvía** a tu chat privado de admin (tu usuario Scarlett oculto) **solo** esos mensajes; tú respondes desde Scarlett sin dar teléfono.

3. **Canal Team Scarlett** (opcional): tips, avisos de consultas; **sin** chat libre al inicio (menos caos y menos riesgo).

4. **Proton VPN** al abrir Telegram admin y correo de ventas.

5. **Pagos consulta:** cuenta/fintech **del negocio** (Spin, Mercado Pago negocio), no mezclar con tu banco personal en el mismo nombre si quieres separación fuerte.

---

## Reglas de oro — revisión de fotos (anti-“pervertida”)

Pon esto **visible** en el bot y en el ebook:

- ✅ **Sí:** screenshot del **anuncio en la plataforma**, o collage **vestido + cola asomando** como en Cap. 2 (marketing).  
- ✅ **Sí:** pixelar ojos si quieren.  
- ❌ **No:** fotos de habitación, desnudos, packs para clientes, “prueba en la cama”.  
- ❌ **No:** menores, terceros sin permiso.  
- Respuesta tipo: *“Buena luz en la cola; sube tarifa en el titular; el pack va aparte”* — tono **coach**, no coqueteo.

Si alguien manda algo fuera de regla: mensaje automático *“Solo reviso anuncios; reenvía captura de tu publicación en Mileroticos/Skokka”* y no respondas más.

---

## ¿Qué pueden “saber” de ti?

| Ellas pueden | No deberían poder |
|--------------|-------------------|
| @usuario del bot / Scarlett | Tu nombre real, dirección, WhatsApp personal |
| Que eres “Scarlett, autora” | Tu IP (si usas VPN al admin) |
| Lo que tú cuentes en consulta | Tu cara (si no haces video) |

**Individual sí, identidad real no** — si mantienes un solo personaje y un solo canal oficial.

---

## Qué NO hacer (filtra identidad)

- Enlace a tu WhatsApp personal “para dudas”.  
- Videollamada como Scarlett el primer mes.  
- Mismo Telegram donde chateas con familia.  
- Pedir fotos sin el marco “captura de anuncio”.  
- Responder a las 3 a.m. desde cuenta personal.

---

## Próximos pasos técnicos (Cursor puede ayudar después)

1. Crear bot en BotFather + textos de botones.  
2. Pegar en Cap. 9 el párrafo “Contacto oficial” + URL real.  
3. (Opcional) Mini landing post-compra: PDF + link bot + código.  
4. Documento **Reglas del bot** en el primer mensaje.

---

## Nota tienda amiga

Enlace a plugs/lubricante → **canal**, no en DMs de revisión de fotos (separa “coach” de “compras”).
