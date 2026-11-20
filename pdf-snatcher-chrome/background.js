// ─── PDF Snatcher v3 — Chrome MV3 Service Worker ──────────────────────────────
// Optimized for e-learning portals (Parul University, Moodle, Canvas, Blackboard)
// Persists state to survive service worker kills.

// ─── Storage helpers ──────────────────────────────────────────────────────────
async function getPdfMap() {
  const data = await chrome.storage.session.get('pdfMap');
  return data.pdfMap || {};
}

async function setPdfMap(map) {
  await chrome.storage.session.set({ pdfMap: map });
}

async function getWatcherEnabled() {
  const data = await chrome.storage.local.get('watcherEnabled');
  return data.watcherEnabled || false;
}

async function getNotifiedUrls() {
  const data = await chrome.storage.session.get('notifiedUrls');
  return new Set(data.notifiedUrls || []);
}

async function addNotifiedUrl(url) {
  const set = await getNotifiedUrls();
  set.add(url);
  await chrome.storage.session.set({ notifiedUrls: [...set] });
}

async function getHistory() {
  const data = await chrome.storage.local.get('pdfHistory');
  return data.pdfHistory || [];
}

async function addToHistory(entry) {
  const history = await getHistory();
  if (history.find(h => h.url === entry.url)) return;
  history.unshift({ ...entry, savedAt: Date.now() });
  if (history.length > 200) history.length = 200;
  await chrome.storage.local.set({ pdfHistory: history });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractFilename(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = decodeURIComponent(parts[i]);
      if (part.toLowerCase().endsWith('.pdf')) return part;
      if (part.length > 3 && !part.includes('=')) return part + '.pdf';
    }
    const params = u.searchParams;
    for (const [key, val] of params) {
      if (val.toLowerCase().endsWith('.pdf')) return decodeURIComponent(val);
      if (key === 'file' || key === 'filename' || key === 'name') {
        return decodeURIComponent(val) + (val.toLowerCase().endsWith('.pdf') ? '' : '.pdf');
      }
    }
    return 'document.pdf';
  } catch {
    return 'document.pdf';
  }
}

function looksLikePdfUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.endsWith('.pdf')) return true;
  if (lower.includes('.pdf?') || lower.includes('.pdf#')) return true;
  if (lower.includes('/pdf/') || lower.includes('/pdfs/')) return true;
  if (lower.includes('getpdf') || lower.includes('viewpdf') || lower.includes('downloadpdf')) return true;
  if (lower.includes('format=pdf') || lower.includes('type=pdf') || lower.includes('output=pdf')) return true;
  if (lower.includes('pdf') && (lower.includes('download') || lower.includes('file') || lower.includes('doc'))) return true;
  // Moodle / Parul University / e-learning specific
  if (lower.includes('digitaloceanspaces') && lower.includes('.pdf')) return true;
  if (lower.includes('pluginfile.php') && lower.includes('.pdf')) return true;
  if (lower.includes('mod/resource/') || lower.includes('mod/folder/')) return true;
  if (lower.includes('draftfile.php') || lower.includes('forcedownload')) return true;
  if (lower.includes('content/enforced/') && lower.includes('.pdf')) return true;
  if (lower.includes('/bbcswebdav/') && lower.includes('.pdf')) return true;
  return false;
}

function isLikelyNoise(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  const noisy = ['analytics', 'tracking', 'pixel', 'beacon', '.png', '.jpg', '.jpeg',
    '.gif', '.svg', '.woff', '.woff2', '.js?', '.css?', 'favicon', 'googleapis.com/css',
    'doubleclick', 'googletagmanager', 'facebook.com/tr', 'google-analytics',
    'hotjar', 'clarity.ms', 'sentry.io'];
  return noisy.some(n => lower.includes(n));
}

async function updateBadge(tabId) {
  try {
    const map = await getPdfMap();
    const count = (map[tabId] || []).length;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#f97316', tabId });
  } catch { /* tab may have closed */ }
}

// ─── PDF validation with size extraction ──────────────────────────────────────
async function validatePdf(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-1023' },
      credentials: 'include'
    });
    if (!res.ok && res.status !== 206) return await headValidate(url);

    const ct = res.headers.get('content-type') || '';
    const cl = res.headers.get('content-length') || res.headers.get('content-range');
    let size = null;
    if (cl) {
      const rangeMatch = cl.match(/\/(\d+)/);
      size = rangeMatch ? parseInt(rangeMatch[1]) : parseInt(cl);
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 5 &&
        bytes[0] === 0x25 && bytes[1] === 0x50 &&
        bytes[2] === 0x44 && bytes[3] === 0x46 &&
        bytes[4] === 0x2D) {
      return { valid: true, size };
    }
    if (ct.includes('application/pdf')) return { valid: true, size };
    return { valid: false };
  } catch {
    return await headValidate(url);
  }
}

async function headValidate(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
    const ct = res.headers.get('content-type') || '';
    const cl = res.headers.get('content-length');
    if (ct.includes('application/pdf')) {
      return { valid: true, size: cl ? parseInt(cl) : null };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─── Write lock to prevent race conditions ────────────────────────────────────
let writeLock = Promise.resolve();
function withLock(fn) {
  writeLock = writeLock.then(fn).catch(() => {});
  return writeLock;
}

// ─── Record PDF ───────────────────────────────────────────────────────────────
async function recordPdf(tabId, url) {
  if (!tabId || tabId < 0) return;
  if (isLikelyNoise(url)) return;

  return withLock(async () => {
    const map = await getPdfMap();
    if (!map[tabId]) map[tabId] = [];
    if (map[tabId].find(p => p.url === url)) return;

    const result = await validatePdf(url);
    if (!result.valid) return;

    const entry = {
      url,
      filename: extractFilename(url),
      size: formatSize(result.size),
      sizeBytes: result.size,
      timestamp: Date.now()
    };
    map[tabId].push(entry);
    await setPdfMap(map);
    await updateBadge(tabId);
    await addToHistory(entry);

    await chrome.storage.session.set({ lastUpdate: Date.now() });

    const watcherEnabled = await getWatcherEnabled();
    const notified = await getNotifiedUrls();
    if (watcherEnabled && !notified.has(url)) {
      await addNotifiedUrl(url);
      chrome.tabs.sendMessage(tabId, { type: 'PDF_FOUND', pdf: entry }).catch(() => {});
    }
  });
}

// ─── Network listeners ────────────────────────────────────────────────────────
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (looksLikePdfUrl(details.url)) recordPdf(details.tabId, details.url);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || !details.responseHeaders) return;
    for (const h of details.responseHeaders) {
      const name = h.name.toLowerCase();
      if (name === 'content-type' && h.value.toLowerCase().includes('application/pdf')) {
        recordPdf(details.tabId, details.url); break;
      }
      if (name === 'content-disposition' && h.value.toLowerCase().includes('.pdf')) {
        recordPdf(details.tabId, details.url); break;
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getPdfMap();
  delete map[tabId];
  await setPdfMap(map);
});

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'GET_STATE') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        const map = await getPdfMap();
        const watcherEnabled = await getWatcherEnabled();
        sendResponse({ watcherEnabled, pdfs: (tabId ? map[tabId] : []) || [], tabId });
      } catch (err) {
        sendResponse({ watcherEnabled: false, pdfs: [], error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'GET_HISTORY') {
    (async () => {
      try {
        const history = await getHistory();
        sendResponse({ history });
      } catch (err) {
        sendResponse({ history: [] });
      }
    })();
    return true;
  }

  if (msg.type === 'CLEAR_HISTORY') {
    (async () => {
      await chrome.storage.local.set({ pdfHistory: [] });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'SET_WATCHER') {
    (async () => {
      try {
        await chrome.storage.local.set({ watcherEnabled: msg.enabled });
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'WATCHER_STATE', enabled: msg.enabled }).catch(() => {});
        });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'DOWNLOAD_PDF') {
    chrome.downloads.download(
      { url: msg.url, filename: msg.filename, saveAs: !msg.silent },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );
    return true;
  }

  if (msg.type === 'DOWNLOAD_ALL') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        const map = await getPdfMap();
        const pdfs = (tabId ? map[tabId] : []) || [];
        let count = 0;
        for (const pdf of pdfs) {
          try {
            await chrome.downloads.download({ url: pdf.url, filename: pdf.filename, saveAs: false });
            count++;
          } catch { /* skip individual failed */ }
        }
        sendResponse({ ok: true, count });
      } catch (err) {
        sendResponse({ ok: false, count: 0, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'OPEN_PDF') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'CLEAR_PDFS') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (tabId) {
          const map = await getPdfMap();
          map[tabId] = [];
          await setPdfMap(map);
          chrome.action.setBadgeText({ text: '', tabId });
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'SCAN_PAGE') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) {
          sendResponse({ found: 0, validated: 0 });
          return;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const found = [];
            document.querySelectorAll('a[href]').forEach(a => {
              if (a.href && a.href.toLowerCase().includes('.pdf')) found.push(a.href);
            });
            document.querySelectorAll('iframe[src], embed[src]').forEach(el => {
              const src = el.src;
              if (src && (src.toLowerCase().includes('.pdf') || src.toLowerCase().includes('pdf'))) found.push(src);
            });
            document.querySelectorAll('object[data]').forEach(el => {
              const d = el.data;
              if (d && d.toLowerCase().includes('.pdf')) found.push(d);
            });
            document.querySelectorAll('a[href*="pluginfile"], a[href*="mod/resource"]').forEach(a => {
              if (a.href && !found.includes(a.href)) found.push(a.href);
            });
            document.querySelectorAll('a[href]').forEach(a => {
              const text = (a.textContent || '').toLowerCase();
              if ((text.includes('download') || text.includes('pdf') || text.includes('view'))
                  && a.href && !a.href.startsWith('javascript:') && !found.includes(a.href)) {
                found.push(a.href);
              }
            });
            document.querySelectorAll('[data-url], [data-href], [data-src], [data-file]').forEach(el => {
              const val = el.dataset.url || el.dataset.href || el.dataset.src || el.dataset.file;
              if (val && val.toLowerCase().includes('.pdf') && !found.includes(val)) found.push(val);
            });
            return [...new Set(found)];
          }
        });
        const urls = results?.[0]?.result || [];
        await Promise.all(urls.map(url => recordPdf(tabId, url)));
        const map = await getPdfMap();
        const actualCount = (map[tabId] || []).length;
        sendResponse({ found: urls.length, validated: actualCount });
      } catch (err) {
        sendResponse({ found: 0, validated: 0, error: err.message });
      }
    })();
    return true;
  }
});
