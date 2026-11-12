/* Panel ranking-app — vanilla JS, sin red externa */
(function () {
  const estado = {
    version: 1,
    title: "Mi ranking",
    preset: "classic",
    accent: "#FACC15",
    framing: "fill",
    hook: { enabled: false, fromRankId: null, seconds: 1.5 },
    music: { path: null, volume: 0.25 },
    voiceover: { path: null, volume: 1.0 },
    sting: { path: null, volume: 0.8 },
    watermark: { path: null, opacity: 0.85 },
    outputDir: "",
    clips: [],
  };

  let indicePreview = 0;
  let guardarTimer = null;
  let jobActual = null;
  let fuenteEventos = null;
  let ultimoMp4 = null;
  let exportando = false;
  let versionProyecto = "";
  let pollInterval = null;
  let miniaturaActualPath = null;
  let miniaturaBaseImg = null;
  let miniaturaDirty = false;
  let thumbColor = "#FFFFFF";

  const $ = (id) => document.getElementById(id);

  function numeroPuesto(indice, total) {
    return Math.max(1, total - indice);
  }

  function nombreArchivo(clip) {
    const p = String(clip.path || clip.label || "");
    const base = p.split(/[/\\]/).pop() || "clip";
    return base;
  }

  function pareceArchivo(texto) {
    const s = String(texto || "").trim();
    if (!s) return false;
    if (/^(twitter|instagram|tiktok|facebook|youtube|yt|clip)[-_]/i.test(s)) return true;
    if ((s.match(/-/g) || []).length >= 3 || s.length > 36) return true;
    return false;
  }

  function fraseClip(clip) {
    if (clip.textoLista != null) return String(clip.textoLista).trim();
    return pareceArchivo(clip.label) ? "" : String(clip.label || "").trim();
  }

  const CLAVE_MUTE = "ranking-preview-mute";
  const CLAVE_VOL = "ranking-preview-vol";

  function leerAudioPreview() {
    let vol = Number(localStorage.getItem(CLAVE_VOL));
    if (!Number.isFinite(vol)) vol = 80;
    vol = Math.max(0, Math.min(100, vol));
    const mute = localStorage.getItem(CLAVE_MUTE) === "1" || vol === 0;
    return { mute, vol };
  }

  function pintarControlesAudio() {
    const { mute, vol } = leerAudioPreview();
    const btn = $("btn-mute");
    const slider = $("preview-volume");
    if (btn) btn.textContent = mute ? "🔇" : "🔊";
    if (slider) slider.value = String(vol);
  }

  function aplicarAudioPreview(video) {
    if (!video) return;
    const { mute, vol } = leerAudioPreview();
    try {
      video.volume = vol / 100;
    } catch (e) {
      /* un clip sin audio no debe tumbar la vista previa */
    }
    video.muted = mute;
  }

  function duracionClip(c) {
    return Math.max(0, Number(c.trimOut) - Number(c.trimIn));
  }

  function formatoSegundos(s) {
    const n = Math.max(0, s);
    const m = Math.floor(n / 60);
    const r = Math.floor(n % 60);
    const d = Math.floor((n % 1) * 10);
    return `${m}:${String(r).padStart(2, "0")}.${d}`;
  }

  function clonarEstado() {
    return JSON.parse(JSON.stringify(estado));
  }

  async function api(ruta, opciones = {}) {
    const res = await fetch(ruta, opciones);
    const tipo = res.headers.get("content-type") || "";
    if (tipo.includes("application/json")) {
      const data = await res.json();
      if (!res.ok) {
        const det = data.detail || data.error || JSON.stringify(data);
        throw new Error(typeof det === "string" ? det : JSON.stringify(det));
      }
      return data;
    }
    if (!res.ok) throw new Error(`Error ${res.status} en ${ruta}`);
    return res;
  }

  function programarGuardado() {
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(guardarProyecto, 700);
  }

  async function guardarProyecto() {
    try {
      await api("/api/proyecto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clonarEstado()),
      });
      await actualizarVersion();
    } catch (e) {
      console.warn("Autoguardado:", e.message);
    }
  }

  async function cargarInicial() {
    try {
      const data = await api("/api/proyecto");
      Object.assign(estado, data);
      if (!estado.clips) estado.clips = [];
      if (!estado.music) estado.music = { path: null, volume: 0.25 };
      if (!estado.sting) estado.sting = { path: null, volume: 0.8 };
      // Guardar versión para detectar cambios externos
      await actualizarVersion();
    } catch (e) {
      console.warn(e);
    }
    sincronizarFormulario();
    pintarDeck();
    actualizarResumen();
    await refrescarPreview();
    // Iniciar polling de cambios externos (cada 3 segundos)
    iniciarPolling();
  }

  async function actualizarVersion() {
    try {
      const v = await api("/api/proyecto/version");
      versionProyecto = v.version;
    } catch {
      /* ignore */
    }
  }

  async function verificarCambiosExternos() {
    if (exportando) return; // No recargar mientras exporta
    try {
      const v = await api("/api/proyecto/version");
      if (v.version && v.version !== versionProyecto) {
        console.log("Detectados cambios externos, recargando proyecto...");
        versionProyecto = v.version;
        await recargarProyectoExterno();
      }
    } catch {
      /* ignore */
    }
  }

  async function recargarProyectoExterno() {
    try {
      const data = await api("/api/proyecto");
      // Solo recargar si hay más clips o cambios significativos
      if (data.clips && data.clips.length !== estado.clips.length) {
        Object.assign(estado, data);
        if (!estado.clips) estado.clips = [];
        sincronizarFormulario();
        pintarDeck();
        actualizarResumen();
        await refrescarPreview();
        $("texto-export").textContent = `Se agregaron clips desde otra app (${estado.clips.length} total).`;
        $("texto-export").className = "tip ok";
      }
    } catch {
      /* ignore */
    }
  }

  function iniciarPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(verificarCambiosExternos, 3000);
    // También verificar al enfocar la ventana
    window.addEventListener("focus", verificarCambiosExternos);
  }

  function sincronizarFormulario() {
    $("campo-titulo").value = estado.title || "";
    pintarChipsTitulo();
    $("campo-salida").value = estado.outputDir || "";
    $("slider-musica").value = Math.round((estado.music.volume || 0) * 100);
    $("slider-sting").value = Math.round((estado.sting.volume || 0.8) * 100);
    $("txt-musica-vol").textContent = $("slider-musica").value + "%";
    $("txt-sting-vol").textContent = $("slider-sting").value + "%";
    $("nombre-musica").textContent = estado.music.path
      ? estado.music.path.split(/[/\\]/).pop()
      : "Sin música";
    marcarPreset(estado.preset);
    marcarFraming(estado.framing);
    marcarAccent(estado.accent);
    $("color-personalizado").value = normalizarHex(estado.accent);
    if (!estado.voiceover) estado.voiceover = { path: null, volume: 1.0 };
    if (!estado.watermark) estado.watermark = { path: null, opacity: 0.85 };
    $("nombre-voz").textContent = estado.voiceover.path
      ? estado.voiceover.path.split(/[/\\]/).pop()
      : "Sin voz";
    $("nombre-marca").textContent = estado.watermark.path
      ? estado.watermark.path.split(/[/\\]/).pop()
      : "Sin marca";
    $("hook-enabled").checked = Boolean(estado.hook?.enabled);
    $("hook-seconds").value = estado.hook?.seconds ?? 1.5;
    actualizarHookSelect();
  }

  function actualizarHookSelect() {
    const sel = $("hook-clip");
    if (!sel) return;
    sel.innerHTML = "";
    const n = estado.clips.length;
    estado.clips.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `#${numeroPuesto(i, n)} — ${fraseClip(c) || nombreArchivo(c)}`;
      sel.appendChild(opt);
    });
    const preferido = estado.hook?.fromRankId;
    const ultimo = n ? estado.clips[n - 1].id : "";
    sel.value = preferido || ultimo;
  }

  function parsearPalabrasTitulo(raw) {
    const tokens = String(raw || "").trim().split(/\s+/).filter(Boolean);
    const tieneMarcas = /\*[^*]+\*|\[[^\]]+\]|\{[^}]+\}/.test(raw || "");
    const ciclo = ["white", "red", "yellow", "cyan"];
    const palabras = tokens.map((tok, idx) => {
      if (/^\*[^*]+\*$/.test(tok)) return { text: tok.slice(1, -1), color: "red" };
      if (/^\[[^\]]+\]$/.test(tok)) return { text: tok.slice(1, -1), color: "yellow" };
      if (/^\{[^}]+\}$/.test(tok)) return { text: tok.slice(1, -1), color: "cyan" };
      return { text: tok.replace(/[\*\[\]\{\}]/g, ""), color: tieneMarcas ? "white" : ciclo[idx % 4] };
    });
    return { tieneMarcas, palabras };
  }

  function serializarPalabrasTitulo(palabras) {
    return palabras
      .map((p) => {
        if (p.color === "red") return `*${p.text}*`;
        if (p.color === "yellow") return `[${p.text}]`;
        if (p.color === "cyan") return `{${p.text}}`;
        return p.text;
      })
      .join(" ");
  }

  function pintarChipsTitulo() {
    const cont = $("titulo-chips");
    if (!cont) return;
    cont.innerHTML = "";
    const { tieneMarcas, palabras } = parsearPalabrasTitulo($("campo-titulo")?.value || estado.title);
    if (!palabras.length) return;

    const btnAuto = document.createElement("button");
    btnAuto.type = "button";
    btnAuto.className = "titulo-chip titulo-chip-auto" + (tieneMarcas ? "" : " active");
    btnAuto.textContent = "🎨 Auto";
    btnAuto.title = "Alternar colores automáticamente";
    btnAuto.addEventListener("click", () => {
      const limpio = palabras.map((p) => p.text).join(" ");
      $("campo-titulo").value = limpio;
      estado.title = limpio;
      pintarChipsTitulo();
      programarGuardado();
      refrescarOverlay();
    });
    cont.appendChild(btnAuto);

    const orden = ["white", "red", "yellow", "cyan"];
    palabras.forEach((p, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `titulo-chip c-${p.color}`;
      chip.textContent = p.text;
      chip.title = "Clic para cambiar el color de esta palabra";
      chip.addEventListener("click", () => {
        const nextColor = orden[(orden.indexOf(p.color) + 1) % orden.length];
        palabras[idx].color = nextColor;
        const nuevo = serializarPalabrasTitulo(palabras);
        $("campo-titulo").value = nuevo;
        estado.title = nuevo;
        pintarChipsTitulo();
        programarGuardado();
        refrescarOverlay();
      });
      cont.appendChild(chip);
    });
  }

  function normalizarHex(c) {
    if (!c || !c.startsWith("#")) return "#facc15";
    return c.length === 7 ? c : "#facc15";
  }

  function marcarPreset(p) {
    document.querySelectorAll("#grupo-presets .preset-btn[data-preset]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === p);
    });
  }

  function marcarFraming(f) {
    document.querySelectorAll("#grupo-framing .frame-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.framing === f);
    });
    $("video-preview")?.classList.toggle("fit", f === "fit");
  }

  function marcarAccent(color) {
    document.querySelectorAll("#grupo-accentos .accent-dot").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.color.toLowerCase() === (color || "").toLowerCase());
    });
  }

  function actualizarResumen() {
    const total = estado.clips.length;
    const seg = estado.clips.reduce((a, c) => a + duracionClip(c), 0);
    $("badge-resumen").textContent =
      total === 0 ? "0 clips" : `${total} clips · ${formatoSegundos(seg)}`;
    $("deck-vacio").hidden = total > 0;
    revisarAvisosTrim();
  }

  function revisarAvisosTrim() {
    const largos = estado.clips.filter((c) => duracionClip(c) > 60);
    const aviso = $("aviso-trim");
    if (!largos.length) {
      aviso.hidden = true;
      return;
    }
    aviso.hidden = false;
    aviso.textContent =
      "Hay clips con más de 60 s: acorta el inicio o el fin antes de exportar (" +
      largos.map((c) => c.label).join(", ") +
      ").";
  }

  function pintarDeck() {
    const cont = $("lista-clips");
    cont.innerHTML = "";
    const n = estado.clips.length;
    estado.clips.forEach((clip, i) => {
      const card = document.createElement("article");
      card.className = "clip-card" + (i === indicePreview ? " active" : "");
      if (duracionClip(clip) > 60) card.classList.add("trim-warn");

      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.alt = "";
      thumb.src = `/api/miniatura/${encodeURIComponent(clip.id)}`;
      thumb.onerror = () => {
        thumb.replaceWith(document.createElement("div"));
      };

      const info = document.createElement("div");
      info.className = "clip-info";

      const nombre = document.createElement("input");
      nombre.className = "clip-name";
      nombre.value = fraseClip(clip);
      nombre.placeholder = "Texto en lista (opcional)";
      nombre.addEventListener("click", (e) => e.stopPropagation());
      nombre.addEventListener("change", () => {
        clip.textoLista = nombre.value.trim();
        programarGuardado();
        refrescarOverlay();
        pintarEtiquetaPuesto();
      });

      const archivo = document.createElement("div");
      archivo.className = "clip-archivo";
      archivo.textContent = nombreArchivo(clip);

      const trim = document.createElement("div");
      trim.className = "clip-trim";
      trim.innerHTML = '<span>In</span>';
      const inEl = document.createElement("input");
      inEl.type = "number";
      inEl.min = "0";
      inEl.step = "0.1";
      inEl.value = clip.trimIn;
      const outEl = document.createElement("input");
      outEl.type = "number";
      outEl.min = "0.1";
      outEl.step = "0.1";
      outEl.value = clip.trimOut;
      trim.appendChild(inEl);
      trim.appendChild(document.createTextNode("Out"));
      trim.appendChild(outEl);
      const durEl = document.createElement("span");
      durEl.className = "clip-dur";
      durEl.textContent = ` (${duracionClip(clip).toFixed(1)} s)`;
      trim.appendChild(durEl);

      const onTrim = () => {
        clip.trimIn = Number(inEl.value) || 0;
        clip.trimOut = Number(outEl.value) || clip.trimIn + 0.5;
        if (clip.trimOut <= clip.trimIn) clip.trimOut = clip.trimIn + 0.5;
        programarGuardado();
        actualizarResumen();
        if (i === indicePreview) prepararVideoPreview();
      };
      inEl.addEventListener("change", onTrim);
      outEl.addEventListener("change", onTrim);
      inEl.addEventListener("click", (e) => e.stopPropagation());
      outEl.addEventListener("click", (e) => e.stopPropagation());

      const audioRow = document.createElement("div");
      audioRow.className = "clip-audio-row";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "audio-toggle" + (clip.keepAudio ? " on" : "");
      toggle.title = "Audio original de este clip";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        clip.keepAudio = !clip.keepAudio;
        toggle.classList.toggle("on", clip.keepAudio);
        programarGuardado();
      });
      audioRow.appendChild(toggle);
      audioRow.appendChild(document.createTextNode("Audio original en el export"));

      info.appendChild(nombre);
      info.appendChild(archivo);
      info.appendChild(trim);
      info.appendChild(audioRow);

      const badge = document.createElement("div");
      badge.className = "rank-badge";
      badge.textContent = `#${numeroPuesto(i, n)}`;

      const acciones = document.createElement("div");
      acciones.className = "clip-actions";
      const subir = document.createElement("button");
      subir.type = "button";
      subir.className = "btn-xs";
      subir.textContent = "▲";
      subir.title = "Subir en la lista";
      subir.disabled = i === 0;
      subir.addEventListener("click", (e) => {
        e.stopPropagation();
        moverClip(i, -1);
      });
      const bajar = document.createElement("button");
      bajar.type = "button";
      bajar.className = "btn-xs";
      bajar.textContent = "▼";
      bajar.title = "Bajar en la lista";
      bajar.disabled = i === n - 1;
      bajar.addEventListener("click", (e) => {
        e.stopPropagation();
        moverClip(i, 1);
      });
      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "btn-xs btn-xs-danger";
      quitar.textContent = "✕";
      quitar.title = "Quitar clip del ranking";
      quitar.addEventListener("click", (e) => {
        e.stopPropagation();
        quitarClip(i);
      });
      acciones.appendChild(subir);
      acciones.appendChild(bajar);
      acciones.appendChild(quitar);

      card.appendChild(thumb);
      card.appendChild(info);
      card.appendChild(badge);
      card.appendChild(acciones);

      card.draggable = true;
      card.dataset.index = String(i);
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(i));
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const from = Number(e.dataTransfer.getData("text/plain"));
        const to = i;
        if (Number.isNaN(from) || from === to) return;
        const item = estado.clips.splice(from, 1)[0];
        estado.clips.splice(to, 0, item);
        if (indicePreview === from) indicePreview = to;
        else if (from < indicePreview && to >= indicePreview) indicePreview -= 1;
        else if (from > indicePreview && to <= indicePreview) indicePreview += 1;
        programarGuardado();
        pintarDeck();
        refrescarPreview();
      });

      card.addEventListener("click", () => {
        indicePreview = i;
        pintarDeck();
        refrescarPreview();
      });

      cont.appendChild(card);
    });
    actualizarHookSelect();
  }

  function mezclarDeck() {
    if (estado.clips.length < 2) return;
    for (let i = estado.clips.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [estado.clips[i], estado.clips[j]] = [estado.clips[j], estado.clips[i]];
    }
    programarGuardado();
    pintarDeck();
    refrescarPreview();
  }

  function moverClip(indice, delta) {
    const nuevo = indice + delta;
    if (nuevo < 0 || nuevo >= estado.clips.length) return;
    const t = estado.clips[indice];
    estado.clips[indice] = estado.clips[nuevo];
    estado.clips[nuevo] = t;
    if (indicePreview === indice) indicePreview = nuevo;
    else if (indicePreview === nuevo) indicePreview = indice;
    programarGuardado();
    pintarDeck();
    refrescarPreview();
  }

  function quitarClip(indice) {
    if (indice < 0 || indice >= estado.clips.length) return;
    clearTimeout(guardarTimer);
    const [eliminado] = estado.clips.splice(indice, 1);
    if (estado.hook?.fromRankId && eliminado?.id === estado.hook.fromRankId) {
      estado.hook.fromRankId = estado.clips.length ? estado.clips[estado.clips.length - 1].id : null;
    }
    if (estado.clips.length === 0) {
      indicePreview = 0;
    } else if (indicePreview >= estado.clips.length) {
      indicePreview = estado.clips.length - 1;
    } else if (indice < indicePreview) {
      indicePreview -= 1;
    }
    pintarDeck();
    actualizarResumen();
    void refrescarPreview();
  }

  function vaciarDeck() {
    if (!estado.clips.length) return;
    clearTimeout(guardarTimer);
    estado.clips = [];
    if (estado.hook) estado.hook.fromRankId = null;
    indicePreview = 0;
    pintarDeck();
    actualizarResumen();
    void refrescarPreview();
  }

  async function subirVideos(files) {
    if (!files || !files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("archivos", f);
    try {
      const data = await api("/api/importar", { method: "POST", body: fd });
      for (const c of data.clips) {
        if (estado.clips.length >= 10) break;
        estado.clips.push({
          id: c.id,
          path: c.path,
          label: c.label,
          trimIn: c.trimIn,
          trimOut: c.trimOut,
          keepAudio: c.keepAudio ?? false,
        });
      }
      programarGuardado();
      pintarDeck();
      actualizarResumen();
      if (estado.clips.length) {
        indicePreview = Math.min(indicePreview, estado.clips.length - 1);
        await guardarProyecto();
        await refrescarPreview();
      }
    } catch (e) {
      $("texto-export").textContent = e.message;
      $("texto-export").className = "tip error";
    }
  }

  async function refrescarPreview() {
    await guardarProyecto();
    await refrescarOverlay();
    await prepararVideoPreview();
    const n = estado.clips.length;
    if (!n) {
      $("etiqueta-puesto").textContent = "Añade clips para previsualizar";
      return;
    }
    indicePreview = Math.max(0, Math.min(indicePreview, n - 1));
    pintarEtiquetaPuesto();
  }

  function pintarEtiquetaPuesto() {
    const n = estado.clips.length;
    if (!n) {
      $("etiqueta-puesto").textContent = "Añade clips para previsualizar";
      return;
    }
    const c = estado.clips[indicePreview];
    const frase = fraseClip(c);
    $("etiqueta-puesto").textContent = frase
      ? `#${numeroPuesto(indicePreview, n)} — ${frase}`
      : `#${numeroPuesto(indicePreview, n)}`;
  }

  async function refrescarOverlay() {
    const img = $("overlay-preview");
    if (!estado.clips.length) {
      img.removeAttribute("src");
      return;
    }
    try {
      const res = await fetch("/api/overlay-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: estado.title,
          preset: estado.preset,
          accent: estado.accent,
          clip_index: indicePreview,
          clips: estado.clips.map((c) => ({
            label: c.label,
            textoLista: fraseClip(c),
          })),
        }),
      });
      if (!res.ok) throw new Error("No pude generar la vista previa del texto");
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch (e) {
      console.warn(e);
    }
  }

  function formatoCorto(s) {
    const n = Math.max(0, Number(s) || 0);
    const m = Math.floor(n / 60);
    const r = Math.floor(n % 60);
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function actualizarBarraSeek(video) {
    const seek = $("preview-seek");
    const timeEl = $("preview-time");
    if (!seek || !timeEl) return;
    const dur = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const cur = video ? Number(video.currentTime) || 0 : 0;
    seek.max = String(dur || 1);
    seek.value = String(Math.min(cur, dur || 1));
    timeEl.textContent = `${formatoCorto(cur)} / ${formatoCorto(dur)}`;
  }

  async function prepararVideoPreview() {
    const video = $("video-preview");
    $("btn-play").textContent = "▶";
    if (!estado.clips.length) {
      video.removeAttribute("src");
      actualizarBarraSeek(null);
      return;
    }
    const clip = estado.clips[indicePreview];
    video.src = `/api/clip/${encodeURIComponent(clip.id)}?t=${Date.now()}`;
    aplicarAudioPreview(video);
    const ir = () => {
      video.currentTime = Math.max(0, Number(clip.trimIn) || 0);
      actualizarBarraSeek(video);
    };
    video.onloadedmetadata = ir;
    video.ontimeupdate = () => {
      actualizarBarraSeek(video);
      const max = Number(clip.trimOut) || video.duration;
      if (!video.paused && max > 0 && video.currentTime >= max - 0.05) {
        video.pause();
        $("btn-play").textContent = "▶";
        video.currentTime = Number(clip.trimIn) || 0;
        actualizarBarraSeek(video);
      }
    };
    video.onended = () => {
      $("btn-play").textContent = "▶";
    };
  }

  function togglePlay() {
    const video = $("video-preview");
    if (!video.src) return;
    if (video.paused) {
      video.play().catch(() => {});
      $("btn-play").textContent = "❚❚";
    } else {
      video.pause();
      $("btn-play").textContent = "▶";
    }
  }

  function cambiarPuesto(delta) {
    if (!estado.clips.length) return;
    indicePreview = (indicePreview + delta + estado.clips.length) % estado.clips.length;
    pintarDeck();
    refrescarPreview();
  }

  function setExportando(on) {
    exportando = on;
    $("btn-exportar").disabled = on;
    $("btn-babeldesk").disabled = on;
    const fab = $("btn-fabrica");
    if (fab) fab.disabled = on;
    $("btn-cancelar").hidden = !on;
  }

  function cerrarSSE() {
    if (fuenteEventos) {
      fuenteEventos.close();
      fuenteEventos = null;
    }
  }

  async function iniciarExport(destino) {
    if (exportando) return;
    $("texto-export").className = "tip";
    if (estado.clips.length < 3) {
      $("texto-export").textContent = "Necesitas al menos 3 clips.";
      $("texto-export").className = "tip error";
      return;
    }
    const mal = estado.clips.some((c) => duracionClip(c) > 60 || duracionClip(c) <= 0.2);
    if (mal) {
      $("texto-export").textContent = "Revisa los recortes (máx. 60 s cada uno).";
      $("texto-export").className = "tip error";
      return;
    }

    aplicarCamposAEstado();
    await guardarProyecto();
    setExportando(true);
    $("barra-progreso").style.width = "0%";
    $("texto-export").textContent = destino === "preview" ? "Armando vista previa…" : "Preparando exportación…";

    let entregado = false;
    const entregarSiToca = async () => {
      if (entregado) return;
      entregado = true;
      if (destino === "babeldesk") await enviarInbox();
      else if (destino === "fabrica") await enviarFabrica();
      else if (destino === "preview" || !destino) abrirModalPreviewFinal(jobActual);
    };

    try {
      const data = await api("/api/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proyecto: clonarEstado(), preview: destino === "preview" }),
      });
      jobActual = data.job_id;
      ultimoMp4 = null;

      await new Promise((resolve, reject) => {
        cerrarSSE();
        fuenteEventos = new EventSource(`/api/exportar/progreso/${jobActual}`);
        fuenteEventos.onmessage = async (ev) => {
          let job;
          try {
            job = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (job.total > 0) {
            const pct = Math.min(100, Math.round((job.step / job.total) * 100));
            $("barra-progreso").style.width = pct + "%";
          }
          if (job.msg) $("texto-export").textContent = job.msg;
          if (job.done) {
            cerrarSSE();
            if (job.ok && job.result) {
              ultimoMp4 = job.result.output_path;
              $("barra-progreso").style.width = "100%";
              $("texto-export").textContent = `Listo: ${ultimoMp4}`;
              $("texto-export").className = "tip ok";
              try {
                await entregarSiToca();
                resolve();
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error(job.error || "Exportación fallida"));
            }
          }
        };
        fuenteEventos.onerror = () => {
          cerrarSSE();
          pollEstado(jobActual)
            .then(() => entregarSiToca())
            .then(resolve)
            .catch(reject);
        };
      });
    } catch (e) {
      $("texto-export").textContent = e.message;
      $("texto-export").className = "tip error";
    } finally {
      setExportando(false);
      jobActual = null;
    }
  }

  async function pollEstado(jobId) {
    for (let i = 0; i < 240; i++) {
      const job = await api(`/api/exportar/estado/${jobId}`);
      if (job.total > 0) {
        $("barra-progreso").style.width =
          Math.min(100, Math.round((job.step / job.total) * 100)) + "%";
      }
      if (job.msg) $("texto-export").textContent = job.msg;
      if (job.done) {
        if (job.ok && job.result) {
          ultimoMp4 = job.result.output_path;
          $("texto-export").textContent = `Listo: ${ultimoMp4}`;
          $("texto-export").className = "tip ok";
          return;
        }
        throw new Error(job.error || "Exportación fallida");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Tiempo de espera agotado");
  }

  async function enviarInbox() {
    if (!ultimoMp4) {
      $("texto-export").textContent = "Primero exporta un MP4.";
      return;
    }
    $("barra-progreso").classList.add("verde");
    $("texto-export").textContent = "Enviando a BabelDesk…";
    try {
      if (miniaturaBaseImg && miniaturaDirty) {
        await guardarMiniaturaActual();
      }
      const data = await api("/api/enviar-a-babeldesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mp4_path: ultimoMp4,
          miniatura_path: miniaturaActualPath,
          proyecto: clonarEstado(),
        }),
      });
      $("texto-export").textContent = `Entregado en: ${data.inbox}`;
      $("texto-export").className = "tip ok";
    } catch (e) {
      $("texto-export").textContent = e.message;
      $("texto-export").className = "tip error";
    }
  }

  async function enviarFabrica() {
    if (!ultimoMp4) {
      $("texto-export").textContent = "Primero exporta un MP4.";
      return;
    }
    if (miniaturaBaseImg && miniaturaDirty) {
      await guardarMiniaturaActual();
    }
    $("texto-export").textContent = "Enviando a Fábrica de Contenido…";
    const data = await api("/api/enviar-a-fabrica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mp4_path: ultimoMp4,
        miniatura_path: miniaturaActualPath,
        proyecto: clonarEstado(),
      }),
    });
    $("texto-export").textContent = data.mensaje || `En Fábrica: ${data.ruta}`;
    $("texto-export").className = "tip ok";
  }

  function dibujarMiniaturaCanvas() {
    const canvas = $("canvas-thumb-editor");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, w, h);

    if (miniaturaBaseImg) {
      const iw = miniaturaBaseImg.videoWidth || miniaturaBaseImg.width || w;
      const ih = miniaturaBaseImg.videoHeight || miniaturaBaseImg.height || h;
      const esc = Math.max(w / iw, h / ih);
      const dw = iw * esc;
      const dh = ih * esc;
      ctx.drawImage(miniaturaBaseImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = "#555";
      ctx.font = "600 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Sin miniatura aún", w / 2, h / 2);
      return;
    }

    const texto = ($("thumb-texto")?.value || "").trim();
    if (!texto) return;

    const fontSize = 44;
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxW = w - 64;
    const palabras = texto.split(/\s+/);
    const lineas = [];
    let actual = "";
    for (const pal of palabras) {
      const prueba = actual ? `${actual} ${pal}` : pal;
      if (ctx.measureText(prueba).width > maxW && actual) {
        lineas.push(actual);
        actual = pal;
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);

    const lineH = fontSize * 1.2;
    const totalH = lineas.length * lineH;
    const pos = $("thumb-pos")?.value || "top";
    let centerY = h * 0.18;
    if (pos === "center") centerY = h * 0.5;
    else if (pos === "bottom") centerY = h * 0.82;

    if ($("thumb-fondo")?.checked) {
      const padX = 24;
      const padY = 16;
      const maxLineW = Math.max(...lineas.map((l) => ctx.measureText(l).width));
      const boxW = Math.min(w - 32, maxLineW + padX * 2);
      const boxH = totalH + padY * 2;
      ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
      ctx.beginPath();
      ctx.roundRect((w - boxW) / 2, centerY - boxH / 2, boxW, boxH, 14);
      ctx.fill();
    }

    const startY = centerY - totalH / 2 + lineH / 2;
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = thumbColor;
    lineas.forEach((linea, idx) => {
      const y = startY + idx * lineH;
      ctx.strokeText(linea, w / 2, y);
      ctx.fillText(linea, w / 2, y);
    });
  }

  function capturarFotogramaActual() {
    const vid = $("video-final-preview");
    const estadoEl = $("thumb-estado");
    if (!vid || !vid.videoWidth) {
      if (estadoEl) estadoEl.textContent = "Espera a que cargue el video para capturar.";
      return;
    }
    const off = document.createElement("canvas");
    off.width = vid.videoWidth;
    off.height = vid.videoHeight;
    off.getContext("2d").drawImage(vid, 0, 0, off.width, off.height);
    miniaturaBaseImg = off;
    miniaturaDirty = true;
    dibujarMiniaturaCanvas();
    if (estadoEl) {
      estadoEl.textContent = "Fotograma capturado. Agrega un título si quieres y guarda.";
      estadoEl.className = "tip ok";
    }
  }

  function subirMiniaturaArchivo(file) {
    if (!file) return;
    const estadoEl = $("thumb-estado");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      miniaturaBaseImg = img;
      miniaturaDirty = true;
      dibujarMiniaturaCanvas();
      if (estadoEl) {
        estadoEl.textContent = `Imagen cargada: ${file.name}`;
        estadoEl.className = "tip ok";
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (estadoEl) {
        estadoEl.textContent = "No se pudo leer esa imagen.";
        estadoEl.className = "tip error";
      }
    };
    img.src = url;
  }

  async function guardarMiniaturaActual() {
    const canvas = $("canvas-thumb-editor");
    const estadoEl = $("thumb-estado");
    if (!canvas || !miniaturaBaseImg) {
      if (estadoEl) estadoEl.textContent = "Primero captura un fotograma o sube una imagen.";
      return null;
    }
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const res = await api("/api/miniatura/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_url: dataUrl, mp4_path: ultimoMp4 }),
      });
      miniaturaActualPath = res.miniatura_path;
      miniaturaDirty = false;
      if (estadoEl) {
        estadoEl.textContent = "Miniatura guardada y lista para enviar.";
        estadoEl.className = "tip ok";
      }
      return miniaturaActualPath;
    } catch (e) {
      if (estadoEl) {
        estadoEl.textContent = e.message;
        estadoEl.className = "tip error";
      }
      return null;
    }
  }

  function abrirModalPreviewFinal(jobId) {
    const modal = $("modal-preview-final");
    const vid = $("video-final-preview");
    const rutaEl = $("modal-final-ruta");
    if (!modal || !vid || !jobId) return;
    miniaturaActualPath = null;
    miniaturaBaseImg = null;
    miniaturaDirty = false;
    const estadoEl = $("thumb-estado");
    if (estadoEl) {
      estadoEl.textContent = 'Pausa el video y pulsa "Capturar fotograma" o sube una imagen.';
      estadoEl.className = "tip";
    }
    dibujarMiniaturaCanvas();
    vid.src = `/api/exportar/video/${encodeURIComponent(jobId)}?t=${Date.now()}`;
    if (rutaEl) rutaEl.textContent = ultimoMp4 ? `Archivo: ${ultimoMp4}` : "";
    modal.hidden = false;
    vid.play().catch(() => {});
  }

  function cerrarModalPreviewFinal() {
    const modal = $("modal-preview-final");
    const vid = $("video-final-preview");
    if (vid) {
      vid.pause();
      vid.removeAttribute("src");
    }
    if (modal) modal.hidden = true;
  }

  async function cancelarExport() {
    if (!jobActual) return;
    try {
      await api(`/api/exportar/cancelar/${jobActual}`, { method: "POST" });
      $("texto-export").textContent = "Exportación cancelada.";
      $("barra-progreso").style.width = "0%";
    } catch (e) {
      $("texto-export").textContent = e.message;
    } finally {
      cerrarSSE();
      setExportando(false);
      jobActual = null;
    }
  }

  function aplicarCamposAEstado() {
    estado.title = $("campo-titulo").value.trim() || "Mi ranking";
    estado.outputDir = $("campo-salida").value.trim();
    estado.music.volume = Number($("slider-musica").value) / 100;
    estado.sting.volume = Number($("slider-sting").value) / 100;
    estado.hook.enabled = $("hook-enabled").checked;
    estado.hook.seconds = Math.max(0.5, Math.min(2, Number($("hook-seconds").value) || 1.5));
    estado.hook.fromRankId = $("hook-clip").value || null;
  }

  async function comprobarSalud() {
    const badge = $("badge-servidor");
    try {
      const data = await api("/health");
      if (data.status === "ok") {
        badge.innerHTML = '<span class="dot-live"></span> Puerto 5002 activo';
      }
    } catch {
      badge.classList.remove("green");
      badge.textContent = "Sin servidor";
    }
  }

  function initEventos() {
    const zona = $("zona-soltar");
    const inputVideos = $("input-videos");

    zona.addEventListener("click", () => inputVideos.click());
    inputVideos.addEventListener("change", () => {
      subirVideos(inputVideos.files);
      inputVideos.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) => {
      zona.addEventListener(ev, (e) => {
        e.preventDefault();
        zona.classList.add("dragover");
      });
    });
    zona.addEventListener("dragleave", () => zona.classList.remove("dragover"));
    zona.addEventListener("drop", (e) => {
      e.preventDefault();
      zona.classList.remove("dragover");
      subirVideos(e.dataTransfer.files);
    });

    $("campo-titulo").addEventListener("input", () => {
      estado.title = $("campo-titulo").value;
      pintarChipsTitulo();
      programarGuardado();
      refrescarOverlay();
    });

    document.querySelectorAll("#grupo-presets .preset-btn[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        estado.preset = btn.dataset.preset;
        marcarPreset(estado.preset);
        programarGuardado();
        refrescarOverlay();
      });
    });

    document.querySelectorAll("#grupo-framing .frame-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        estado.framing = btn.dataset.framing;
        marcarFraming(estado.framing);
        programarGuardado();
      });
    });

    document.querySelectorAll("#grupo-accentos .accent-dot").forEach((btn) => {
      btn.addEventListener("click", () => {
        estado.accent = btn.dataset.color;
        marcarAccent(estado.accent);
        $("color-personalizado").value = normalizarHex(estado.accent);
        programarGuardado();
        refrescarOverlay();
      });
    });

    $("color-personalizado").addEventListener("input", (e) => {
      estado.accent = e.target.value;
      marcarAccent("");
      programarGuardado();
      refrescarOverlay();
    });

    $("slider-musica").addEventListener("input", () => {
      $("txt-musica-vol").textContent = $("slider-musica").value + "%";
      estado.music.volume = Number($("slider-musica").value) / 100;
      programarGuardado();
    });
    $("slider-sting").addEventListener("input", () => {
      $("txt-sting-vol").textContent = $("slider-sting").value + "%";
      estado.sting.volume = Number($("slider-sting").value) / 100;
      programarGuardado();
    });

    $("campo-salida").addEventListener("change", () => {
      estado.outputDir = $("campo-salida").value.trim();
      programarGuardado();
    });

    $("btn-musica").addEventListener("click", () => $("input-musica").click());
    $("input-musica").addEventListener("change", async () => {
      const file = $("input-musica").files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("archivos", file);
      fd.append("tipo", "music");
      try {
        const res = await fetch("/api/importar-audio", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "No pude subir la música");
        estado.music.path = data.path;
        $("nombre-musica").textContent = file.name;
        programarGuardado();
      } catch (e) {
        $("texto-export").textContent = e.message;
        $("texto-export").className = "tip error";
      }
      $("input-musica").value = "";
    });

    $("btn-shuffle").addEventListener("click", mezclarDeck);
    $("btn-clear-deck")?.addEventListener("click", vaciarDeck);

    $("hook-enabled").addEventListener("change", () => {
      estado.hook.enabled = $("hook-enabled").checked;
      programarGuardado();
    });
    $("hook-seconds").addEventListener("change", () => {
      estado.hook.seconds = Number($("hook-seconds").value) || 1.5;
      programarGuardado();
    });
    $("hook-clip").addEventListener("change", () => {
      estado.hook.fromRankId = $("hook-clip").value;
      programarGuardado();
    });

    $("btn-voz").addEventListener("click", () => $("input-voz").click());
    $("input-voz").addEventListener("change", async () => {
      const file = $("input-voz").files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("archivos", file);
      fd.append("tipo", "voiceover");
      try {
        const res = await fetch("/api/importar-audio", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "No pude subir la voz");
        estado.voiceover.path = data.path;
        $("nombre-voz").textContent = file.name;
        programarGuardado();
      } catch (e) {
        $("texto-export").textContent = e.message;
        $("texto-export").className = "tip error";
      }
      $("input-voz").value = "";
    });

    $("btn-marca").addEventListener("click", () => $("input-marca").click());
    $("input-marca").addEventListener("change", async () => {
      const file = $("input-marca").files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("archivos", file);
      fd.append("tipo", "watermark");
      try {
        const res = await fetch("/api/importar-imagen", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "No pude subir la imagen");
        estado.watermark.path = data.path;
        $("nombre-marca").textContent = file.name;
        programarGuardado();
      } catch (e) {
        $("texto-export").textContent = e.message;
        $("texto-export").className = "tip error";
      }
      $("input-marca").value = "";
    });

    $("btn-abrir-salida").addEventListener("click", async () => {
      const ruta = $("campo-salida").value.trim() || "output";
      try {
        await api("/api/abrir-carpeta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruta }),
        });
      } catch (e) {
        $("texto-export").textContent = e.message;
      }
    });

    $("btn-preview-full")?.addEventListener("click", () => iniciarExport("preview"));
    $("btn-exportar").addEventListener("click", () => iniciarExport(null));
    $("btn-babeldesk").addEventListener("click", () => iniciarExport("babeldesk"));
    $("btn-fabrica")?.addEventListener("click", () => iniciarExport("fabrica"));
    $("btn-cancelar").addEventListener("click", cancelarExport);
    $("btn-cerrar-modal")?.addEventListener("click", cerrarModalPreviewFinal);
    $("modal-preview-final")?.addEventListener("click", (e) => {
      if (e.target === $("modal-preview-final")) cerrarModalPreviewFinal();
    });
    $("modal-btn-carpeta")?.addEventListener("click", () => $("btn-abrir-salida")?.click());
    $("modal-btn-babeldesk")?.addEventListener("click", () => {
      cerrarModalPreviewFinal();
      void enviarInbox();
    });
    $("modal-btn-fabrica")?.addEventListener("click", async () => {
      cerrarModalPreviewFinal();
      try {
        await enviarFabrica();
      } catch (e) {
        $("texto-export").textContent = e.message;
        $("texto-export").className = "tip error";
      }
    });

    function reflejarTrimEnTarjeta() {
      const clip = estado.clips[indicePreview];
      const card = document.querySelector("#lista-clips .clip-card.active");
      if (!clip || !card) return;
      const inputs = card.querySelectorAll(".clip-trim input");
      if (inputs[0]) inputs[0].value = String(Math.round(clip.trimIn * 10) / 10);
      if (inputs[1]) inputs[1].value = String(Math.round(clip.trimOut * 10) / 10);
      const dur = card.querySelector(".clip-dur");
      if (dur) dur.textContent = ` (${duracionClip(clip).toFixed(1)} s)`;
      card.classList.toggle("trim-warn", duracionClip(clip) > 60);
      programarGuardado();
      actualizarResumen();
    }

    function marcarTrimDesdePreview(cual) {
      const clip = estado.clips[indicePreview];
      const video = $("video-preview");
      if (!clip || !video || !video.src) return;
      const t = Math.round((video.currentTime || 0) * 10) / 10;
      const tope = Number.isFinite(video.duration) ? video.duration : t + 5;
      if (cual === "in") {
        clip.trimIn = Math.max(0, Math.min(t, tope - 0.2));
        if (clip.trimOut <= clip.trimIn) clip.trimOut = Math.min(tope, clip.trimIn + 0.5);
      } else {
        clip.trimOut = Math.max(clip.trimIn + 0.2, Math.min(t, tope));
      }
      reflejarTrimEnTarjeta();
    }

    function nudgearFin(delta) {
      const clip = estado.clips[indicePreview];
      const video = $("video-preview");
      if (!clip) return;
      const tope = video && Number.isFinite(video.duration) ? video.duration : clip.trimOut + 30;
      clip.trimOut = Math.round(Math.max(clip.trimIn + 0.2, Math.min(tope, clip.trimOut + delta)) * 10) / 10;
      reflejarTrimEnTarjeta();
      if (video && video.currentTime > clip.trimOut) video.currentTime = clip.trimIn;
    }

    $("btn-trim-inicio")?.addEventListener("click", () => marcarTrimDesdePreview("in"));
    $("btn-trim-fin")?.addEventListener("click", () => marcarTrimDesdePreview("out"));
    $("btn-trim-menos")?.addEventListener("click", () => nudgearFin(-0.5));
    $("btn-trim-mas")?.addEventListener("click", () => nudgearFin(0.5));

    $("btn-capturar-frame")?.addEventListener("click", capturarFotogramaActual);
    $("btn-subir-thumb")?.addEventListener("click", () => $("input-thumb-file")?.click());
    $("input-thumb-file")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) subirMiniaturaArchivo(f);
      e.target.value = "";
    });
    $("thumb-texto")?.addEventListener("input", () => {
      miniaturaDirty = Boolean(miniaturaBaseImg);
      dibujarMiniaturaCanvas();
    });
    $("thumb-pos")?.addEventListener("change", () => {
      miniaturaDirty = Boolean(miniaturaBaseImg);
      dibujarMiniaturaCanvas();
    });
    $("thumb-fondo")?.addEventListener("change", () => {
      miniaturaDirty = Boolean(miniaturaBaseImg);
      dibujarMiniaturaCanvas();
    });
    $("thumb-colores")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".thumb-swatch");
      if (!btn) return;
      thumbColor = btn.dataset.color || "#FFFFFF";
      $("thumb-colores")?.querySelectorAll(".thumb-swatch").forEach((b) => {
        b.classList.toggle("activo", b === btn);
      });
      miniaturaDirty = Boolean(miniaturaBaseImg);
      dibujarMiniaturaCanvas();
    });
    $("btn-guardar-thumb")?.addEventListener("click", guardarMiniaturaActual);

    $("btn-play").addEventListener("click", togglePlay);
    $("preview-seek")?.addEventListener("input", () => {
      const video = $("video-preview");
      if (!video || !video.src) return;
      video.currentTime = Number($("preview-seek").value) || 0;
      actualizarBarraSeek(video);
    });
    $("btn-anterior").addEventListener("click", () => cambiarPuesto(-1));
    $("btn-siguiente").addEventListener("click", () => cambiarPuesto(1));
    $("btn-mute").addEventListener("click", () => {
      const ahora = leerAudioPreview();
      const silenciar = !ahora.mute;
      localStorage.setItem(CLAVE_MUTE, silenciar ? "1" : "0");
      if (!silenciar && ahora.vol === 0) localStorage.setItem(CLAVE_VOL, "80");
      pintarControlesAudio();
      aplicarAudioPreview($("video-preview"));
    });
    $("preview-volume").addEventListener("input", () => {
      const vol = Number($("preview-volume").value);
      localStorage.setItem(CLAVE_VOL, String(vol));
      localStorage.setItem(CLAVE_MUTE, vol === 0 ? "1" : "0");
      pintarControlesAudio();
      aplicarAudioPreview($("video-preview"));
    });
    pintarControlesAudio();
    aplicarAudioPreview($("video-preview"));

    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") cambiarPuesto(-1);
      else if (e.code === "ArrowRight") cambiarPuesto(1);
    });
  }

  comprobarSalud();
  initEventos();
  cargarInicial();
})();
