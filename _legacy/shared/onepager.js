// shared/onepager.js
(function () {
  function ensureRoot() {
    let root = document.getElementById('onepagerRoot');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'onepagerRoot';
    root.className = 'op-root';
    root.innerHTML = `
      <div class="op-page">
        <header class="op-header">
          <div class="op-header-center">
            <div class="op-logo">
              <img id="opLogo" alt="CliniCon Logo" />
            </div>
            <div class="op-title">
              <div class="op-h1" id="opTitle"></div>
              <div class="op-sub" id="opSubtitle"></div>
            </div>
          </div>
        </header>

        <main class="op-grid" id="opGrid"></main>

        <footer class="op-footer">
          <table class="op-footer-table">
            <colgroup>
              <col style="width:18%;" />
              <col style="width:30%;" />
              <col style="width:20%;" />
              <col style="width:17%;" />
              <col style="width:15%;" />
            </colgroup>
            <tr>
              <th>Dokumentnummer</th>
              <td id="opDocNumber">DOC-XXX</td>
              <th>Freigegeben von</th>
              <td id="opApprovedBy">Name, Funktion</td>
              <td class="op-qr-cell" id="opQrCell" rowspan="2">
                <div class="op-qr-block">
                  <div class="op-qr" id="opQrBox"></div>
                  <div class="op-qr-caption" id="opQrTitle"></div>
                </div>
              </td>
            </tr>
            <tr>
              <th>Version</th>
              <td id="opVersion">x.y</td>
              <th>Seite</th>
              <td id="opPage">1 / 1</td>
            </tr>
          </table>
        </footer>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  function renderSections(sections) {
    const grid = document.getElementById('opGrid');
    if(!grid) return;
    grid.innerHTML = '';

    sections.forEach(sec => {
      if(!sec || sec.type === 'qr') return;
      const card = document.createElement('section');
      card.className = 'op-card';
      if (sec.variant) card.classList.add(`op-card--${sec.variant}`);
      if (sec.emphasis) card.classList.add('op-card--emphasis');
      const title = document.createElement('div');
      title.className = 'op-card-title';
      title.textContent = sec.heading || '';
      card.appendChild(title);

      const table = document.createElement('table');
      table.className = 'op-table';

      (sec.rows || []).forEach(r => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const td2 = document.createElement('td');
        td1.textContent = r.label ?? '';
        td2.textContent = (r.value ?? '-');
        tr.appendChild(td1); tr.appendChild(td2);
        table.appendChild(tr);
      });

      card.appendChild(table);

      if (sec.note) {
        const note = document.createElement('div');
        note.className = 'op-note';
        note.textContent = sec.note;
        card.appendChild(note);
      }

      grid.appendChild(card);
    });
  }

  function renderQRCode(deepLink) {
    const qrBox = document.getElementById('opQrBox');
    if (!qrBox) return;
    qrBox.innerHTML = '';

    if (!window.QRCode) {
      qrBox.textContent = 'QR-Code Bibliothek fehlt (QRCode).';
      return;
    }

    new QRCode(qrBox, {
      text: deepLink,
      width: 88,
      height: 88,
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  // Public API
  window.OnePager = {
    /**
     * data = {
     *   title, subtitle, logoSrc, logoAlt,
     *   doc: { number, approvedBy, version, page },
     *   sections: [{ heading, rows:[{label,value}], note? }],
     *   qr: { deepLink, title }
     * }
     */
    exportPDF: function (data) {
      ensureRoot();

      setText('opTitle', data.title || 'Dokumententitel');

      const subtitleEl = document.getElementById('opSubtitle');
      if(subtitleEl){
        if(data.subtitle){
          subtitleEl.textContent = data.subtitle;
          subtitleEl.style.display = '';
        }else{
          subtitleEl.textContent = '';
          subtitleEl.style.display = 'none';
        }
      }

      const logo = document.getElementById('opLogo');
      if(logo){
        logo.src = data.logoSrc || 'assets/Bilder/CliniConLogo.png';
        logo.alt = data.logoAlt || 'CliniCon Logo';
      }

      const doc = data.doc || {};
      setText('opDocNumber', doc.number || 'DOC-XXX');
      setText('opApprovedBy', doc.approvedBy || 'Name, Funktion');
      setText('opVersion', doc.version || 'x.y');
      setText('opPage', doc.page || '1 / 1');

      renderSections(data.sections || []);

      const qrSection = (data.sections || []).find(s => s && s.type === 'qr' && s.deepLink);
      const qrData = data.qr || (qrSection ? { deepLink: qrSection.deepLink, title: qrSection.qrTitle || qrSection.heading } : {});
      const qrLink = qrData.deepLink || window.location.href;
      const qrTitle = qrData.title || '';
      setText('opQrTitle', qrTitle);
      renderQRCode(qrLink);

      setTimeout(() => window.print(), 150);
    }
  };
})();
