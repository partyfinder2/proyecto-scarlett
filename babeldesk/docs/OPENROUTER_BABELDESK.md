# OpenRouter — key solo para BabelDesk

**Cuenta:** la misma de siempre (Credits / Activity).  
**Objetivo:** una **API key distinta** a la de VENUZ/prod para ver en Activity cuánto gasta **solo esta app**.

---

## 1. Crear la key (2 minutos)

1. Entra a [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) (menú **Management Keys**).
2. **Create key** (o equivalente).
3. Nombre sugerido: **`babeldesk-local`**
4. Copia la key (`sk-or-v1-…`). **Solo se muestra una vez.**

No revoques la key **`venuz`** — sigue sirviendo para labelbabel.com / Vercel.

---

## 2. Pegar la key solo en BabelDesk

**Opción A (recomendada):** en la app → **Ajustes → OpenRouter → API key → Guardar → Probar conexión**.

Se guarda en `data/config.json` (local, no va a git).

**Opción B:** en `BabelDesk/.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-2.5-flash
```

Reinicia `npm run dev` tras cambiar `.env`.

**No** pegues esta key en Vercel ni en `venuz-repo/.env.local` de prod.

---

## 3. Cómo ver gastos de BabelDesk en OpenRouter

En [Activity](https://openrouter.ai/activity):

| Filtro | Qué verás |
|--------|-----------|
| **Top API Keys** | Fila **`babeldesk-local`** separada de **`venuz`** |
| **Top Apps** | Entradas `BabelDesk|copy`, `BabelDesk|watermark`, `BabelDesk|week-plan`, `BabelDesk|test` |

---

## 4. Qué consume OpenRouter en BabelDesk

| Acción | Cuándo |
|--------|--------|
| **Probar conexión** | Ajustes → Probar (casi nada) |
| **Copy 3 variantes** | Crear Post → copy genérico / PV tourist |
| **Plan semanal** | Composer → plan semana (si lo usas) |
| **Marca de agua Máximo** | Descarga con modo Máximo o botón 💧 (3 fotogramas + visión, ~1 llamada multimodal) |

No hay crons: **solo gastas cuando tú disparas** la acción en la app.

---

## 5. Modelo recomendado

`google/gemini-2.5-flash` (barato y bueno para visión + copy).

Evita `2.0-flash` (retirado en muchos sitios).

---

## 6. Relación con VENUZ / ahorro

- **VENUZ en prod** sigue con su key en Vercel → Activity key **`venuz`**.
- **BabelDesk** en tu PC → key **`babeldesk-local`**.
- Modo **Hobby + local** + menos scrapers/LLM en prod = menos picos en Activity (como la bajada desde ~20 sep en tu gráfica).
- Saldo **$4.62** de $5 recargados el 11 sep + **~$0.21** de spend en el periodo = vas bien; la key nueva no aumenta gasto, solo **lo separa**.
