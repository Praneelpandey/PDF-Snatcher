'use strict';

const $ = id => document.getElementById(id);

let currentPdfs = [];
let isWatching = false;

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── HTML escaping ────────────────────────────────────────────────────────────
function esc(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

// ─── Shorten URL ──────────────────────────────────────────────────────────────
function shortUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    let path = host + u.pathname;
    if (path.length > 42) path = path.slice(0, 39) + '...';
    return path;
  } catch {
    return String(url || '').slice(0, 42);
  }
}

// ─── Time formatting ──────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return 'Recently';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return new Date(ts).toLocaleDateString();
}

// ─── Watcher state ────────────────────────────────────────────────────────────
function applyWatcherState(enabled, pdfs = []) {
  isWatching = Boolean(enabled);
  const pdfList = Array.isArray(pdfs) ? pdfs : [];

  const toggle = $('watcherToggle');
  if (toggle) toggle.checked = isWatching;

  const toggleLabel = $('toggleLabel');
  if (toggleLabel) {
    toggleLabel.textContent = isWatching ? 'ON' : 'OFF';
    toggleLabel.className = 'badge-status-pill' + (isWatching ? ' on' : '');
  }

  const statusDot = $('statusDot');
  if (statusDot) {
    statusDot.className = 'pulse-beacon' + (isWatching ? ' on' : '');
  }

  const watcherDesc = $('watcherDesc');
  if (watcherDesc) {
    watcherDesc.textContent = isWatching
      ? 'Live Radar Intercepting Streams'
      : 'Silent capture active';
  }

  const overlay = $('watcherOverlay');
  if (overlay) {
    if (isWatching) {
      overlay.classList.add('visible');
    } else {
      overlay.classList.remove('visible');
    }
  }

  const watcherCount = $('watcherCount');
  if (watcherCount) {
    watcherCount.textContent = `${pdfList.length} captured`;
  }
}

// ─── Render PDF cards ─────────────────────────────────────────────────────────
function renderPdfs(pdfs) {
  currentPdfs = Array.isArray(pdfs) ? pdfs : [];
  const list = $('pdfList');
  const countLabel = $('pdfCountLabel');
  const actionBar = $('actionBar');
  const dlAllBtn = $('downloadAllBtn');
  const watcherCount = $('watcherCount');
  const footerCount = $('footerCount');

  const countText = `${currentPdfs.length} PDF${currentPdfs.length !== 1 ? 's' : ''}`;

  if (countLabel) countLabel.textContent = `${countText} detected`;
  if (watcherCount) watcherCount.textContent = `${currentPdfs.length} captured`;
  if (footerCount) footerCount.textContent = countText;

  if (!list) return;

  if (currentPdfs.length === 0) {
    if (actionBar) actionBar.classList.add('hidden');
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-halo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        </div>
        <div class="empty-title">Ready for Snatching</div>
        <div class="empty-hint">Open any lecture, assignment or document viewer.<br>Protected PDF streams will be intercepted automatically.</div>
      </div>`;
    return;
  }

  if (actionBar) actionBar.classList.remove('hidden');
  if (dlAllBtn) dlAllBtn.disabled = false;
  list.innerHTML = '';

  currentPdfs.forEach(pdf => {
    const card = document.createElement('div');
    card.className = 'pdf-card';

    const sizeHtml = pdf.size
      ? `<span class="pdf-size">${esc(pdf.size)}</span>`
      : '';

    card.innerHTML = `
      <div class="pdf-card-body">
        <div class="pdf-icon"><span class="pdf-icon-label">PDF</span></div>
        <div class="pdf-info">
          <div class="pdf-name" title="${esc(pdf.filename)}">${esc(pdf.filename)}</div>
          <div class="pdf-meta-row">
            ${sizeHtml}
            <span class="pdf-url-short" title="${esc(pdf.url)}">${esc(shortUrl(pdf.url))}</span>
          </div>
        </div>
      </div>
      <div class="pdf-actions">
        <button class="pdf-act act-dl" data-url="${esc(pdf.url)}" data-filename="${esc(pdf.filename)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
        <button class="pdf-act act-view" data-url="${esc(pdf.url)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </button>
        <button class="pdf-act act-copy" data-url="${esc(pdf.url)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
    `;

    const dlBtn = card.querySelector('.act-dl');
    if (dlBtn) {
      dlBtn.addEventListener('click', e => {
        const btn = e.currentTarget;
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_PDF', url: btn.dataset.url, filename: btn.dataset.filename
        }, res => {
          if (res && res.ok) toast('⬇ Downloading file...');
          else toast('❌ Download failed');
        });
      });
    }

    const viewBtn = card.querySelector('.act-view');
    if (viewBtn) {
      viewBtn.addEventListener('click', e => {
        chrome.runtime.sendMessage({ type: 'OPEN_PDF', url: e.currentTarget.dataset.url });
      });
    }

    const copyBtn = card.querySelector('.act-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', e => {
        navigator.clipboard.writeText(e.currentTarget.dataset.url).then(() => toast('✓ Direct URL copied!'));
      });
    }

    list.appendChild(card);
  });
}

// ─── History ──────────────────────────────────────────────────────────────────
function loadHistory() {
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, res => {
    if (!res) return;
    renderHistory(res.history || []);
  });
}

function renderHistory(items) {
  const list = $('historyList');
  if (!list) return;

  const historyItems = Array.isArray(items) ? items : [];

  if (!historyItems.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-halo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
        </div>
        <div class="empty-title">No Saved Records</div>
        <div class="empty-hint">PDFs you capture will be stored here safely<br>so you never lose course materials.</div>
      </div>`;
    return;
  }

  list.innerHTML = '';
  historyItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const sizeHtml = item.size ? `<span class="pdf-size">${esc(item.size)}</span>` : '';

    card.innerHTML = `
      <div class="pdf-icon" style="width:34px;height:38px;">
        <span class="pdf-icon-label">PDF</span>
      </div>
      <div class="pdf-info">
        <div class="pdf-name" title="${esc(item.filename)}">${esc(item.filename)}</div>
        <div class="pdf-meta-row">
          ${sizeHtml}
          <span class="history-date">${timeAgo(item.savedAt || item.timestamp)}</span>
        </div>
      </div>
      <button class="history-dl" title="Download again">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    `;

    const dlBtn = card.querySelector('.history-dl');
    if (dlBtn) {
      dlBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_PDF', url: item.url, filename: item.filename
        }, res => {
          if (res && res.ok) toast('⬇ Downloading file...');
          else toast('❌ Download failed');
        });
      });
    }

    list.appendChild(card);
  });
}

// ─── Load state ───────────────────────────────────────────────────────────────
function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, res => {
    if (!res) return;
    renderPdfs(res.pdfs || []);
    applyWatcherState(res.watcherEnabled, res.pdfs || []);
  });
}

// ─── Initialize UI once DOM is loaded ─────────────────────────────────────────
function init() {
  // Tab switching (supports .segment-btn and .tab)
  document.querySelectorAll('.segment-btn, .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.segment-btn, .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab || '';
      const panel = $('panel' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if (panel) panel.classList.add('active');
      if (tabName === 'history') loadHistory();
    });
  });

  // Watcher toggle
  const watcherToggle = $('watcherToggle');
  if (watcherToggle) {
    watcherToggle.addEventListener('change', e => {
      const enabled = e.target.checked;
      chrome.runtime.sendMessage({ type: 'SET_WATCHER', enabled }, () => {
        chrome.runtime.sendMessage({ type: 'GET_STATE' }, res => {
          if (!res) return;
          applyWatcherState(enabled, res.pdfs || []);
          renderPdfs(res.pdfs || []);
        });
      });
    });
  }

  // Watcher off button
  const watcherOffBtn = $('watcherOffBtn');
  if (watcherOffBtn) {
    watcherOffBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SET_WATCHER', enabled: false }, () => {
        applyWatcherState(false, currentPdfs);
      });
    });
  }

  // Scan button
  const scanBtn = $('scanBtn');
  if (scanBtn) {
    scanBtn.addEventListener('click', () => {
      scanBtn.classList.add('scanning');
      scanBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'SCAN_PAGE' }, res => {
        scanBtn.classList.remove('scanning');
        scanBtn.disabled = false;
        if (res && res.found > 0) {
          toast(`🔍 Scanned ${res.found} stream link${res.found !== 1 ? 's' : ''}`);
        } else {
          toast('No new PDF links found in DOM');
        }
        loadState();
      });
    });
  }

  // Download all button
  const downloadAllBtn = $('downloadAllBtn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', () => {
      if (currentPdfs.length === 0) return;
      downloadAllBtn.disabled = true;
      const originalHtml = downloadAllBtn.innerHTML;
      downloadAllBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span>Snatching...</span>
      `;
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL' }, res => {
        downloadAllBtn.disabled = false;
        downloadAllBtn.innerHTML = originalHtml;
        if (res && res.ok) toast(`⬇ Successfully grabbed ${res.count} PDF${res.count !== 1 ? 's' : ''}`);
      });
    });
  }

  // Clear button
  const clearBtn = $('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_PDFS' }, () => {
        renderPdfs([]);
        toast('✓ Cleared');
      });
    });
  }

  // Clear history button
  const clearHistoryBtn = $('clearHistoryBtn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
        renderHistory([]);
        toast('✓ Vault cleared');
      });
    });
  }

  // Initial load
  loadState();
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && (changes.pdfMap || changes.lastUpdate)) {
    loadState();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
