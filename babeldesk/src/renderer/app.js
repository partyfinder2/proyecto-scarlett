const api = window.babeldesk;
/** Asignada por initCutter: refresca la lista y opcionalmente elige un video. */
let cutterSelectSource = null;
const BABELDESK_LAST_DOWNLOAD_URL_KEY = "babeldesk:lastDownloadUrl";

const CAPTION_LIMITS = {
  instagram: 2200,
  tiktok: 2200,
  facebook_page: 5000,
  facebook_group: 5000,
};

function trimCaptionToLimit(caption, limit) {
  if (caption.length <= limit) return caption;
  let cut = caption.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(limit * 0.6)) cut = cut.slice(0, lastSpace);
  return cut.trimEnd();
}

function strictestLimitForChecked(checked) {
  const nets = checked
    .map((cb) => accountsCache.find((a) => a.id === cb.value)?.network)
    .filter(Boolean);
  if (!nets.length) return 63206;
  return Math.min(...nets.map((n) => CAPTION_LIMITS[n] ?? 63206));
}

const NETWORK_LABELS = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook_page: "Facebook Page",
  facebook_group: "Grupo FB",
};

const CONNECTION_STATUS_LABELS = {
  disconnected: "Sin conectar",
  connected: "Conectada",
  expiring: "Por vencer",
  invalid: "Inválida",
  assist_only: "Solo assist",
};

let accountsCache = [];

function $(sel) {
  return document.querySelector(sel);
}

function statusClass(s) {
  return `status-${s}`;
}

function fmtTime(unix) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString("es-MX");
}

function toFileUrl(p) {
  if (!p) return "";
  const encoded = encodeURI(p.replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F");
  return `file:///${encoded}`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function refreshInfo() {
  const info = await api.invoke("app:getInfo");
  $("#version").textContent = `v${info.version}`;
  const docLink = $("#link-empezar-aqui");
  if (docLink) {
    docLink.onclick = (e) => {
      e.preventDefault();
      void api.invoke("app:openDoc", "docs/EMPEZAR_AQUI.md");
    };
  }
}

function applySelectedMediaDefaults(form, sel) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const titleInput = form.querySelector('[name="title"]');
  const captionInput = form.querySelector('[name="caption"]');
  const suggestedTitle = opt.dataset.title || "";
  const suggestedCaption = opt.dataset.caption || "";

  if (titleInput && suggestedTitle && (!titleInput.value.trim() || titleInput.dataset.autofilled === "1")) {
    titleInput.value = suggestedTitle;
    titleInput.dataset.autofilled = "1";
  }
  if (captionInput && suggestedCaption && (!captionInput.value.trim() || captionInput.dataset.autofilled === "1")) {
    captionInput.value = suggestedCaption;
    captionInput.dataset.autofilled = "1";
  }
}

function bindComposerInputs() {
  const form = $("#post-form");
  const titleInput = form.querySelector('[name="title"]');
  const captionInput = form.querySelector('[name="caption"]');
  const mediaSel = form.querySelector("#media-select");
  if (titleInput) {
    titleInput.addEventListener("input", () => {
      delete titleInput.dataset.autofilled;
    });
  }
  captionInput.addEventListener("input", () => {
    delete captionInput.dataset.autofilled;
    void updateComposerPreview();
  });
  mediaSel.addEventListener("change", () => {
    applySelectedMediaDefaults(form, mediaSel);
    void updateComposerPreview();
  });
}

async function updateComposerPreview() {
  const caption = $("#post-form").querySelector('[name="caption"]').value;
  const mediaId = $("#media-select").value;
  const checked = [...document.querySelectorAll('input[name="accountIds"]:checked')];
  const grid = $("#preview-by-network");
  const errEl = $("#preview-errors");
  const btn = $("#enqueue-btn");

  if (checked.length === 0) {
    grid.innerHTML = "<p class='hint'>Elige destinos para ver preview por red.</p>";
    errEl.textContent = "";
    btn.disabled = true;
    return;
  }

  let mediaPath = null;
  if (mediaId) mediaPath = await api.invoke("media:getPath", mediaId);

  const warnings = [];
  grid.innerHTML = "";

  for (const cb of checked) {
    const acc = accountsCache.find((a) => a.id === cb.value);
    if (!acc) continue;
    const net = acc.network;
    const limit = CAPTION_LIMITS[net] ?? 63206;
    const over = Math.max(0, caption.length - limit);
    const label = NETWORK_LABELS[net] || net;

    const card = document.createElement("div");
    card.className = "preview-card";

    let videoHtml = "";
    if (
      mediaPath &&
      /\.(mp4|mov|webm)$/i.test(mediaPath) &&
      (net === "instagram" || net === "tiktok")
    ) {
      videoHtml = `<div class="preview-frame-916"><video muted playsinline src="${toFileUrl(mediaPath)}"></video></div>`;
    }

    const warnLine = over ? `<div class="warn-line">sobran ${over} en ${label}</div>` : "";

    card.innerHTML = `
      <h4>${label}</h4>
      <div class="${over ? "bad" : "ok"}">${caption.length} / ${limit}${over ? " · aviso" : " · OK"}</div>
      ${warnLine}
      <div>${escapeHtml(caption.slice(0, 160))}${caption.length > 160 ? "…" : ""}</div>
      ${videoHtml}`;
    grid.appendChild(card);

    if (over) warnings.push(`sobran ${over} en ${label}`);
  }

  errEl.textContent = warnings.join(" · ");
  const trimBtn = $("#btn-trim-caption");
  if (trimBtn) {
    if (warnings.length) trimBtn.classList.remove("hidden");
    else trimBtn.classList.add("hidden");
  }
  btn.disabled = false;
}

function accountStatusBadge(status) {
  const map = { connected: "🟢", expiring: "🟡", invalid: "🔴", disconnected: "⚪", assist_only: "🔵" };
  return map[status] || "⚪";
}

function showAccountProbeToast(text, ok) {
  const el = $("#account-probe-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "ok", "err");
  el.classList.add(ok ? "ok" : "err");
  clearTimeout(showAccountProbeToast._t);
  showAccountProbeToast._t = setTimeout(() => el.classList.add("hidden"), 8000);
}

async function refreshMetaOAuthUi() {
  const st = await api.invoke("meta:oauthStatus");
  const btn = $("#meta-connect-btn");
  const reconnect = $("#meta-reconnect-btn");
  if (btn) {
    btn.disabled = !st.configured;
    btn.title = st.configured
      ? `OAuth Meta · redirect ${st.redirectUri}`
      : `Configura en .env: ${(st.missing || []).join(", ")}`;
  }
  if (reconnect) reconnect.classList.toggle("hidden", !st.configured);

  const ttSt = await api.invoke("tiktok:oauthStatus");
  const ttBtn = $("#tiktok-connect-btn");
  if (ttBtn) {
    ttBtn.disabled = !ttSt.configured;
    ttBtn.title = ttSt.configured
      ? `OAuth TikTok · ${ttSt.redirectUri}`
      : `Faltan: ${(ttSt.missing || []).join(", ")}`;
  }
}

async function runTikTokOAuthFlow() {
  await refreshMetaOAuthUi();
  const ttBtn = $("#tiktok-connect-btn");
  if (ttBtn?.disabled) {
    alert("Configura TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en .env");
    return;
  }
  showAccountProbeToast("Abriendo TikTok en el navegador…", true);
  const start = await api.invoke("tiktok:oauthStart");
  if (!start.ok) {
    showAccountProbeToast(start.error || "OAuth TikTok falló", false);
    return;
  }
  const conn = await api.invoke("tiktok:oauthConnect");
  if (!conn.ok) {
    showAccountProbeToast(conn.error || "No se guardó TikTok", false);
    return;
  }
  showAccountProbeToast(
    `${conn.audited ? "TikTok conectado (audit)" : "TikTok conectado (sin audit)"} · ${conn.hint || ""}`,
    true
  );
  await refreshAccounts();
}

function closeMetaPagePicker(cancelSession) {
  $("#meta-page-picker")?.classList.add("hidden");
  if (cancelSession) void api.invoke("meta:oauthCancel");
}

function openMetaPagePicker(pages) {
  const modal = $("#meta-page-picker");
  const box = $("#meta-page-options");
  if (!modal || !box) return;
  box.innerHTML = "";
  pages.forEach((p, i) => {
    const label = document.createElement("label");
    label.className = "meta-page-option";
    const igLine = p.igUserId
      ? `IG: ${p.igUsername ? `@${p.igUsername}` : p.igUserId}`
      : "Sin Instagram ligado";
    const pub = p.canPublish ? "CREATE_CONTENT OK" : "Revisa permisos de publicación";
    label.innerHTML = `<input type="radio" name="metaPagePick" value="${escapeHtml(p.id)}" ${
      i === 0 ? "checked" : ""
    } /><div><strong>${escapeHtml(p.name)}</strong><small>ID ${escapeHtml(p.id)} · ${escapeHtml(
      igLine
    )} · ${escapeHtml(pub)}</small></div>`;
    box.appendChild(label);
  });
  modal.classList.remove("hidden");
}

async function runMetaOAuthFlow() {
  await refreshMetaOAuthUi();
  const btn = $("#meta-connect-btn");
  if (btn?.disabled) {
    alert("Faltan META_APP_ID y META_APP_SECRET en .env (copia .env.example).");
    return;
  }
  showAccountProbeToast("Abriendo Meta en el navegador… completa el login allí.", true);
  const r = await api.invoke("meta:oauthStart");
  if (!r.ok) {
    showAccountProbeToast(r.error || "OAuth falló", false);
    return;
  }
  openMetaPagePicker(r.pages || []);
}

async function probeAccountById(id) {
  showAccountProbeToast("Probando conexión…", true);
  const r = await api.invoke("accounts:probe", id);
  if (r.ok) {
    const extra = [r.pageName && `Page: ${r.pageName}`, r.igUsername && `@${r.igUsername}`]
      .filter(Boolean)
      .join(" · ");
    showAccountProbeToast(`OK · ${CONNECTION_STATUS_LABELS[r.connectionStatus] || r.connectionStatus}${extra ? ` · ${extra}` : ""}`, true);
  } else {
    showAccountProbeToast(r.error || "Probe falló", false);
  }
  await refreshAccounts();
}

async function refreshAccounts() {
  const rows = await api.invoke("accounts:list");
  accountsCache = rows;
  const list = $("#accounts-list");
  list.innerHTML = "";
  if (rows.length === 0) {
    list.innerHTML = '<p class="hint">Aún no hay cuentas. Usa «Pegar token (avanzado)» para Page/IG.</p>';
  }
  for (const a of rows) {
    const card = document.createElement("article");
    card.className = `account-card account-status-${a.connection_status}`;
    const netLabel = NETWORK_LABELS[a.network] || a.network;
    const statusLabel = CONNECTION_STATUS_LABELS[a.connection_status] || a.connection_status;
    const expiry =
      a.token_expires_at && a.token_expires_at > 0
        ? `Token (debug): ${fmtTime(a.token_expires_at)}`
        : a.hasToken && (a.network === "facebook_page" || a.network === "instagram")
          ? "Page token sin expiry propia en Graph"
          : "";
    const metaLines = [
      a.page_name ? `Page: ${a.page_name}` : "",
      a.ig_username ? `IG: @${a.ig_username}` : "",
      a.external_id ? `ID: ${a.external_id}` : "",
      a.last_probe_at ? `Última prueba: ${fmtTime(a.last_probe_at)}` : "",
      a.last_probe_error ? `Error: ${a.last_probe_error}` : "",
      expiry,
    ].filter(Boolean);

    card.innerHTML = `
      <div class="account-card-head">
        <span class="account-badge">${accountStatusBadge(a.connection_status)}</span>
        <strong>${escapeHtml(a.display_name || netLabel)}</strong>
        <span class="pill account-net-pill">${escapeHtml(netLabel)}</span>
      </div>
      <div class="account-status-line">${escapeHtml(statusLabel)}</div>
      <ul class="account-meta">${metaLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
      <div class="account-card-actions"></div>
    `;

    const actions = card.querySelector(".account-card-actions");
    const btnProbe = document.createElement("button");
    btnProbe.type = "button";
    btnProbe.className = "btn-secondary";
    btnProbe.textContent = "Probar";
    btnProbe.onclick = () => void probeAccountById(a.id);
    actions.appendChild(btnProbe);

    if (a.network === "tiktok") {
      const btnTt = document.createElement("button");
      btnTt.type = "button";
      btnTt.className = "btn-secondary";
      btnTt.textContent = "Reconectar TikTok";
      btnTt.onclick = () => void runTikTokOAuthFlow();
      actions.appendChild(btnTt);
    }

    if (a.network === "facebook_page" || a.network === "instagram") {
      const btnRe = document.createElement("button");
      btnRe.type = "button";
      btnRe.className = "btn-secondary";
      btnRe.textContent = "Reconectar";
      btnRe.title = "OAuth Meta (renueva token)";
      btnRe.onclick = () => void runMetaOAuthFlow();
      actions.appendChild(btnRe);

      const btnDisc = document.createElement("button");
      btnDisc.type = "button";
      btnDisc.className = "btn-secondary";
      btnDisc.textContent = "Desconectar";
      btnDisc.onclick = async () => {
        if (!confirm(`¿Quitar token de «${a.display_name}»? La fila de cuenta se conserva.`)) return;
        await api.invoke("accounts:disconnect", a.id);
        await refreshAccounts();
      };
      actions.appendChild(btnDisc);
    }

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.textContent = "Eliminar";
    btnDel.onclick = async () => {
      if (!confirm(`¿Eliminar cuenta «${a.display_name}»? No borra posts ya encolados.`)) return;
      await api.invoke("accounts:delete", a.id);
      await refreshAccounts();
    };
    actions.appendChild(btnDel);

    list.appendChild(card);
  }

  const box = $("#account-checkboxes");
  box.innerHTML = "<p>Destinos:</p>";
  for (const a of rows) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "accountIds";
    input.value = a.id;
    if (a.connection_status === "invalid" || a.connection_status === "disconnected") {
      input.title = "Cuenta sin token válido — revisa Mis Redes";
    }
    input.addEventListener("change", () => void updateComposerPreview());
    label.appendChild(input);
    const warn =
      a.connection_status === "invalid" || (a.connection_status === "disconnected" && a.network.includes("facebook"))
        ? " ⚠"
        : "";
    label.append(` ${a.display_name} (${a.network})${warn}`);
    box.appendChild(label);
  }
  await updateComposerPreview();
}

let lastMediaSignature = null;

async function refreshMedia() {
  const rows = (await api.invoke("media:list")) || [];
  const signature = rows.map((m) => `${m.id}:${m.path}:${m.title || ""}:${m.caption || ""}`).join("|");
  if (signature === lastMediaSignature) return;
  lastMediaSignature = signature;

  const grid = $("#media-list");
  grid.innerHTML = "";
  const total = rows.length;

  if (total === 0) {
    grid.innerHTML = '<p class="hint">No hay videos en Inbox aún.</p>';
  } else {
    rows.forEach((m, idx) => {
      const fileName = m.path.split(/[/\\]/).pop();
      const card = document.createElement("div");
      card.className = "media-card";

      const num = document.createElement("div");
      num.className = "media-card-num";
      num.textContent = `#${total - idx}`;
      if (idx === 0) num.textContent += " · más reciente";

      let preview;
      if (m.kind === "video") {
        preview = document.createElement("video");
        preview.muted = true;
        preview.controls = true;
        preview.preload = "metadata";
      } else {
        preview = document.createElement("img");
        preview.alt = fileName;
        preview.loading = "lazy";
      }
      preview.className = "media-card-preview";
      preview.src = toFileUrl(m.path);

      const nameEl = document.createElement("div");
      nameEl.className = "media-card-name";
      nameEl.textContent = m.title ? `${m.title} · ${fileName}` : fileName;
      nameEl.title = m.title ? `${m.title} (${fileName})` : fileName;

      const actions = document.createElement("div");
      actions.className = "media-card-actions";
      const secondary = document.createElement("div");
      secondary.className = "media-card-actions secondary";

      const btnPost = document.createElement("button");
      btnPost.type = "button";
      btnPost.className = "btn-flow";
      btnPost.textContent = "📝 Crear post";
      btnPost.title = "Abre Crear Post con este video ya elegido";
      btnPost.addEventListener("click", () => {
        goToTab("composer");
        const sel = $("#media-select");
        sel.value = m.id;
        sel.dispatchEvent(new Event("change"));
        $("#post-form").querySelector('[name="title"]')?.focus();
      });

      let btnCut = null;
      if (m.kind === "video") {
        btnCut = document.createElement("button");
        btnCut.type = "button";
        btnCut.className = "btn-flow";
        btnCut.textContent = "✂️ Cortar";
        btnCut.title = "Abre Cortar con este video ya elegido";
        btnCut.addEventListener("click", () => {
          goToTab("cortar");
          void cutterSelectSource?.(m.path);
        });
      }

      const btnOpen = document.createElement("button");
      btnOpen.type = "button";
      btnOpen.textContent = "▶";
      btnOpen.title = "Abrir en el reproductor de Windows";
      btnOpen.addEventListener("click", () => void api.invoke("media:open", m.id));

      const btnFolder = document.createElement("button");
      btnFolder.type = "button";
      btnFolder.textContent = "📂";
      btnFolder.title = "Ver en carpeta";
      btnFolder.addEventListener("click", () => void api.invoke("media:showInFolder", m.id));

      if (m.kind === "video") {
        const btnWm = document.createElement("button");
        btnWm.type = "button";
        btnWm.textContent = "💧";
        btnWm.title = "Quitar marca de agua — modo Máximo (IA + ffmpeg)";
        btnWm.addEventListener("click", async () => {
          const netHint = (fileName.split("-")[0] || "").toLowerCase();
          btnWm.disabled = true;
          const r = await api.invoke("watermark:remove", {
            mediaId: m.id,
            preset: "auto",
            networkHint: netHint,
            mode: "max",
          });
          btnWm.disabled = false;
          if (r.ok) {
            alert("Marca de agua procesada. Reproduce el video para revisar.");
            lastMediaSignature = null;
            await refreshMedia();
          } else {
            alert(r.error || "No se pudo procesar.");
          }
        });
        actions.appendChild(btnWm);
      }

      const btnCopy = document.createElement("button");
      btnCopy.type = "button";
      btnCopy.textContent = "💾";
      btnCopy.title = "Copiar a Descargas";
      btnCopy.addEventListener("click", async () => {
        const ok = await api.invoke("media:copyToDownloads", m.id);
        if (ok) {
          alert(`¡El video '${fileName}' se guardó en tu carpeta de Descargas!`);
        }
      });

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "btn-danger";
      btnDelete.textContent = "🗑";
      btnDelete.title = "Quita de Mis Videos y borra el archivo del disco";
      btnDelete.addEventListener("click", async () => {
        const ok = confirm(
          `¿Borrar "${fileName}"?\n\nSe elimina de esta lista y del archivo en disco (Descargas o Inbox).`
        );
        if (!ok) return;
        const result = await api.invoke("media:delete", m.id);
        if (result?.ok) {
          await refreshMedia();
        } else {
          alert(result?.error || "No se pudo borrar.");
        }
      });

      if (btnCut) actions.appendChild(btnCut);
      actions.appendChild(btnPost);
      secondary.append(btnOpen, btnFolder, btnCopy, btnDelete);
      card.append(num, preview, nameEl, actions, secondary);
      grid.appendChild(card);
    });
  }

  const sel = $("#media-select");
  const prevSelected = sel.value;
  sel.innerHTML = '<option value="">Sin media</option>';
  rows.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    const baseName = m.path.split(/[/\\]/).pop();
    opt.textContent = m.title ? `#${total - idx} · ${m.title}` : `#${total - idx} · ${baseName}`;
    if (m.title) opt.dataset.title = m.title;
    if (m.caption) opt.dataset.caption = m.caption;
    sel.appendChild(opt);
  });
  if (prevSelected && rows.some((m) => m.id === prevSelected)) sel.value = prevSelected;
}

async function refreshTargets() {
  const rows = await api.invoke("targets:list");
  const tbody = $("#targets-table tbody");
  tbody.innerHTML = "";
  for (const t of rows) {
    const tr = document.createElement("tr");
    const actions = [];
    if (t.status === "failed" || t.status === "queued") {
      actions.push(`<button data-retry="${t.id}">Reintentar</button>`);
    }
    if (t.network === "facebook_group" || t.network === "tiktok") {
      actions.push(`<button data-assist="${t.id}">Abrir destino</button>`);
    }
    actions.push(`<button data-skip="${t.id}">Saltar</button>`);
    tr.innerHTML = `
      <td class="${statusClass(t.status)}">${t.status}</td>
      <td>${t.network}</td>
      <td>${t.level}</td>
      <td>${fmtTime(t.scheduled_at)}</td>
      <td>${t.error || ""}</td>
      <td>${actions.join(" ")}</td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("[data-retry]").forEach((btn) => {
    btn.onclick = async () => {
      await api.invoke("targets:retry", btn.dataset.retry);
      refreshTargets();
      refreshHistory();
    };
  });
  tbody.querySelectorAll("[data-assist]").forEach((btn) => {
    btn.onclick = async () => {
      await api.invoke("targets:assist", btn.dataset.assist);
      refreshTargets();
    };
  });
  tbody.querySelectorAll("[data-skip]").forEach((btn) => {
    btn.onclick = async () => {
      await api.invoke("targets:skip", btn.dataset.skip);
      refreshTargets();
      refreshHistory();
    };
  });
}

async function refreshHistory() {
  const network = $("#hist-filter-network").value || undefined;
  const status = $("#hist-filter-status").value || undefined;
  const rows = await api.invoke("history:list", { network, status });
  const tbody = $("#history-table tbody");
  tbody.innerHTML = "";
  for (const h of rows) {
    const tr = document.createElement("tr");
    const cap = (h.caption_default || h.title || "").slice(0, 80);
    const when = h.status_since || h.scheduled_at;
    const retry =
      h.status === "failed" || h.status === "queued"
        ? `<button data-hretry="${h.id}">Reintentar</button>`
        : "";
    tr.innerHTML = `
      <td>${fmtTime(when)}</td>
      <td>${h.network}</td>
      <td>${escapeHtml(cap)}</td>
      <td class="${statusClass(h.status)}">${h.status}</td>
      <td>${escapeHtml(h.error || "")}</td>
      <td>${retry}</td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("[data-hretry]").forEach((btn) => {
    btn.onclick = async () => {
      await api.invoke("targets:retry", btn.dataset.hretry);
      refreshTargets();
      refreshHistory();
    };
  });
}

async function refreshGroups() {
  const rows = await api.invoke("groups:list");
  $("#groups-list").innerHTML = rows.map((g) => `<li>${g.name || ""} · ${g.url}</li>`).join("") || "<li>Sin grupos</li>";
}

async function refreshLogs() {
  const rows = await api.invoke("logs:tail");
  $("#logs-out").textContent = rows
    .map((l) => `[${fmtTime(l.at)}] ${l.level}: ${l.message}`)
    .reverse()
    .join("\n");
}

function resolveOpenRouterModelFromForm() {
  const custom = $("#or-model-custom").value.trim();
  if (custom) return custom;
  return $("#or-model-preset").value;
}

async function refreshOpenRouterSettings() {
  const s = await api.invoke("settings:openrouter:get");
  const preset = $("#or-model-preset");
  preset.innerHTML = "";
  for (const m of s.suggestedModels) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    preset.appendChild(opt);
  }
  const customEl = $("#or-model-custom");
  if (s.suggestedModels.includes(s.model)) {
    preset.value = s.model;
    customEl.value = "";
  } else {
    preset.value = s.suggestedModels[0];
    customEl.value = s.model;
  }
  const keyStatus = $("#or-key-status");
  const keyInput = $("#or-api-key");
  if (s.apiKeyStatus === "saved") {
    keyStatus.textContent = "Clave guardada";
    keyStatus.className = "pill ok";
    keyInput.placeholder = "Escribe solo si quieres cambiarla";
  } else {
    keyStatus.textContent = "Clave vacía";
    keyStatus.className = "pill err";
    keyInput.placeholder = "Pega tu API key de OpenRouter";
  }
  keyInput.value = "";
  $("#or-test-result").textContent = "";
  $("#or-test-result").className = "settings-result";
}

async function saveOpenRouterSettings() {
  const apiKey = $("#or-api-key").value;
  const model = resolveOpenRouterModelFromForm();
  const payload = { model };
  if (apiKey.trim()) payload.apiKey = apiKey.trim();
  await api.invoke("settings:openrouter:save", payload);
  await refreshOpenRouterSettings();
  $("#or-test-result").textContent = "Ajustes guardados.";
  $("#or-test-result").className = "settings-result ok";
}

async function testOpenRouterConnection() {
  const resultEl = $("#or-test-result");
  resultEl.textContent = "Probando…";
  resultEl.className = "settings-result";
  const apiKey = $("#or-api-key").value.trim();
  const model = resolveOpenRouterModelFromForm();
  const payload = { model };
  if (apiKey) payload.apiKey = apiKey;
  const r = await api.invoke("settings:openrouter:test", payload);
  if (r.ok) {
    resultEl.textContent = `OK · ${r.snippet}`;
    resultEl.className = "settings-result ok";
  } else {
    resultEl.textContent = r.error;
    resultEl.className = "settings-result err";
  }
}

function goToTab(tab) {
  document.querySelectorAll("nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  $(`#tab-${tab}`).classList.add("active");
  if (tab === "historial") void refreshHistory();
  if (tab === "cuentas") {
    void refreshMetaOAuthUi();
    void refreshAccounts();
  }
  if (tab === "ajustes") void refreshOpenRouterSettings();
  if (tab === "cortar") void cutterSelectSource?.();
  window.scrollTo(0, 0);
}

document.querySelectorAll("nav button").forEach((btn) => {
  btn.onclick = () => goToTab(btn.dataset.tab);
});

$("#or-save").onclick = () => void saveOpenRouterSettings();
$("#or-test").onclick = () => void testOpenRouterConnection();

const accountForm = $("#account-form");
const toggleAdvancedAccount = $("#toggle-advanced-account");
if (toggleAdvancedAccount && accountForm) {
  toggleAdvancedAccount.onclick = () => {
    accountForm.classList.toggle("hidden");
    toggleAdvancedAccount.textContent = accountForm.classList.contains("hidden")
      ? "Pegar token (avanzado)"
      : "Ocultar formulario";
  };
}

const metaConnectBtn = $("#meta-connect-btn");
if (metaConnectBtn) metaConnectBtn.onclick = () => void runMetaOAuthFlow();
const metaReconnectBtn = $("#meta-reconnect-btn");
if (metaReconnectBtn) metaReconnectBtn.onclick = () => void runMetaOAuthFlow();
const tiktokConnectBtn = $("#tiktok-connect-btn");
if (tiktokConnectBtn) tiktokConnectBtn.onclick = () => void runTikTokOAuthFlow();
const metaPageCancel = $("#meta-page-cancel");
if (metaPageCancel) metaPageCancel.onclick = () => closeMetaPagePicker(true);
const metaPageSave = $("#meta-page-save");
if (metaPageSave) {
  metaPageSave.onclick = async () => {
    const picked = document.querySelector('input[name="metaPagePick"]:checked');
    if (!picked) {
      alert("Elige una Page.");
      return;
    }
    const includeIg = $("#meta-include-ig")?.checked ?? true;
    showAccountProbeToast("Guardando tokens cifrados…", true);
    const r = await api.invoke("meta:oauthConnect", {
      pageId: picked.value,
      includeInstagram: includeIg,
    });
    closeMetaPagePicker(false);
    if (!r.ok) {
      showAccountProbeToast(r.error || "No se pudo guardar", false);
      return;
    }
    showAccountProbeToast("Page conectada. Probando Graph…", true);
    await refreshAccounts();
  };
}

$("#account-form").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const token = String(fd.get("tokenPlain") || "").trim();
  const network = fd.get("network");
  if ((network === "facebook_page" || network === "instagram") && !token) {
    alert("Page/IG necesitan token en el formulario avanzado (OAuth llega en P1).");
    return;
  }
  await api.invoke("accounts:save", {
    network,
    displayName: fd.get("displayName"),
    externalId: fd.get("externalId"),
    tokenPlain: token || undefined,
  });
  e.target.reset();
  showAccountProbeToast("Cuenta guardada.", true);
  await refreshAccounts();
};

$("#post-form").onsubmit = async (e) => {
  e.preventDefault();
  if ($("#enqueue-btn").disabled) return;
  const fd = new FormData(e.target);
  const accountIds = [...document.querySelectorAll('input[name="accountIds"]:checked')].map((el) => el.value);
  if (accountIds.length === 0) {
    alert("Elige al menos un destino");
    return;
  }
  const scheduledRaw = fd.get("scheduledAt");
  let scheduledAt;
  if (scheduledRaw) {
    const ms = new Date(scheduledRaw).getTime();
    if (Number.isNaN(ms)) {
      alert("Fecha de publicación inválida.");
      return;
    }
    if (ms < Date.now() - 60_000) {
      alert("Esa fecha ya pasó. Déjalo vacío para publicar ahora o elige una hora futura.");
      return;
    }
    scheduledAt = Math.floor(ms / 1000);
  }
  const result = await api.invoke("posts:create", {
    title: fd.get("title"),
    mediaId: fd.get("mediaId") || undefined,
    caption: fd.get("caption"),
    linkUrl: fd.get("linkUrl") || undefined,
    level: fd.get("level"),
    accountIds,
    scheduledAt,
  });
  if (result.skipped?.length) {
    alert(result.skipped.join("\n"));
  }
  e.target.reset();
  delete e.target.querySelector('[name="title"]')?.dataset.autofilled;
  delete e.target.querySelector('[name="caption"]')?.dataset.autofilled;
  refreshTargets();
  refreshHistory();
  await updateComposerPreview();
};

$("#group-form").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api.invoke("groups:save", { name: fd.get("name"), url: fd.get("url") });
  e.target.reset();
  refreshGroups();
};

$("#assist-groups-btn").onclick = async () => {
  const caption = prompt("Caption para los grupos:");
  if (!caption) return;
  const r = await api.invoke("groups:assistNext", { caption, limit: 3 });
  alert(r.error || `Abiertos: ${r.opened}`);
};

$("#copy-btn").onclick = async () => {
  const topic = $("#copy-topic").value;
  const network = $("#copy-network").value;
  const level = document.querySelector('#post-form select[name="level"]').value;
  try {
    const out = await api.invoke("copy:generate", { topic, network, level });
    $("#copy-out").textContent = JSON.stringify(out, null, 2);
  } catch (err) {
    $("#copy-out").textContent = String(err);
  }
};

function renderPvVariantCards(variants) {
  const grid = $("#copy-variant-cards");
  grid.innerHTML = "";
  variants.forEach((v, i) => {
    const card = document.createElement("div");
    card.className = "preview-card";
    card.innerHTML = `
      <h4>Variante ${i + 1}</h4>
      <pre class="variant-caption">${escapeHtml(v.caption)}</pre>
      <div class="copy-variant-actions">
        <button type="button" data-use-variant="${i}">Usar esta</button>
      </div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll("[data-use-variant]").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.useVariant);
      const cap = variants[idx]?.caption;
      if (!cap) return;
      $("#post-form").querySelector('[name="caption"]').value = cap;
      void updateComposerPreview();
    };
  });
}

$("#copy-pv-btn").onclick = async () => {
  const topic = $("#copy-topic").value.trim() || $("#post-form").querySelector('[name="title"]').value.trim();
  const statusEl = $("#copy-pv-status");
  const level = document.querySelector('#post-form select[name="level"]').value;
  if (!topic) {
    statusEl.textContent = "Escribe un tema en «Tema del clip» o título interno.";
    return;
  }
  statusEl.textContent = "Generando 3 variantes PV Tourist EN…";
  try {
    const out = await api.invoke("copy:pvTourist", { topic, level });
    statusEl.textContent = `Listo (${out.model}). Elige «Usar esta» — editable antes de encolar.`;
    renderPvVariantCards(out.variants);
  } catch (err) {
    statusEl.textContent = String(err);
    $("#copy-variant-cards").innerHTML = "";
  }
};

$("#btn-trim-caption")?.addEventListener("click", () => {
  const checked = [...document.querySelectorAll('input[name="accountIds"]:checked')];
  const ta = $("#post-form").querySelector('[name="caption"]');
  const limit = strictestLimitForChecked(checked);
  ta.value = trimCaptionToLimit(ta.value, limit);
  void updateComposerPreview();
});

async function initTanda13Composer() {
  const hookInput = $("#hook-input");
  const hookCounter = $("#hook-counter");
  if (hookInput && hookCounter) {
    hookInput.addEventListener("input", () => {
      hookCounter.textContent = `${hookInput.value.length} / 42`;
    });
  }

  try {
    const { available } = await api.invoke("overlay:checkFfmpeg");
    if (!available) {
      $("#ffmpeg-warning")?.classList.remove("hidden");
      const btn = $("#btn-export-reel");
      if (btn) btn.disabled = true;
    }
  } catch {
    /* dev sin preload */
  }

  $("#btn-export-reel")?.addEventListener("click", async () => {
    const statusEl = $("#export-status");
    const btn = $("#btn-export-reel");
    const mediaId = $("#media-select").value;
    if (!mediaId) {
      statusEl.textContent = "Elige un video en el selector de media arriba.";
      return;
    }
    const inFile = await api.invoke("media:getPath", mediaId);
    if (!inFile || !/\.(mp4|mov|webm|mkv)$/i.test(inFile)) {
      statusEl.textContent = "Solo videos mp4/mov/webm/mkv.";
      return;
    }
    const hook = hookInput?.value.trim() ?? "";
    const showBranding = $("#branding-toggle")?.checked ?? true;
    const outFile = inFile.replace(/\.(mp4|mov|webm|mkv)$/i, "-reel.mp4");

    btn.disabled = true;
    statusEl.textContent = "Exportando… (1–2 min)";
    const result = await api.invoke("overlay:export", { inFile, outFile, hook, showBranding });
    btn.disabled = false;

    if (result.ok) {
      statusEl.textContent = `Listo: ${result.outFile}`;
      await refreshMedia();
    } else {
      statusEl.textContent = `Error: ${result.error}`;
    }
  });

  $("#btn-week-plan")?.addEventListener("click", async () => {
    const statusEl = $("#week-plan-status");
    const tableEl = $("#week-plan-table");
    const bodyEl = $("#week-plan-body");
    const btn = $("#btn-week-plan");

    btn.disabled = true;
    statusEl.textContent = "Generando plan…";
    tableEl.classList.add("hidden");

    const result = await api.invoke("plan:week");
    btn.disabled = false;

    if (!result.ok) {
      statusEl.textContent = result.error;
      return;
    }

    statusEl.textContent = "";
    bodyEl.innerHTML = "";
    for (const row of result.plan) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><strong>${escapeHtml(row.day)}</strong></td><td>${escapeHtml(row.idea)}</td>`;
      bodyEl.appendChild(tr);
    }
    tableEl.classList.remove("hidden");
  });
}

async function initDownloader() {
  const form = $("#downloader-form");
  const urlInput = $("#downloader-url");
  const btn = $("#downloader-btn");
  const statusEl = $("#downloader-status");
  const netTag = $("#downloader-net-tag");
  const warningEl = $("#ytdlp-warning");
  const progressBg = $("#downloader-progress-bg");
  const progressBar = $("#downloader-progress-bar");

  if (!form || !urlInput || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  /** Evita doble submit (Enter+clic o doble clic) → dos yt-dlp a la vez. */
  let downloading = false;

  try {
    const { available } = await api.invoke("downloader:checkYtDlp");
    if (!available) {
      warningEl?.classList.remove("hidden");
    } else {
      warningEl?.classList.add("hidden");
    }
  } catch {
    /* dev sin IPC */
  }

  urlInput.addEventListener("input", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      netTag.classList.add("hidden");
      netTag.textContent = "";
      return;
    }

    try {
      const info = await api.invoke("downloader:detectNetwork", url);
      if (info) {
        netTag.textContent = `Red: ${info.name}`;
        netTag.className = "pill ok";
        netTag.classList.remove("hidden");
      } else {
        netTag.textContent = "URL no soportada";
        netTag.className = "pill err";
        netTag.classList.remove("hidden");
      }
    } catch {
      netTag.classList.add("hidden");
    }
  });

  if (api.onDownloaderProgress) {
    api.onDownloaderProgress(({ percent, text }) => {
      progressBg?.classList.remove("hidden");
      if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      if (!statusEl) return;
      const hint = (text || "").trim();
      // Anti-marca en segundo plano: no vuelve a poner el botón en "Descargando…"
      if (/marca de agua|anti-marca|openrouter|ffmpeg/i.test(hint)) {
        statusEl.className = /falló|fallo|error/i.test(hint) ? "status-msg err" : "status-msg";
        statusEl.style.color = /falló|fallo|error/i.test(hint) ? "" : "#b80";
        statusEl.textContent = hint;
        if (/lista|falló|fallo|error/i.test(hint)) {
          lastMediaSignature = null;
          void refreshMedia();
        }
        return;
      }
      if (!downloading) return;
      statusEl.className = "status-msg";
      statusEl.style.color = "";
      statusEl.textContent = `Descargando… ${Math.round(percent)}%`;
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (downloading) return;
    const url = urlInput.value.trim();
    if (!url) return;

    downloading = true;
    btn.disabled = true;
    urlInput.disabled = true;
    btn.textContent = "Descargando…";
    statusEl.className = "status-msg";
    statusEl.style.color = "";
    statusEl.textContent = "Iniciando descarga…";
    progressBg?.classList.remove("hidden");
    if (progressBar) progressBar.style.width = "0%";

    // Limpia ya: el anti-marca puede tardar minutos después del 100%.
    urlInput.value = "";
    netTag.classList.add("hidden");
    netTag.textContent = "";

    try {
      const removeWatermarkMode = $("#downloader-wm-mode")?.value || "off";
      const result = await api.invoke("downloader:download", { url, removeWatermarkMode });

      if (result.ok) {
        statusEl.className = "status-msg ok";
        statusEl.style.color = "";
        if (result.watermarkWarning) {
          statusEl.className = "status-msg";
          statusEl.style.color = "#b80";
          statusEl.textContent = `Descargado en Descargas. Anti-marca falló (video intacto): ${result.watermarkWarning.slice(0, 280)}`;
        } else if (result.watermarkPending) {
          statusEl.className = "status-msg";
          statusEl.style.color = "#b80";
          statusEl.textContent =
            "¡Listo en Descargas! Ya puedes pegar otra URL. Anti-marca sigue en segundo plano…";
        } else if (result.watermarkRemoved) {
          statusEl.textContent = `¡Listo! En Descargas + anti-marca (${result.watermarkMode || removeWatermarkMode}).`;
        } else {
          statusEl.textContent = "¡Listo! Guardado en tu carpeta Descargas y en Mis Videos.";
        }
        if (progressBar) progressBar.style.width = "100%";
        try {
          localStorage.setItem(BABELDESK_LAST_DOWNLOAD_URL_KEY, url);
        } catch {
          /* ignore */
        }

        lastMediaSignature = null;
        await refreshMedia();
      } else {
        statusEl.className = "status-msg err";
        statusEl.textContent = result.error || "Ocurrió un error al descargar el video.";
        urlInput.value = url;
        if (result.ytDlpMissing) {
          warningEl?.classList.remove("hidden");
        }
      }
    } catch (err) {
      statusEl.className = "status-msg err";
      statusEl.textContent = `Error: ${err.message || String(err)}`;
      urlInput.value = url;
    } finally {
      downloading = false;
      btn.disabled = false;
      urlInput.disabled = false;
      btn.textContent = "Descargar";
      urlInput.focus();
      setTimeout(() => {
        if (!downloading) progressBg?.classList.add("hidden");
      }, 4000);
    }
  });
}

$("#hist-refresh").onclick = () => refreshHistory();
$("#hist-filter-network").onchange = () => refreshHistory();
$("#hist-filter-status").onchange = () => refreshHistory();

api.onTargetUpdate(() => {
  refreshTargets();
  refreshHistory();
});

async function initCutter() {
  const sourceSelect = $("#cutter-source");
  const durationEl = $("#cutter-duration");
  const verticalCb = $("#cutter-vertical");
  const overlayCb = $("#cutter-overlay");
  const hookInput = $("#cutter-hook-text");
  const tbody = $("#cutter-tbody");
  const btnAdd = $("#btn-add-clip-row");
  const btnCut = $("#btn-cut-all");
  const btnCutSelected = $("#btn-cut-selected");
  const btnClearTable = $("#btn-clear-table");
  const btnPostLastCut = $("#btn-post-last-cut");
  const btnCancel = $("#btn-cancel-cut");
  const progressEl = $("#cutter-progress");
  const resultEl = $("#cutter-result");
  const previewVideo = $("#cutter-video-preview");
  const clipBadge = $("#cutter-clip-badge");
  const previewTimeEl = $("#cutter-preview-time");
  const btnMarkStart = $("#btn-mark-start");
  const btnMarkEnd = $("#btn-mark-end");
  const previewAudioCb = $("#cutter-preview-audio");

  if (!sourceSelect) return;

  let sourceTotalSec = 0;
  let lastCutOutputPaths = [];
  const btnRefreshThumbs = $("#btn-refresh-thumbs");
  const thumbCache = new Map();
  let thumbQueue = Promise.resolve();
  const rowThumbTimers = new WeakMap();

  let thumbVideo = $("#cutter-thumb-video");
  if (!thumbVideo) {
    thumbVideo = document.createElement("video");
    thumbVideo.id = "cutter-thumb-video";
    thumbVideo.muted = true;
    thumbVideo.playsInline = true;
    thumbVideo.preload = "auto";
    document.body.appendChild(thumbVideo);
  }

  function previewCellInnerHtml() {
    return `<div class="cutter-thumb-pair">
      <button type="button" class="cutter-thumb-btn" data-thumb-at="start" title="Ver inicio en reproductor grande">
        <img class="cutter-thumb clip-thumb-start" alt="Inicio" />
        <span class="cutter-thumb-label">In</span>
      </button>
      <button type="button" class="cutter-thumb-btn" data-thumb-at="end" title="Ver fin en reproductor grande">
        <img class="cutter-thumb clip-thumb-end" alt="Fin" />
        <span class="cutter-thumb-label">Out</span>
      </button>
    </div>`;
  }

  function ensureRowPreviewCell(tr) {
    if (!tr || tr.querySelector(".clip-preview-cell")) return;
    const cell = document.createElement("td");
    cell.className = "clip-preview-cell";
    cell.innerHTML = previewCellInnerHtml();
    const actionsTd = tr.querySelector(".clip-row-actions")?.closest("td");
    if (actionsTd) tr.insertBefore(cell, actionsTd);
    else tr.appendChild(cell);
  }

  async function captureVideoFrame(filePath, timeSec) {
    const safeT = Math.max(0, timeSec);
    const key = `${filePath}|${safeT.toFixed(2)}`;
    if (thumbCache.has(key)) return thumbCache.get(key);

    const fileUrl = toFileUrl(filePath);
    if (thumbVideo.src !== fileUrl) {
      thumbVideo.src = fileUrl;
      await new Promise((resolve, reject) => {
        const onMeta = () => {
          thumbVideo.removeEventListener("error", onErr);
          resolve();
        };
        const onErr = () => {
          thumbVideo.removeEventListener("loadedmetadata", onMeta);
          reject(new Error("thumb load"));
        };
        thumbVideo.addEventListener("loadedmetadata", onMeta, { once: true });
        thumbVideo.addEventListener("error", onErr, { once: true });
        thumbVideo.load();
      });
    }

    const dur = thumbVideo.duration;
    const t = Number.isFinite(dur) && dur > 0 ? Math.min(safeT, dur - 0.08) : safeT;
    thumbVideo.currentTime = t;
    await new Promise((resolve) => {
      thumbVideo.addEventListener("seeked", () => resolve(), { once: true });
    });

    const tw = 48;
    const th = 85;
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    const vw = thumbVideo.videoWidth;
    const vh = thumbVideo.videoHeight;
    if (vw && vh) {
      const targetAspect = 9 / 16;
      const srcAspect = vw / vh;
      let sx;
      let sy;
      let sw;
      let sh;
      if (srcAspect > targetAspect) {
        sh = vh;
        sw = vh * targetAspect;
        sx = (vw - sw) / 2;
        sy = 0;
      } else {
        sw = vw;
        sh = vw / targetAspect;
        sx = 0;
        sy = (vh - sh) / 2;
      }
      ctx.drawImage(thumbVideo, sx, sy, sw, sh, 0, 0, tw, th);
    } else {
      ctx.drawImage(thumbVideo, 0, 0, tw, th);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    thumbCache.set(key, dataUrl);
    return dataUrl;
  }

  function scheduleRowThumbRefresh(tr, delayMs = 400) {
    if (!tr) return;
    clearTimeout(rowThumbTimers.get(tr));
    rowThumbTimers.set(
      tr,
      setTimeout(() => {
        void refreshRowThumbnails(tr);
      }, delayMs)
    );
  }

  async function refreshRowThumbnails(tr) {
    const filePath = sourceSelect.value;
    if (!filePath || !tr) return;
    ensureRowPreviewCell(tr);
    const imgStart = tr.querySelector(".clip-thumb-start");
    const imgEnd = tr.querySelector(".clip-thumb-end");
    if (!imgStart || !imgEnd) return;

    const startRaw = tr.querySelector(".clip-start")?.value?.trim();
    const endRaw = tr.querySelector(".clip-end")?.value?.trim();
    const startSec = startRaw ? parseClock(startRaw) : NaN;
    const endSec = endRaw ? parseClock(endRaw) : NaN;

    if (!Number.isNaN(startSec)) {
      await enqueueThumb(async () => {
        try {
          imgStart.src = await captureVideoFrame(filePath, startSec);
          imgStart.alt = `Inicio ${formatClock(startSec)}`;
        } catch {
          imgStart.removeAttribute("src");
        }
      });
    } else {
      imgStart.removeAttribute("src");
    }

    if (!Number.isNaN(endSec) && endRaw) {
      const endFrame = Math.max(0, endSec - 0.35);
      await enqueueThumb(async () => {
        try {
          imgEnd.src = await captureVideoFrame(filePath, endFrame);
          imgEnd.alt = `Fin ~${formatClock(endSec)}`;
        } catch {
          imgEnd.removeAttribute("src");
        }
      });
    } else {
      imgEnd.removeAttribute("src");
    }
  }

  function enqueueThumb(fn) {
    thumbQueue = thumbQueue.then(fn);
    return thumbQueue;
  }

  async function refreshAllRowThumbnails() {
    const rows = [...tbody.querySelectorAll("tr")];
    if (!rows.length || !sourceSelect.value) return;
    btnRefreshThumbs.disabled = true;
    btnRefreshThumbs.textContent = "Generando…";
    for (const tr of rows) {
      await refreshRowThumbnails(tr);
    }
    btnRefreshThumbs.disabled = false;
    btnRefreshThumbs.textContent = "🖼 Actualizar miniaturas";
  }

  function bindClipRow(tr) {
    if (!tr || tr.dataset.clipBound === "1") return;
    tr.dataset.clipBound = "1";
    ensureRowPreviewCell(tr);
    tr.querySelector(".clip-start")?.addEventListener("input", () => {
      validateClipRow(tr);
      scheduleRowThumbRefresh(tr);
    });
    tr.querySelector(".clip-end")?.addEventListener("input", () => {
      validateClipRow(tr);
      scheduleRowThumbRefresh(tr);
    });
  }

  function seekMainPreview(timeSec, tr) {
    if (!previewVideo?.src || Number.isNaN(timeSec)) return;
    if (tr) {
      tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("selected-clip-row"));
      tr.classList.add("selected-clip-row");
      const startVal = tr.querySelector(".clip-start")?.value;
      const endVal = tr.querySelector(".clip-end")?.value;
      const clipName = tr.querySelector(".clip-name")?.value?.trim() || "Clip";
      if (clipBadge) {
        clipBadge.textContent = `${clipName} (${startVal || "?"} - ${endVal || "fin"})`;
        clipBadge.classList.remove("hidden");
      }
    }
    previewVideo.pause();
    previewVideo.currentTime = Math.max(0, timeSec);
    if (previewTimeEl) previewTimeEl.textContent = formatClock(previewVideo.currentTime);
  }

  // Check ffmpeg
  try {
    const { available } = await api.invoke("cutter:checkFfmpeg");
    if (!available) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "⚠️ ffmpeg no encontrado. Instálalo con: winget install ffmpeg";
    }
  } catch { /* silent */ }

  // Toggle hook text visible
  overlayCb?.addEventListener("change", () => {
    hookInput?.classList.toggle("hidden", !overlayCb.checked);
  });

  function formatClock(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  previewAudioCb?.addEventListener("change", () => {
    if (previewVideo) previewVideo.muted = !previewAudioCb.checked;
  });

  previewVideo?.addEventListener("timeupdate", () => {
    if (previewTimeEl && previewVideo) {
      previewTimeEl.textContent = formatClock(previewVideo.currentTime || 0);
    }
  });

  btnMarkStart?.addEventListener("click", () => {
    const tr = getActiveClipRow();
    if (!tr || !previewVideo) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Selecciona un video y una fila de la tabla.";
      return;
    }
    previewVideo.pause();
    const startIn = tr.querySelector(".clip-start");
    if (startIn) {
      startIn.value = formatClock(previewVideo.currentTime || 0);
      validateClipRow(tr);
      previewClipRow(tr);
      scheduleRowThumbRefresh(tr, 80);
    }
  });

  btnMarkEnd?.addEventListener("click", () => {
    const tr = getActiveClipRow();
    if (!tr || !previewVideo) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Selecciona un video y una fila de la tabla.";
      return;
    }
    previewVideo.pause();
    const endIn = tr.querySelector(".clip-end");
    if (endIn) {
      endIn.value = formatClock(previewVideo.currentTime || 0);
      validateClipRow(tr);
      previewClipRow(tr);
      scheduleRowThumbRefresh(tr, 80);
    }
  });

  btnRefreshThumbs?.addEventListener("click", () => {
    if (!sourceSelect.value) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Elige el video fuente primero.";
      return;
    }
    void refreshAllRowThumbnails();
  });

  // Populate source select from Inbox
  async function refreshCutterSource() {
    const rows = await api.invoke("media:list");
    const prev = sourceSelect.value;
    sourceSelect.innerHTML = '<option value="">— Selecciona un video de Inbox —</option>';
    for (const m of (rows || [])) {
      if (!m.path.match(/\.(mp4|mov|webm|mkv|avi)$/i)) continue;
      const opt = document.createElement("option");
      opt.value = m.path;
      opt.textContent = m.path.split(/[/\\]/).pop();
      sourceSelect.appendChild(opt);
    }
    if (prev) sourceSelect.value = prev;
  }

  await refreshCutterSource();
  cutterSelectSource = async (filePath) => {
    await refreshCutterSource();
    if (filePath) {
      sourceSelect.value = filePath;
      sourceSelect.dispatchEvent(new Event("change"));
    }
  };

  function parseClock(t) {
    const parts = String(t).trim().split(":").map(Number);
    if (!parts.length || parts.some(Number.isNaN)) return NaN;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return NaN;
  }

  function getActiveClipRow() {
    return tbody.querySelector("tr.selected-clip-row") || tbody.querySelector("tr");
  }

  function renumberClipRows() {
    tbody.querySelectorAll("tr").forEach((tr, i) => {
      const numCell = tr.querySelector("td");
      if (numCell) numCell.textContent = String(i + 1);
    });
  }

  function validateClipRow(tr) {
    if (!tr) return;
    const startIn = tr.querySelector(".clip-start");
    const endIn = tr.querySelector(".clip-end");
    if (!startIn || !endIn) return;
    const startSec = parseClock(startIn.value);
    const endSec = parseClock(endIn.value);
    let invalid = false;
    if (endIn.value.trim() && !Number.isNaN(endSec) && !Number.isNaN(startSec) && endSec <= startSec) {
      invalid = true;
    }
    if (
      sourceTotalSec > 0 &&
      endIn.value.trim() &&
      !Number.isNaN(endSec) &&
      endSec > sourceTotalSec + 0.5
    ) {
      invalid = true;
    }
    if (
      sourceTotalSec > 0 &&
      startIn.value.trim() &&
      !Number.isNaN(startSec) &&
      startSec > sourceTotalSec
    ) {
      invalid = true;
    }
    startIn.classList.toggle("clip-time-invalid", invalid);
    endIn.classList.toggle("clip-time-invalid", invalid);
  }

  function validateAllClipRows() {
    tbody.querySelectorAll("tr").forEach((tr) => validateClipRow(tr));
  }

  function applyEndAsTotal(tr) {
    if (!tr) return;
    if (sourceTotalSec <= 0) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Elige primero el video fuente (duración desconocida).";
      return;
    }
    const endIn = tr.querySelector(".clip-end");
    if (endIn) {
      endIn.value = formatClock(sourceTotalSec);
      validateClipRow(tr);
      scheduleRowThumbRefresh(tr, 80);
    }
  }

  function previewClipRow(tr) {
    if (!tr || !previewVideo) return;
    tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("selected-clip-row"));
    tr.classList.add("selected-clip-row");

    const startVal = tr.querySelector(".clip-start")?.value;
    const endVal = tr.querySelector(".clip-end")?.value;
    const clipName = tr.querySelector(".clip-name")?.value?.trim() || "Clip";

    if (!startVal) return;
    const startSec = parseClock(startVal);
    if (Number.isNaN(startSec)) return;

    previewVideo.currentTime = startSec;
    void previewVideo.play().catch(() => {});

    if (clipBadge) {
      clipBadge.textContent = `${clipName} (${startVal} - ${endVal || "fin"})`;
      clipBadge.classList.remove("hidden");
    }
  }

  sourceSelect.addEventListener("change", async () => {
    const p = sourceSelect.value;
    sourceTotalSec = 0;
    thumbCache.clear();
    btnPostLastCut?.classList.add("hidden");
    lastCutOutputPaths = [];
    if (!p) {
      durationEl.textContent = "";
      if (previewVideo) previewVideo.removeAttribute("src");
      if (clipBadge) clipBadge.classList.add("hidden");
      tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("selected-clip-row"));
      validateAllClipRows();
      return;
    }
    if (previewVideo) {
      previewVideo.src = toFileUrl(p);
      previewVideo.load();
    }
    try {
      const { seconds, formatted } = await api.invoke("cutter:getDuration", p);
      sourceTotalSec = seconds || 0;
      durationEl.textContent = `⏱ Duración total: ${formatted}`;
    } catch {
      durationEl.textContent = "";
    }
    validateAllClipRows();
    const first = tbody.querySelector("tr");
    if (first && previewVideo?.src) previewClipRow(first);
    void refreshAllRowThumbnails();
  });

  let rowCounter = 2;
  function appendClipRow(start = "", end = "", name = "") {
    const tr = document.createElement("tr");
    tr.dataset.row = String(rowCounter);
    tr.innerHTML = `
      <td>${rowCounter}</td>
      <td><input type="text" class="clip-start" placeholder="0:00" /></td>
      <td><input type="text" class="clip-end" placeholder="0:45" /></td>
      <td><input type="text" class="clip-name" placeholder="clip-${rowCounter}" /></td>
      <td class="clip-preview-cell">${previewCellInnerHtml()}</td>
      <td class="clip-row-actions">
        <button class="btn-set-end-total" type="button" title="Fin = duración total">⏭</button>
        <button class="btn-remove-row" type="button">✕</button>
      </td>`;
    tr.querySelector(".clip-start").value = start;
    tr.querySelector(".clip-end").value = end;
    tr.querySelector(".clip-name").value = name;
    tbody.appendChild(tr);
    bindClipRow(tr);
    rowCounter++;
    renumberClipRows();
    validateClipRow(tr);
    scheduleRowThumbRefresh(tr, 200);
  }

  tbody.querySelectorAll("tr").forEach((tr) => bindClipRow(tr));

  btnAdd?.addEventListener("click", () => appendClipRow());

  $("#btn-auto-generate")?.addEventListener("click", async () => {
    const sourcePath = sourceSelect.value;
    if (!sourcePath) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Selecciona primero un video fuente.";
      return;
    }

    const interval = parseInt($("#cutter-interval").value, 10);
    if (!interval || interval < 5) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "El intervalo mínimo es de 5 segundos.";
      return;
    }

    const { seconds: totalSec } = await api.invoke("cutter:getDuration", sourcePath);
    if (!totalSec) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "No pude leer la duración del video (¿ffprobe instalado? ¿archivo dañado?).";
      return;
    }

    const startRaw = $("#cutter-auto-start").value.trim();
    const endRaw = $("#cutter-auto-end").value.trim();
    const startSec = startRaw ? parseClock(startRaw) : 0;
    const endSec = endRaw ? Math.min(parseClock(endRaw), totalSec) : totalSec;
    if (Number.isNaN(startSec) || Number.isNaN(endSec) || endSec <= startSec) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Revisa «Desde» y «Hasta»: usa mm:ss y que el inicio sea menor al fin.";
      return;
    }

    const segments = [];
    for (let cur = startSec; cur < endSec; cur += interval) {
      segments.push([cur, Math.min(cur + interval, endSec)]);
    }
    const minTail = Math.min(10, interval / 2);
    if (segments.length > 1) {
      const last = segments[segments.length - 1];
      if (last[1] - last[0] < minTail) {
        segments.pop();
        segments[segments.length - 1][1] = endSec;
      }
    }

    const hasManualRows = [...tbody.querySelectorAll(".clip-end")].some((i) => i.value.trim());
    if (hasManualRows && !confirm("La tabla ya tiene clips. ¿Reemplazarlos por los generados?")) return;
    if (segments.length > 100 && !confirm(`Se generarán ${segments.length} clips. ¿Continuar?`)) return;

    const base = sourcePath
      .split(/[/\\]/)
      .pop()
      .replace(/\.[^.]+$/, "")
      .replace(/-\d{8}$/, "")
      .slice(0, 24);
    const pad = String(segments.length).length < 2 ? 2 : String(segments.length).length;

    tbody.innerHTML = "";
    rowCounter = 1;
    segments.forEach(([a, b], i) => {
      appendClipRow(formatClock(a), formatClock(b), `${base}-p${String(i + 1).padStart(pad, "0")}`);
    });

    const vertical = verticalCb?.checked ?? true;
    resultEl.className = "status-msg ok";
    resultEl.textContent =
      `✅ ${segments.length} clips en la tabla. Revisa miniaturas In/Out, ajusta segundos y pulsa «Cortar Todos».` +
      (vertical && segments.length > 10
        ? " En vertical cada clip se vuelve a procesar: puede tardar varios minutos."
        : "");
    void refreshAllRowThumbnails();
  });

  tbody.addEventListener("click", (e) => {
    const thumbBtn = e.target.closest(".cutter-thumb-btn");
    if (thumbBtn) {
      e.stopPropagation();
      const tr = thumbBtn.closest("tr");
      if (!tr) return;
      const at = thumbBtn.dataset.thumbAt;
      const startSec = parseClock(tr.querySelector(".clip-start")?.value || "");
      const endSec = parseClock(tr.querySelector(".clip-end")?.value || "");
      if (at === "start" && !Number.isNaN(startSec)) seekMainPreview(startSec, tr);
      else if (at === "end" && !Number.isNaN(endSec)) seekMainPreview(Math.max(0, endSec - 0.35), tr);
      return;
    }
    if (e.target?.classList?.contains("btn-set-end-total")) {
      e.stopPropagation();
      applyEndAsTotal(e.target.closest("tr"));
      return;
    }
    if (e.target?.classList?.contains("btn-remove-row")) {
      e.stopPropagation();
      const tr = e.target.closest("tr");
      if (tbody.querySelectorAll("tr").length > 1) {
        const wasSelected = tr?.classList.contains("selected-clip-row");
        tr?.remove();
        renumberClipRows();
        if (wasSelected) {
          clipBadge?.classList.add("hidden");
          const first = tbody.querySelector("tr");
          if (first && previewVideo?.src) previewClipRow(first);
        }
      }
      return;
    }
    if (e.target.closest("input")) return;
    const tr = e.target.closest("tr");
    if (tr && previewVideo?.src) previewClipRow(tr);
  });

  previewVideo?.addEventListener("timeupdate", () => {
    const activeRow = tbody.querySelector("tr.selected-clip-row");
    if (!activeRow || !previewVideo) return;
    const endVal = activeRow.querySelector(".clip-end")?.value;
    const startVal = activeRow.querySelector(".clip-start")?.value;
    if (!endVal || !startVal) return;
    const endSec = parseClock(endVal);
    const startSec = parseClock(startVal);
    if (!Number.isNaN(endSec) && !Number.isNaN(startSec) && previewVideo.currentTime >= endSec - 0.05) {
      previewVideo.currentTime = startSec;
    }
  });

  // Progress listener
  if (api.onCutterProgress) {
    api.onCutterProgress(({ msg, done, total }) => {
      progressEl.classList.remove("hidden");
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      progressEl.textContent = `${msg} (${done}/${total}) — ${pct}%`;
    });
  }

  function resetCutUi() {
    btnCut.disabled = false;
    btnCut.textContent = "▶ Cortar Todos";
    if (btnCutSelected) btnCutSelected.disabled = false;
    btnCancel?.classList.add("hidden");
    if (btnCancel) {
      btnCancel.disabled = false;
      btnCancel.textContent = "❌ Cancelar";
    }
  }

  btnCancel?.addEventListener("click", async () => {
    btnCancel.disabled = true;
    btnCancel.textContent = "Cancelando…";
    try {
      await api.invoke("cutter:cancel");
    } catch {
      /* el corte en curso resolverá con cancelled */
    }
  });

  function collectClipsFromRows(rowEls) {
    return rowEls
      .map((tr, i) => ({
        start: tr.querySelector(".clip-start")?.value?.trim() || "0:00",
        end: tr.querySelector(".clip-end")?.value?.trim() || "",
        name: tr.querySelector(".clip-name")?.value?.trim() || `clip-${i + 1}`,
        tr,
      }))
      .filter((c) => c.end && c.end !== c.start);
  }

  function setCutButtonsBusy(busy) {
    btnCut.disabled = busy;
    if (btnCutSelected) btnCutSelected.disabled = busy;
    if (btnClearTable) btnClearTable.disabled = busy;
    btnCut.textContent = busy ? "Procesando…" : "▶ Cortar Todos";
    if (busy) {
      btnCancel?.classList.remove("hidden");
    } else {
      resetCutUi();
    }
  }

  async function afterCutOutputs(outputs) {
    if (!outputs?.length) {
      btnPostLastCut?.classList.add("hidden");
      lastCutOutputPaths = [];
      return;
    }
    lastCutOutputPaths = outputs;
    btnPostLastCut?.classList.remove("hidden");
    lastMediaSignature = null;
    await refreshMedia();
    await refreshCutterSource();
  }

  async function runCutJob(clips) {
    const sourcePath = sourceSelect.value;
    if (!sourcePath) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Selecciona un video fuente primero.";
      return;
    }
    if (!clips.length) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Define al menos un clip con inicio y fin válidos.";
      return;
    }

    validateAllClipRows();
    const badRow = tbody.querySelector("input.clip-time-invalid");
    if (badRow) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "Hay tiempos inválidos (fin ≤ inicio o pasan la duración del video).";
      return;
    }

    setCutButtonsBusy(true);
    resultEl.className = "status-msg";
    resultEl.textContent = clips.length === 1 ? "Cortando 1 clip…" : "Iniciando corte…";
    progressEl.classList.remove("hidden");
    progressEl.textContent = "";

    try {
      const payloadClips = clips.map(({ start, end, name }) => ({ start, end, name }));
      const result = await api.invoke("cutter:cut", {
        sourcePath,
        clips: payloadClips,
        vertical: verticalCb?.checked ?? true,
        hookText: overlayCb?.checked ? (hookInput?.value?.trim() || "") : "",
      });

      if (result.cancelled) {
        resultEl.className = "status-msg err";
        resultEl.textContent = `🛑 Procesamiento cancelado (se generaron ${result.outputs.length} clip(s)).`;
        await afterCutOutputs(result.outputs);
      } else if (result.ok) {
        resultEl.className = "status-msg ok";
        resultEl.textContent = `✅ ${result.outputs.length} clip(s) guardados en Inbox.`;
        await afterCutOutputs(result.outputs);
      } else {
        resultEl.className = "status-msg err";
        const errMsg = result.errors.length ? result.errors.join(" | ") : "Error al cortar.";
        resultEl.textContent = `⚠️ ${errMsg}`;
        if (result.outputs.length) {
          resultEl.textContent += ` (${result.outputs.length} clips sí se guardaron)`;
        }
        await afterCutOutputs(result.outputs);
      }
    } catch (err) {
      resultEl.className = "status-msg err";
      resultEl.textContent = `Error: ${err.message || String(err)}`;
    } finally {
      setCutButtonsBusy(false);
      setTimeout(() => progressEl.classList.add("hidden"), 3000);
    }
  }

  btnCut?.addEventListener("click", async () => {
    const clips = collectClipsFromRows(Array.from(tbody.querySelectorAll("tr")));
    await runCutJob(clips);
  });

  btnCutSelected?.addEventListener("click", async () => {
    const tr = getActiveClipRow();
    if (!tr) return;
    const clips = collectClipsFromRows([tr]);
    await runCutJob(clips);
  });

  btnClearTable?.addEventListener("click", () => {
    if (cutterTableHasClipData() && !confirm("¿Vaciar la tabla y dejar una fila nueva?")) return;
    tbody.innerHTML = "";
    rowCounter = 1;
    appendClipRow("0:00", "", "clip-1");
    clipBadge?.classList.add("hidden");
    resultEl.textContent = "";
  });

  btnPostLastCut?.addEventListener("click", async () => {
    const outPath = lastCutOutputPaths[lastCutOutputPaths.length - 1];
    if (!outPath) return;
    lastMediaSignature = null;
    await refreshMedia();
    const rows = (await api.invoke("media:list")) || [];
    const norm = outPath.replace(/\\/g, "/").toLowerCase();
    const m = rows.find((r) => r.path.replace(/\\/g, "/").toLowerCase() === norm);
    if (!m) {
      resultEl.className = "status-msg err";
      resultEl.textContent = "No encontré el clip en Mis Videos; espera unos segundos e intenta de nuevo.";
      return;
    }
    goToTab("composer");
    const sel = $("#media-select");
    sel.value = m.id;
    sel.dispatchEvent(new Event("change"));
    $("#post-form").querySelector('[name="title"]')?.focus();
  });

  function slugifyChapterName(title) {
    return (
      (title || "clip")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s_-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 40) || "clip"
    );
  }

  function cutterTableHasClipData() {
    return [...tbody.querySelectorAll(".clip-end")].some((input) => input.value.trim());
  }

  const ytUrlInput = $("#cutter-yt-url");
  const btnLoadChapters = $("#btn-load-chapters");
  const chaptersStatus = $("#chapters-status");

  btnLoadChapters?.addEventListener("click", async () => {
    const url = ytUrlInput?.value?.trim();
    if (!url) {
      chaptersStatus.className = "status-msg err";
      chaptersStatus.textContent = "Pega primero la URL del video de YouTube.";
      return;
    }

    if (cutterTableHasClipData()) {
      const ok = confirm(
        "La tabla ya tiene clips definidos. ¿Reemplazarlos con los capítulos del video?"
      );
      if (!ok) return;
    }

    chaptersStatus.className = "status-msg";
    chaptersStatus.textContent = "Obteniendo capítulos… (5–15 s según la red)";
    btnLoadChapters.disabled = true;

    try {
      const result = await api.invoke("cutter:getYoutubeChapters", url);
      if (!result.ok) {
        chaptersStatus.className = "status-msg err";
        chaptersStatus.textContent = result.error || "No se pudieron obtener los capítulos.";
        return;
      }

      const chapters = result.chapters || [];
      if (chapters.length > 100 && !confirm(`Se cargarán ${chapters.length} capítulos. ¿Continuar?`)) {
        chaptersStatus.className = "status-msg";
        chaptersStatus.textContent = "Cancelado.";
        return;
      }

      tbody.innerHTML = "";
      rowCounter = 1;
      const usedNames = new Set();
      for (const ch of chapters) {
        let name = slugifyChapterName(ch.title);
        if (usedNames.has(name)) {
          let n = 2;
          while (usedNames.has(`${name}-${n}`)) n++;
          name = `${name}-${n}`;
        }
        usedNames.add(name);
        appendClipRow(formatClock(ch.start_time), formatClock(ch.end_time), name);
      }

      const vertical = verticalCb?.checked ?? true;
      chaptersStatus.className = "status-msg ok";
      chaptersStatus.textContent =
        `✅ ${chapters.length} capítulos en la tabla. Revisa miniaturas In/Out y ajusta antes de «Cortar Todos».` +
        (vertical && chapters.length > 10
          ? " En vertical puede tardar varios minutos."
          : "");
      void refreshAllRowThumbnails();
    } catch (err) {
      chaptersStatus.className = "status-msg err";
      chaptersStatus.textContent = `Error: ${err.message || String(err)}`;
    } finally {
      btnLoadChapters.disabled = false;
    }
  });

  try {
    const lastDl = localStorage.getItem(BABELDESK_LAST_DOWNLOAD_URL_KEY);
    if (lastDl && ytUrlInput && !ytUrlInput.value.trim()) {
      ytUrlInput.value = lastDl;
    }
  } catch {
    /* ignore */
  }

  const firstRow = tbody.querySelector("tr");
  if (firstRow) firstRow.classList.add("selected-clip-row");
}

async function boot() {
  bindComposerInputs();
  void initTanda13Composer();
  void initDownloader();
  void initCutter();
  await refreshInfo();
  await refreshMetaOAuthUi();
  await Promise.all([refreshAccounts(), refreshMedia(), refreshTargets(), refreshGroups(), refreshLogs()]);
  setInterval(() => {
    refreshTargets();
    refreshMedia();
    refreshLogs();
  }, 15000);
}

boot();
