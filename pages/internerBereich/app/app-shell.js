(() => {
  const body = document.body;
  const title = body.dataset.appTitle || document.title || "Clinicon";
  const subtitle = body.dataset.appSubtitle || "";
  const currentKey = body.dataset.appPage || "";
  const currentPath = (window.location.pathname || "").toLowerCase();

  const base = "/pages/internerBereich/GFO/pages";
  const navItems = [
    { key: "start", label: "Start", href: `${base}/1_Unterstartseite.html`, icon: "home" },
    { key: "klinik", label: "Klinik", href: `${base}/1_klinikverbund.html`, icon: "layers" },
    { key: "assistent", label: "Clinicon Assistent", href: `${base}/clinicon-assistent.html`, icon: "help" },
    { key: "stellenplan", label: "Stellenplan", href: `${base}/stellenplan.html`, icon: "list" },
    { key: "stellenplan-gesamt", label: "Stellenplan Gesamt", href: `${base}/stellenplan-gesamt.html`, icon: "grid" },
    { key: "stellenplan-insights", label: "Stellenplan Insights", href: `${base}/stellenplan-insights.html`, icon: "spark" },
    { key: "erfassung", label: "Erfassung", href: `${base}/1_Klinikverbund_ErfassungDA03.html`, icon: "clipboard" },
    { key: "maptool", label: "Map-Tool", href: `${base}/maptool.html`, icon: "map" }
  ];

  const iconPaths = {
    home: '<path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    layers: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 13l3 3 7-7"/>',
    clipboard: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v4H9z"/>',
    list: '<path d="M4 6h16M4 12h10M4 18h7"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h3"/><path d="M13 15h2"/>',
    sliders: '<path d="M4 6h16"/><path d="M7 6v12"/><path d="M4 12h16"/><path d="M15 12v6"/><path d="M4 18h16"/>',
    map: '<path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
    spark: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M7 12h10"/>',
    help: '<path d="M12 20v-2"/><path d="M12 4a4 4 0 0 1 4 4c0 2-2 3-2 4H10c0-1-2-2-2-4a4 4 0 0 1 4-4z"/>'
  };

  const buildIcon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.list}</svg>`;

  const isGfo = /\/internerbereich\/gfo\//i.test(currentPath);
  const brandLogo = body.dataset.appLogo || (isGfo
    ? "/pages/internerBereich/GFO/assets/Bilder/GFOLogo.jpg"
    : "/pages/internerBereich/GFO/assets/Bilder/CliniConLogo.png");
  const brandTitle = body.dataset.appBrand || (isGfo ? "GFO Verbund" : "Clinicon");
  const brandSub = body.dataset.appBrandSub || (isGfo ? "Clinicon" : "Clinicon Suite");
  const footerText = body.dataset.appFooter || (isGfo ? "app.clinicon &middot; GFO Standort" : "app.clinicon");
  const showTimeslicer = body.dataset.appTimeslicer !== "off";

  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = `
    <aside class="app-side">
      <a class="app-brand" href="${base}/1_Unterstartseite.html">
        <img class="app-brand-logo" src="${brandLogo}" alt="${brandTitle} Logo" />
        <div class="app-brand-text">
          <span class="app-brand-title">${brandTitle}</span>
          <span class="app-brand-sub">${brandSub}</span>
        </div>
      </a>
      <nav class="app-nav"></nav>
      <div class="app-side-footer">${footerText}</div>
    </aside>
    <div class="app-body">
      <div class="app-header">
        <div class="app-header-left">
          <h1>${title}</h1>
          ${subtitle ? `<p>${subtitle}</p>` : ""}
        </div>
        <div class="app-header-right">
          <span class="app-pill app-pill-neutral" data-app-timestamp></span>
          <div class="app-actions"></div>
        </div>
      </div>
      ${showTimeslicer ? `
      <div class="app-timeslicer" data-timeslicer>
        <div class="timeslicer-card">
          <div class="timeslicer-head">
            <div>
              <div class="timeslicer-title">Zeitfenster</div>
              <div class="timeslicer-sub">Filtert Kennzahlen und Reportings im internen Bereich.</div>
            </div>
            <span class="timeslicer-pill" data-range-label>7 Tage</span>
          </div>
          <div class="timeslicer-controls">
            <div class="timeslicer-buttons">
              <button class="timeslicer-btn active" type="button" data-range="7d" data-label="7 Tage">7 Tage</button>
              <button class="timeslicer-btn" type="button" data-range="30d" data-label="30 Tage">30 Tage</button>
              <button class="timeslicer-btn" type="button" data-range="quarter" data-label="Quartal">Quartal</button>
              <button class="timeslicer-btn" type="button" data-range="year" data-label="Jahr">Jahr</button>
            </div>
            <div class="timeslicer-custom">
              <label>Von <input type="date" data-range-start /></label>
              <span>-</span>
              <label>Bis <input type="date" data-range-end /></label>
            </div>
          </div>
        </div>
      </div>` : ""}
      <div class="app-main"></div>
    </div>
  `;

  const nav = shell.querySelector(".app-nav");
  navItems.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.innerHTML = `${buildIcon(item.icon)}<span>${item.label}</span>`;
    const isActive =
      (currentKey && currentKey === item.key) ||
      (currentPath && currentPath.endsWith(item.href.toLowerCase()));
    if (isActive) link.classList.add("active");
    nav.appendChild(link);
  });

  let actions = body.querySelector("[data-app-actions]");

  let content = body.querySelector("[data-app-content]");
  if (!content) {
    const legacyShell = body.querySelector(".shell");
    if (legacyShell) {
      if (!actions) {
        actions = legacyShell.querySelector("[data-app-actions]");
      }
      const main = legacyShell.querySelector("main");
      const footer = legacyShell.querySelector("footer");
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-app-content", "");
      if (main) wrapper.appendChild(main);
      if (footer) wrapper.appendChild(footer);
      content = wrapper;
      legacyShell.remove();
    }
  }

  if (actions) {
    shell.querySelector(".app-actions").appendChild(actions);
  }

  if (!content) {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-app-content", "");
    Array.from(body.children).forEach((child) => {
      if (child.tagName === "SCRIPT") return;
      wrapper.appendChild(child);
    });
    content = wrapper;
  }

  const mainSlot = shell.querySelector(".app-main");
  if (content) {
    const hasMain = content.tagName === "MAIN" || content.querySelector("main");
    if (hasMain) {
      mainSlot.classList.add("has-page-main");
    }
    mainSlot.appendChild(content);
  }

  body.insertBefore(shell, body.firstChild);

  const timestampEl = shell.querySelector("[data-app-timestamp]");
  const updateTimestamp = () => {
    if (!timestampEl) return;
    const now = new Date();
    const stamp = now.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    timestampEl.textContent = `Stand: ${stamp}`;
  };
  updateTimestamp();
  setInterval(updateTimestamp, 60000);

  const timeslicer = shell.querySelector("[data-timeslicer]");
  if (timeslicer) {
    const labelEl = timeslicer.querySelector("[data-range-label]");
    const buttons = Array.from(timeslicer.querySelectorAll(".timeslicer-btn"));
    const startInput = timeslicer.querySelector("[data-range-start]");
    const endInput = timeslicer.querySelector("[data-range-end]");
    const dataRangeEl = document.getElementById("dataRange");

    const setRange = (label, value) => {
      const safeLabel = label || "Auswahl";
      body.dataset.appTimeRange = value || safeLabel;
      if (labelEl) labelEl.textContent = safeLabel;
      if (dataRangeEl) dataRangeEl.textContent = `Zeitraum: ${safeLabel}`;
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        setRange(btn.dataset.label || btn.textContent.trim(), btn.dataset.range || "");
      });
    });

    const applyCustomRange = () => {
      if (!startInput || !endInput) return;
      if (!startInput.value || !endInput.value) return;
      buttons.forEach((b) => b.classList.remove("active"));
      const label = `${startInput.value} - ${endInput.value}`;
      setRange(label, "custom");
    };
    if (startInput && endInput) {
      startInput.addEventListener("change", applyCustomRange);
      endInput.addEventListener("change", applyCustomRange);
    }

    const active = timeslicer.querySelector(".timeslicer-btn.active");
    if (active) {
      setRange(active.dataset.label || active.textContent.trim(), active.dataset.range || "");
    }
  }

  if (!document.title.toLowerCase().includes("clinicon")) {
    document.title = `Clinicon - ${title}`;
  }
})();
