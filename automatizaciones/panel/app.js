const SECCIONES = [
  ["inicio", "🏠 Inicio"],
  ["canales", "📡 Mis 10 Canales"],
  ["crear", "🎬 Crear Video"],
  ["cola", "📋 Cola"],
  ["guiones", "✍️ Guiones"],
  ["guardian", "🤖 Bot Guardián"],
  ["config", "⚙️ Configuración"],
];

const PASOS = [
  "Leyendo el guion",
  "Grabando la voz",
  "Armando el video",
  "Bot Guardián",
  "Programando",
  "Listo",
];

let seccion = "inicio";
let tareaId = null;
let flujo = null;
let pasoCrear = 1;
let borrador = {
  canal_id: 1,
  slot: "almuerzo",
  frame1_text: "",
  spoken_hook: "",
  body_aida: "",
  cta_keyword: "",
  closing_phrase: "",
  regalo: "",
  fondo: "tiktok",
  tiktok_url: "",
  local_path: "",
  anti_copyright: true,
};

const $ = (id) => document.getElementById(id);

function aviso(texto) {
  const caja = $("aviso");
  caja.textContent = texto;
  caja.classList.remove("hidden");
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => caja.classList.add("hidden"), 4200);
}

async function api(url, opts) {
  const resp = await fetch(url, opts);
  const texto = await resp.text();
  let datos = {};
  try { datos = texto ? JSON.parse(texto) : {}; } catch { datos = { detail: texto }; }
  if (!resp.ok) {
    const msg = datos.detail || "No se pudo completar.";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return datos;
}

function fechaHumana() {
  const t = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  $("fecha-hoy").textContent = `Hoy es ${t}`;
}

function pintarNav() {
  $("nav").innerHTML = SECCIONES.map(([id, nombre]) =>
    `<button data-sec="${id}" class="px-3 py-2 rounded-full text-sm whitespace-nowrap border border-linea ${seccion === id ? "nav-activa border-green-700" : "bg-tarjeta text-zinc-300"}">${nombre}</button>`
  ).join("");
  $("nav").querySelectorAll("button").forEach((b) => {
    b.onclick = () => { seccion = b.dataset.sec; pintarNav(); mostrar(); };
  });
}

function pildoras(datos) {
  const voz = datos?.elevenlabs === "lista" ? "🟢 Voz premium lista" : "🔵 Voz gratis de respaldo";
  const cola = datos?.kpis?.en_proceso ?? 0;
  $("pildoras").innerHTML = [
    `<span class="px-3 py-1 rounded-full bg-emerald-950 text-emerald-300">🟢 Motor activo en esta PC</span>`,
    `<span class="px-3 py-1 rounded-full bg-tarjeta border border-linea">${voz}</span>`,
    `<span class="px-3 py-1 rounded-full bg-sky-950 text-sky-200">🔵 ${cola} en proceso</span>`,
  ].join("");
}

function tarjeta(titulo, valor, detalle) {
  return `<article class="rounded-2xl border border-linea bg-tarjeta p-4">
    <p class="text-sm text-zinc-400">${titulo}</p>
    <p class="text-3xl font-semibold mt-1">${valor}</p>
    <p class="text-xs text-zinc-500 mt-2">${detalle}</p>
  </article>`;
}

function trackerHtml(pipe) {
  const paso = pipe?.paso ?? pipe?.paso_actual ?? 0;
  const pct = pipe?.pct ?? pipe?.porcentaje ?? 0;
  const status = pipe?.status || "procesando";
  const color = status === "fallido" ? "bg-red-500" : status === "listo" || status === "publicado" ? "bg-emerald-500" : "bg-sky-500";
  const bolitas = PASOS.map((nombre, i) => {
    const n = i + 1;
    const listo = paso > n || ((status === "listo" || status === "publicado") && paso >= n);
    const activo = paso === n && status === "procesando";
    const fallo = status === "fallido" && (paso === n || paso === 0 && n === 1);
    const clase = fallo ? "bg-red-500" : listo ? "bg-emerald-500" : activo ? "bg-sky-500 animate-pulse" : "bg-zinc-800 text-zinc-500";
    return `<div class="flex-1 text-center">
      <div class="mx-auto w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${clase}">${listo ? "✓" : fallo ? "!" : n}</div>
      <p class="text-[11px] mt-1 text-zinc-400">${nombre}</p>
    </div>`;
  }).join("");
  return `<section class="rounded-2xl border border-linea bg-tarjeta p-5 space-y-4">
    <h2 class="font-semibold">🔴 En proceso ahora</h2>
    <div class="h-3 rounded-full bg-zinc-800 overflow-hidden"><div class="h-3 ${color} transition-all" style="width:${pct}%"></div></div>
    <p class="text-center text-lg">${pipe?.mensaje || "Nada en proceso. Puedes generar un video de prueba."}</p>
    <div class="flex gap-2">${bolitas}</div>
    ${pipe?.error ? `<p class="text-sm text-red-300 text-center">${pipe.error}</p>` : ""}
  </section>`;
}

function escucharTarea(id) {
  if (flujo) flujo.close();
  tareaId = id;
  flujo = new EventSource(`/api/status/${id}`);
  flujo.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const caja = $("tracker");
    if (caja) caja.innerHTML = trackerHtml({ paso: data.paso, pct: data.pct, mensaje: data.mensaje, status: data.status, error: data.error });
    if (data.status === "listo" || data.status === "fallido" || data.status === "publicado") {
      flujo.close();
      if (seccion === "inicio") mostrar();
    }
  };
}

async function vistaInicio() {
  const datos = await api("/api/inicio");
  pildoras(datos);
  const k = datos.kpis;
  const extra = k.publicados_semana > k.publicados_semana_anterior
    ? `↑ ${k.publicados_semana - k.publicados_semana_anterior} más que la semana pasada`
    : "Cuenta de esta semana";
  const pipe = datos.pipeline;
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold mb-1">👋 Hola, aquí está tu fábrica</h2>
    <p class="text-zinc-400 mb-5">${k.publicados_semana} publicados en 7 días · ${k.en_cola_hoy} en la cola de hoy</p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      ${tarjeta("Videos publicados esta semana", k.publicados_semana, extra)}
      ${tarjeta("Canales activos ahora", `${k.canales_activos}`, `de ${k.canales_total} disponibles`)}
      ${tarjeta("Videos en cola para hoy", k.en_cola_hoy, `Próximo horario: ${k.proximo}`)}
      ${tarjeta("Costo de servidor este mes", "$0", "Todo corre en tu PC")}
    </div>
    <div class="mb-4">
      <button id="btn-prueba" class="rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-5 py-3 font-semibold">🎬 Generar video de prueba ahora</button>
    </div>
    <div id="tracker">${trackerHtml(pipe)}</div>
    <section class="mt-6 rounded-2xl border border-linea bg-tarjeta p-5">
      <h2 class="font-semibold mb-3">🤖 Lo que hizo el Bot Guardián</h2>
      <div class="space-y-2 text-sm max-h-64 overflow-auto">
        ${(datos.log || []).map((l) => `<p class="text-zinc-300"><span class="text-zinc-500">${(l.creado_en || "").replace("T", " ").slice(0, 19)}</span> ${l.mensaje_pablo}</p>`).join("") || "<p>Todavía no hay avisos.</p>"}
      </div>
    </section>`;
  $("btn-prueba").onclick = async () => {
    $("btn-prueba").disabled = true;
    try {
      const r = await api("/api/generar-prueba", { method: "POST" });
      aviso(`Empecé ${r.canal}: ${r.gancho}`);
      escucharTarea(r.task_id);
    } catch (err) {
      aviso(err.message);
      $("btn-prueba").disabled = false;
    }
  };
  if (pipe && pipe.status === "procesando" && pipe.tarea_id) escucharTarea(pipe.tarea_id);
}

async function vistaCanales() {
  const { canales } = await api("/api/canales");
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold">📡 Mis 10 canales</h2>
    <p class="text-zinc-400 mb-5">Activa o pausa cada canal con un clic. Cada uno trabaja por su cuenta.</p>
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      ${canales.map((c) => {
        const tope = Math.max(c.videos, 1);
        const ancho = Math.min(100, Math.round((c.videos_listos / tope) * 100));
        return `<article class="rounded-2xl border p-4 text-center ${c.activo ? "border-emerald-700 bg-emerald-950/40" : "border-linea bg-tarjeta opacity-80"}">
          <div class="text-3xl">${c.emoji}</div>
          <p class="font-semibold text-sm mt-2">${c.nombre}</p>
          <p class="text-[11px] text-zinc-500">Canal ${c.numero}</p>
          <button data-id="${c.id}" data-on="${c.activo ? "1" : "0"}" class="mt-3 px-3 py-1 rounded-full text-xs font-bold ${c.activo ? "bg-emerald-500" : "bg-zinc-700"}">${c.activo ? "ON" : "OFF"}</button>
          <p class="text-[11px] text-zinc-400 mt-3">${c.videos} videos · ${c.guiones} guiones</p>
          <div class="h-1.5 bg-zinc-800 rounded-full mt-2"><div class="h-1.5 bg-emerald-500 rounded-full" style="width:${c.videos ? ancho : 0}%"></div></div>
        </article>`;
      }).join("")}
    </div>`;
  $("vista").querySelectorAll("button[data-id]").forEach((b) => {
    b.onclick = async () => {
      const activo = b.dataset.on !== "1";
      await api(`/api/canales/${b.dataset.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      });
      vistaCanales();
    };
  });
}

function campo(label, id, valor, tipo = "text") {
  return `<label class="block text-sm mb-3">${label}
    <input id="${id}" ${tipo === "area" ? "" : `type="${tipo}"`} value="${valor.replaceAll('"', "&quot;")}" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" />
  </label>`;
}

async function vistaCrear() {
  const { canales } = await api("/api/canales");
  const b = borrador;
  const opciones = canales.map((c) => `<option value="${c.id}" ${c.id === b.canal_id ? "selected" : ""}>${c.emoji} ${c.nombre}</option>`).join("");
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold">🎬 Crear video nuevo</h2>
    <p class="text-zinc-400 mb-4">Paso ${pasoCrear} de 4</p>
    <div class="rounded-2xl border border-linea bg-tarjeta p-5">
      ${pasoCrear === 1 ? `
        <h3 class="font-semibold mb-3">1. ¿Para qué canal?</h3>
        <label class="block text-sm mb-3">Canal<select id="canal_id" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2">${opciones}</select></label>
        <label class="block text-sm">Horario
          <select id="slot" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2">
            <option value="almuerzo" ${b.slot === "almuerzo" ? "selected" : ""}>Almuerzo 1:00 PM</option>
            <option value="noche" ${b.slot === "noche" ? "selected" : ""}>Noche 8:30 PM</option>
            <option value="ahora" ${b.slot === "ahora" ? "selected" : ""}>Publicar ahora mismo</option>
          </select>
        </label>` : ""}
      ${pasoCrear === 2 ? `
        <h3 class="font-semibold mb-3">2. El gancho (los primeros 3 segundos)</h3>
        <button id="auto" class="mb-3 text-sm underline text-emerald-300">Autocompletar con un guion de tu banco</button>
        ${campo("Texto grande en pantalla", "frame1_text", b.frame1_text)}
        ${campo("Lo que dice la voz en esos 3 segundos", "spoken_hook", b.spoken_hook)}` : ""}
      ${pasoCrear === 3 ? `
        <h3 class="font-semibold mb-3">3. El cuerpo del video</h3>
        <label class="block text-sm mb-3">Lo que dice la voz
          <textarea id="body_aida" rows="5" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2">${b.body_aida}</textarea>
        </label>
        ${campo("Palabra clave de comentarios (MAYÚSCULAS)", "cta_keyword", b.cta_keyword)}
        ${campo("Frase de cierre", "closing_phrase", b.closing_phrase)}
        ${campo("Regalo que prometes", "regalo", b.regalo)}` : ""}
      ${pasoCrear === 4 ? `
        <h3 class="font-semibold mb-3">4. El video de fondo</h3>
        <label class="block text-sm mb-2">De dónde sale
          <select id="fondo" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2">
            <option value="tiktok" ${b.fondo === "tiktok" ? "selected" : ""}>Enlace de TikTok</option>
            <option value="local" ${b.fondo === "local" ? "selected" : ""}>Un archivo de mi PC</option>
            <option value="pexels" ${b.fondo === "pexels" ? "selected" : ""}>Buscar uno libre en Pexels</option>
            <option value="banco" ${b.fondo === "banco" ? "selected" : ""}>Usar el menos usado de este canal</option>
          </select>
        </label>
        ${campo("Enlace de TikTok", "tiktok_url", b.tiktok_url)}
        <label class="block text-sm mb-3">Archivo .mp4
          <input id="archivo" type="file" accept="video/mp4" class="mt-1 block text-sm" />
          <span class="text-xs text-zinc-500">${b.local_path ? "Archivo listo en tu PC" : "Todavía no subes archivo"}</span>
        </label>
        <label class="flex items-center gap-2 text-sm mb-2">
          <input id="anti" type="checkbox" ${b.anti_copyright ? "checked" : ""} />
          🛡️ Escudo Anti-Copyright para videos de terceros
        </label>
        <ul class="text-xs text-zinc-400 mb-3 list-disc pl-5">
          <li>Modo espejo, giro 0.8°, zoom 106% y cambio de color</li>
          <li>Quita el audio original y los datos ocultos de TikTok</li>
          <li>Tus letras quedan al derecho</li>
        </ul>
        <button id="revisar" class="rounded-xl border border-linea px-3 py-2 text-sm">🔍 Revisar derechos de autor</button>
        <div id="dictamen" class="text-sm mt-3 text-zinc-300"></div>` : ""}
      <div class="flex gap-2 mt-5">
        ${pasoCrear > 1 ? `<button id="atras" class="rounded-xl px-4 py-2 bg-zinc-800">Atrás</button>` : ""}
        ${pasoCrear < 4 ? `<button id="sig" class="rounded-xl px-4 py-2 bg-emerald-600">Siguiente</button>` : `<button id="crear" class="rounded-xl px-4 py-2 bg-emerald-600">Armar este video</button>`}
      </div>
    </div>`;

  const leer = () => {
    for (const id of ["canal_id", "slot", "frame1_text", "spoken_hook", "body_aida", "cta_keyword", "closing_phrase", "regalo", "fondo", "tiktok_url"]) {
      const el = $(id);
      if (!el) continue;
      borrador[id] = id === "canal_id" ? Number(el.value) : el.value;
    }
    if ($("anti")) borrador.anti_copyright = $("anti").checked;
    if (borrador.cta_keyword) {
      borrador.cta_keyword = borrador.cta_keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    }
  };
  if ($("atras")) $("atras").onclick = () => { leer(); pasoCrear -= 1; vistaCrear(); };
  if ($("sig")) $("sig").onclick = () => { leer(); pasoCrear += 1; vistaCrear(); };
  if ($("auto")) $("auto").onclick = async () => {
    leer();
    try {
      const g = await api(`/api/guiones/sugerir?canal_id=${borrador.canal_id}&slot=${borrador.slot}`);
      borrador.frame1_text = g.frame1_text;
      borrador.spoken_hook = g.spoken_hook;
      borrador.body_aida = g.body_aida;
      borrador.cta_keyword = g.cta_keyword;
      borrador.closing_phrase = g.closing_phrase;
      borrador.regalo = g.activo;
      pasoCrear = 3;
      vistaCrear();
    } catch (err) { aviso(err.message); }
  };
  if ($("archivo")) $("archivo").onchange = async () => {
    const file = $("archivo").files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("archivo", file);
    try {
      const r = await api("/api/subir-video", { method: "POST", body: fd });
      borrador.local_path = r.ruta;
      borrador.fondo = "local";
      aviso("Archivo recibido.");
      vistaCrear();
    } catch (err) { aviso(err.message); }
  };
  if ($("revisar")) $("revisar").onclick = async () => {
    leer();
    try {
      const r = await api("/auditar_copyright", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoPath: borrador.local_path, tiktokUrl: borrador.tiktok_url }),
      });
      $("dictamen").innerHTML = `<p class="font-semibold">${r.titulo}</p><p class="mt-1">${r.resumen_pablo}</p><ul class="mt-2 list-disc pl-5">${(r.transformaciones || []).map((t) => `<li>${t}</li>`).join("")}</ul>`;
    } catch (err) { aviso(err.message); }
  };
  if ($("crear")) $("crear").onclick = async () => {
    leer();
    try {
      const r = await api("/api/crear-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(borrador),
      });
      aviso("Ya estoy armando tu video.");
      seccion = "inicio";
      pintarNav();
      await mostrar();
      escucharTarea(r.task_id);
    } catch (err) { aviso(err.message); }
  };
}

async function vistaCola() {
  const { cola } = await api("/api/cola");
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold">📋 Cola de publicación</h2>
    <p class="text-zinc-400 mb-4">El siguiente video usa el clip y el guion menos usados, y no repite el gancho ni la palabra del anterior.</p>
    <div class="overflow-auto rounded-2xl border border-linea">
      <table class="w-full text-sm">
        <thead class="bg-tarjeta text-zinc-400"><tr>
          <th class="text-left p-3">Canal</th><th class="text-left p-3">Gancho</th><th class="p-3">Horario</th><th class="p-3">Estado</th><th class="p-3">Acciones</th>
        </tr></thead>
        <tbody>
          ${cola.map((f) => `<tr class="border-t border-linea">
            <td class="p-3">${f.emoji} ${f.canal_nombre}</td>
            <td class="p-3">${f.frame1_text}<div class="text-xs text-zinc-500">${f.hook_id} · ${f.cta_keyword}</div></td>
            <td class="p-3 text-center">${f.slot}</td>
            <td class="p-3 text-center">${f.status}</td>
            <td class="p-3 text-center whitespace-nowrap">
              <button data-ver="${f.id}" class="px-2" ${f.output_path ? "" : "disabled"}>▶️</button>
              <button data-pin="${f.id}" class="px-2">${f.fijado ? "📌" : "📍"}</button>
              <button data-pub="${f.id}" class="px-2" ${f.output_path ? "" : "disabled"}>🚀</button>
              <button data-del="${f.id}" class="px-2">🗑️</button>
            </td>
          </tr>`).join("") || `<tr><td class="p-4 text-zinc-500" colspan="5">La cola está vacía.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div id="reproductor" class="mt-4"></div>`;
  $("vista").querySelectorAll("[data-ver]").forEach((b) => b.onclick = () => {
    $("reproductor").innerHTML = `<video controls autoplay class="w-full max-w-sm rounded-2xl" src="/api/cola/${b.dataset.ver}/video"></video>`;
  });
  $("vista").querySelectorAll("[data-pin]").forEach((b) => b.onclick = async () => {
    await api(`/api/cola/${b.dataset.pin}/fijar`, { method: "POST" });
    vistaCola();
  });
  $("vista").querySelectorAll("[data-pub]").forEach((b) => b.onclick = async () => {
    try {
      const r = await api(`/api/cola/${b.dataset.pub}/publicar`, { method: "POST" });
      aviso(r.telegram ? "Enviado a tu Telegram." : "Marcado como publicado en tu carpeta.");
      vistaCola();
    } catch (err) { aviso(err.message); }
  });
  $("vista").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    try {
      await api(`/api/cola/${b.dataset.del}`, { method: "DELETE" });
      vistaCola();
    } catch (err) { aviso(err.message); }
  });
}

async function vistaGuiones() {
  const canal = $("filtro-canal")?.value || "";
  const solo = $("filtro-solo")?.value || "";
  const q = new URLSearchParams();
  if (canal) q.set("canal_id", canal);
  if (solo) q.set("solo", solo);
  const [{ guiones }, { canales }] = await Promise.all([
    api("/api/guiones?" + q.toString()),
    api("/api/canales"),
  ]);
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold">✍️ Banco de guiones</h2>
    <p class="text-zinc-400 mb-4">El bot elige primero los que menos veces se han usado.</p>
    <div class="flex gap-2 mb-4">
      <select id="filtro-canal" class="rounded-xl bg-tarjeta border border-linea px-3 py-2">
        <option value="">Todos los canales</option>
        ${canales.map((c) => `<option value="${c.id}" ${String(c.id) === canal ? "selected" : ""}>${c.emoji} ${c.nombre}</option>`).join("")}
      </select>
      <select id="filtro-solo" class="rounded-xl bg-tarjeta border border-linea px-3 py-2">
        <option value="">Todos</option>
        <option value="activos" ${solo === "activos" ? "selected" : ""}>Activos</option>
        <option value="pausados" ${solo === "pausados" ? "selected" : ""}>Pausados</option>
      </select>
    </div>
    <div class="overflow-auto rounded-2xl border border-linea mb-6">
      <table class="w-full text-sm">
        <thead class="bg-tarjeta text-zinc-400"><tr>
          <th class="text-left p-3">Hook</th><th class="text-left p-3">Gancho</th><th class="text-left p-3">Canal</th><th class="p-3">Palabra</th><th class="p-3">Veces usado</th><th class="p-3">Horario</th>
        </tr></thead>
        <tbody>
          ${guiones.map((g) => `<tr class="border-t border-linea">
            <td class="p-3">${g.hook_id}</td>
            <td class="p-3">${g.frame1_text}</td>
            <td class="p-3">${g.emoji} ${g.canal_nombre}</td>
            <td class="p-3 text-center">${g.cta_keyword}</td>
            <td class="p-3 text-center font-semibold">${g.veces_usado}</td>
            <td class="p-3 text-center">${g.slot}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <form id="nuevo" class="rounded-2xl border border-linea bg-tarjeta p-5 grid sm:grid-cols-2 gap-3">
      <h3 class="sm:col-span-2 font-semibold">Agregar un guion</h3>
      <label class="text-sm">Canal<select name="canal_id" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2">${canales.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("")}</select></label>
      <label class="text-sm">Horario<select name="slot" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2"><option value="almuerzo">Almuerzo</option><option value="noche">Noche</option></select></label>
      <label class="text-sm">Hook (H1 a H5)<input name="hook_id" required class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" /></label>
      <label class="text-sm">Palabra clave<input name="cta_keyword" required class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" /></label>
      <label class="text-sm sm:col-span-2">Texto en pantalla<input name="frame1_text" required class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" /></label>
      <label class="text-sm sm:col-span-2">Voz del gancho<input name="spoken_hook" required class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" /></label>
      <label class="text-sm sm:col-span-2">Cuerpo<textarea name="body_aida" required rows="3" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2"></textarea></label>
      <label class="text-sm sm:col-span-2">Cierre<input name="closing_phrase" required class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" /></label>
      <label class="text-sm sm:col-span-2">Regalo<input name="activo" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" placeholder="Qué recibe quien comente" /></label>
      <button class="sm:col-span-2 rounded-xl bg-emerald-600 py-2 font-semibold">Guardar guion</button>
    </form>`;
  $("filtro-canal").onchange = vistaGuiones;
  $("filtro-solo").onchange = vistaGuiones;
  $("nuevo").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = Object.fromEntries(fd.entries());
    body.canal_id = Number(body.canal_id);
    try {
      await api("/api/guiones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      aviso("Guion guardado.");
      vistaGuiones();
    } catch (err) { aviso(err.message); }
  };
}

async function vistaGuardian() {
  const [mem, inicio] = await Promise.all([api("/memoria"), api("/api/inicio")]);
  const pct = Math.min(100, Math.round((mem.mb_usados / mem.mb_max) * 100));
  const ultimo = (inicio.log || [])[0];
  const salud = ultimo?.semaforo === "rojo" ? "🚨 Revisa el aviso" : ultimo?.semaforo === "amarillo" ? "⚠️ Hay un aviso" : "✅ Todo OK";
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold">🤖 Bot Guardián</h2>
    <p class="text-zinc-400 mb-5">Trabaja en tu computadora y solo te avisa cuando hace falta.</p>
    <div class="grid md:grid-cols-3 gap-3 mb-5">
      ${tarjeta("Estado", salud, "Según el último aviso")}
      ${tarjeta("Instagram", "Sin conectar", "Se renovará solo 7 días antes, cuando lo conectes")}
      ${tarjeta("Memoria de videos", `${mem.mb_usados} MB`, `Límite seguro: ${mem.mb_max} MB`)}
    </div>
    <section class="rounded-2xl border border-linea bg-tarjeta p-5">
      <div class="h-3 rounded-full bg-zinc-800 mb-3"><div class="h-3 rounded-full bg-emerald-500" style="width:${pct}%"></div></div>
      <p class="text-sm mb-3">Guardar historial por</p>
      <div class="flex gap-2 mb-4">
        <button data-dias="7" class="px-4 py-2 rounded-full ${mem.historial_dias === 7 ? "bg-emerald-600" : "bg-zinc-800"}">7 días</button>
        <button data-dias="15" class="px-4 py-2 rounded-full ${mem.historial_dias === 15 ? "bg-emerald-600" : "bg-zinc-800"}">15 días</button>
      </div>
      <button id="limpiar" class="rounded-xl bg-zinc-100 text-zinc-900 px-4 py-2 font-semibold">🧹 Limpiar memoria ahora</button>
      <p class="text-xs text-zinc-500 mt-3">Borra videos ya publicados, excepto los que marcaste con 📌. Los audios y subtítulos sueltos no se quedan.</p>
    </section>
    <section class="mt-5 rounded-2xl border border-linea bg-tarjeta p-5 space-y-2 text-sm">
      ${(inicio.log || []).map((l) => `<p><span class="text-zinc-500">${(l.creado_en || "").slice(11, 19)}</span> ${l.mensaje_pablo}</p>`).join("")}
    </section>`;
  $("vista").querySelectorAll("[data-dias]").forEach((b) => b.onclick = async () => {
    await api("/api/config/historial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dias: Number(b.dataset.dias) }) });
    vistaGuardian();
  });
  $("limpiar").onclick = async () => {
    const r = await api("/memoria/limpiar", { method: "POST" });
    aviso(`Listo. Liberé ${r.mb_liberados} MB.`);
    vistaGuardian();
  };
}

async function vistaConfig() {
  const { claves } = await api("/api/config/claves");
  const fila = (clave, etiqueta) => {
    const info = claves[clave];
    return `<label class="block text-sm">${etiqueta}
      <input name="${clave}" type="password" autocomplete="off" placeholder="${info.guardada ? "Guardada " + info.pista + " · escribe solo si quieres cambiarla" : "Pega tu clave"}" class="mt-1 w-full rounded-xl bg-zinc-900 border border-linea px-3 py-2" />
    </label>`;
  };
  $("vista").innerHTML = `
    <h2 class="text-2xl font-semibold">⚙️ Configuración</h2>
    <p class="text-zinc-400 mb-4">Estas claves se quedan en tu PC, en un archivo privado.</p>
    <form id="claves" class="rounded-2xl border border-linea bg-tarjeta p-5 space-y-3 max-w-xl">
      ${fila("ELEVENLABS_API_KEY", "ElevenLabs API Key")}
      ${fila("ELEVENLABS_VOICE_ID", "ElevenLabs Voice ID (opcional)")}
      ${fila("PEXELS_API_KEY", "Pexels API Key")}
      ${fila("TELEGRAM_BOT_TOKEN", "Telegram Bot Token")}
      ${fila("TELEGRAM_CHAT_ID", "Telegram Chat ID")}
      <button class="rounded-xl bg-emerald-600 px-4 py-2 font-semibold">Guardar en esta computadora</button>
    </form>
    <section class="mt-5 text-sm text-zinc-400 space-y-1">
      <p>📸 Instagram: se conecta cuando pegues el acceso en una siguiente fase.</p>
      <p>▶️ YouTube y Facebook: igual, desde aquí más adelante.</p>
      <p>🎵 Mientras tanto, el video queda en tu carpeta y puede ir a Telegram.</p>
    </section>`;
  $("claves").onsubmit = async (ev) => {
    ev.preventDefault();
    const body = Object.fromEntries(new FormData(ev.target).entries());
    try {
      await api("/api/config/claves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      aviso("Claves guardadas en esta PC.");
      vistaConfig();
    } catch (err) { aviso(err.message); }
  };
}

async function mostrar() {
  $("vista").innerHTML = `<p class="text-zinc-400">Cargando…</p>`;
  try {
    if (seccion === "inicio") await vistaInicio();
    else if (seccion === "canales") await vistaCanales();
    else if (seccion === "crear") await vistaCrear();
    else if (seccion === "cola") await vistaCola();
    else if (seccion === "guiones") await vistaGuiones();
    else if (seccion === "guardian") await vistaGuardian();
    else await vistaConfig();
  } catch (err) {
    $("vista").innerHTML = `<p class="text-red-300">${err.message}</p>`;
  }
}

fechaHumana();
pintarNav();
mostrar();
setInterval(() => {
  if (seccion === "inicio" && (!flujo || flujo.readyState === 2)) vistaInicio().catch(() => {});
}, 8000);
