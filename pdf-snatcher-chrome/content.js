// PDF Snatcher v3 — Content Script (Chrome)
(function () {
  'use strict';

  let root = document.getElementById('pdf-snatcher-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'pdf-snatcher-root';
    document.documentElement.appendChild(root);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function createNotification(pdf) {
    const notif = document.createElement('div');
    notif.className = 'psn-notification';

    const sizeHtml = pdf.size
      ? `<span class="psn-size">${escapeHtml(pdf.size)}</span>`
      : '';

    notif.innerHTML = `
      <div class="psn-header">
        <span class="psn-badge">📄 PDF Found</span>
        <span class="psn-title">PDF Snatcher</span>
        <button class="psn-close" title="Dismiss">✕</button>
      </div>
      <div class="psn-file-row">
        <span class="psn-filename">${escapeHtml(pdf.filename)}</span>
        ${sizeHtml}
      </div>
      <div class="psn-actions">
        <button class="psn-btn psn-primary" data-action="download">
          <span class="psn-btn-icon">⬇</span>
          Download PDF
        </button>
        <button class="psn-btn" data-action="view">
          <span class="psn-btn-icon">👁</span>
          View in Browser
        </button>
        <button class="psn-btn" data-action="nothing">
          <span class="psn-btn-icon">✕</span>
          Dismiss
        </button>
      </div>
      <div class="psn-progress"><div class="psn-progress-bar"></div></div>
    `;

    const timer = setTimeout(() => dismiss(notif), 8000);

    function dismiss(el) {
      clearTimeout(timer);
      el.classList.add('psn-hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }

    notif.querySelector('.psn-close').addEventListener('click', () => dismiss(notif));

    notif.querySelectorAll('.psn-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'download') {
          chrome.runtime.sendMessage({ type: 'DOWNLOAD_PDF', url: pdf.url, filename: pdf.filename });
        } else if (action === 'view') {
          chrome.runtime.sendMessage({ type: 'OPEN_PDF', url: pdf.url });
        }
        dismiss(notif);
      });
    });

    return notif;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PDF_FOUND') {
      const notif = createNotification(msg.pdf);
      root.appendChild(notif);
    }
  });

})();
