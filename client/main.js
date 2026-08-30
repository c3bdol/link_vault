const API_BASE = '/api';

// ===== TAG DEFINITIONS FOR EDIT MODAL & FILTERS =====
// ===== TAG DEFINITIONS FOR EDIT MODAL & FILTERS =====
const TAG_MAP = {
  web: [
    "Broken Access Control",
    "Crypto Failures",
    "Injection (XSS/SQLi)",
    "Insecure Design",
    "Misconfiguration",
    "Vulnerable Components",
    "Auth Failures",
    "Integrity Failures",
    "Logging & Monitoring",
    "SSRF"
  ],
  api: [
    "Broken Object Auth (BOLA)",
    "Broken Auth",
    "Broken Property Auth",
    "Unrestricted Resource",
    "Broken Function Auth",
    "Business Flow Abuse",
    "API SSRF",
    "API Misconfig",
    "Improper Inventory",
    "Unsafe Consumption"
  ],
  personal: [
    "Bookmark",
    "Read Later",
    "Tutorial",
    "Tool",
    "Reference",
    "Inspiration"
  ]
};

// ===== APP STATE =====
let state = {
  links: [],
  allLinks: [], // Cached complete array for tag counts
  activeCategory: 'web',
  activeTag: 'All',
  searchQuery: '',
  showFavoritesOnly: false,
  editingLinkId: null,
  duplicateLinkId: null,
  deletingLinkId: null,
  isFetching: false
};

// ===== DOM ELEMENTS =====
const addForm = document.getElementById('add-link-form');
const linkInput = document.getElementById('link-input');
const addBtn = document.getElementById('add-btn');
const loadingBar = document.getElementById('loading-bar');
const tagFilterBar = document.getElementById('tag-filter-bar');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const favToggleBtn = document.getElementById('fav-toggle-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');
const cardsGrid = document.getElementById('cards-grid');
const emptyState = document.getElementById('empty-state');

// Edit Modal
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editTitleInput = document.getElementById('edit-title');
const editNotesInput = document.getElementById('edit-notes');
const modalTagsContainer = document.getElementById('modal-tags-container');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Duplicate Modal
const duplicateModal = document.getElementById('duplicate-modal');
const cancelDupBtn = document.getElementById('cancel-dup-btn');
const changeCatDupBtn = document.getElementById('change-cat-dup-btn');
const dupModalTitle = document.getElementById('dup-modal-title');
const dupModalLocation = document.getElementById('dup-modal-location');
const dupModalTags = document.getElementById('dup-modal-tags');

// Delete Modal (Pixel Art Style)
const deleteModal = document.getElementById('delete-modal');
const cancelDelBtn = document.getElementById('cancel-del-btn');
const confirmDelBtn = document.getElementById('confirm-del-btn');
const deleteModalText = document.getElementById('delete-modal-text');

// Toast Container
const toastContainer = document.getElementById('toast-container');

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadData();
});

function initEventListeners() {
  // Add Link
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = linkInput.value.trim();
    if (!url) return;
    await handleAddLink(url);
  });

  // Category Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      if (state.activeCategory !== category) {
        state.activeCategory = category;
        state.activeTag = 'All'; // Reset tag filter on category switch
        updateTabStyles();
        renderTagBar();
        renderCards();
      }
    });
  });

  // Search Input with Debounce
  let searchDebounce;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const val = e.target.value;
    clearSearchBtn.classList.toggle('hidden', val.length === 0);
    searchDebounce = setTimeout(() => {
      state.searchQuery = val.trim();
      renderCards();
    }, 250);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    state.searchQuery = '';
    renderCards();
  });

  // Favorites Filter Toggle
  favToggleBtn.addEventListener('click', () => {
    state.showFavoritesOnly = !state.showFavoritesOnly;
    favToggleBtn.classList.toggle('active', state.showFavoritesOnly);
    renderCards();
  });

  // Export / Import JSON
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', handleImportFile);

  // Edit Modal Controls
  cancelEditBtn.addEventListener('click', () => {
    editModal.close();
  });

  // Duplicate Modal Controls
  cancelDupBtn.addEventListener('click', () => {
    duplicateModal.close();
  });

  changeCatDupBtn.addEventListener('click', () => {
    duplicateModal.close();
    if (state.duplicateLinkId) {
      openEditModal(state.duplicateLinkId);
    }
  });

  // Delete Modal Controls (Pixel Style)
  cancelDelBtn.addEventListener('click', () => {
    deleteModal.close();
  });

  confirmDelBtn.addEventListener('click', async () => {
    deleteModal.close();
    if (state.deletingLinkId) {
      await performDeleteLink(state.deletingLinkId);
    }
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveEdit();
  });

  // Category radio change inside modal updates available tags
  document.querySelectorAll('input[name="category"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      renderModalTags(e.target.value, []);
    });
  });

  // Keyboard shortcut: Ctrl+V anywhere focuses input if not in input/textarea
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const active = document.activeElement;
      if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') {
        linkInput.focus();
      }
    }
  });

  // Image & Favicon error handling via capturing listener (avoids unescaped string inline onerror syntax errors)
  cardsGrid.addEventListener('error', (e) => {
    const target = e.target;
    if (target.classList.contains('card-image')) {
      const category = target.dataset.fallbackCategory || 'web';
      const domain = target.dataset.fallbackDomain || '';
      let iconClass = 'heart';
      if (category === 'api') iconClass = 'like';
      if (category === 'personal') iconClass = 'star';

      const placeholder = document.createElement('div');
      placeholder.className = 'card-image-placeholder';
      placeholder.dataset.category = category;
      placeholder.innerHTML = `
        <i class="nes-icon is-medium ${iconClass}"></i>
        <span class="placeholder-domain pixel-text">${escapeHtml(domain)}</span>
      `;
      target.replaceWith(placeholder);
    } else if (target.classList.contains('card-favicon')) {
      target.style.display = 'none';
    }
  }, true);

  // Clipboard focus auto-detect
  window.addEventListener('focus', checkClipboardForUrl);
}

// ===== API CALLS =====

async function loadData() {
  try {
    const res = await fetch(`${API_BASE}/links`);
    if (!res.ok) throw new Error('Failed to load links');
    state.allLinks = await res.json();
    updateTabCounts();
    renderTagBar();
    renderCards();
  } catch (err) {
    showToast('Failed to connect to backend server!', 'error');
  }
}

function normalizeUrl(urlStr) {
  if (!urlStr) return '';
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return urlStr.trim().replace(/\/$/, '').toLowerCase();
  }
}

function openDuplicateModal(link) {
  state.duplicateLinkId = link.id;
  dupModalTitle.textContent = link.title || link.url;
  dupModalLocation.textContent = `📍 Category: ${link.category.toUpperCase()}`;
  dupModalTags.textContent = `🏷️ Tags: ${link.tags && link.tags.length ? link.tags.join(', ') : 'None'}`;
  duplicateModal.showModal();
}

async function handleAddLink(url) {
  // Client-side quick duplicate check
  const normalizedInput = normalizeUrl(url);
  const existingLocal = state.allLinks.find(l => normalizeUrl(l.url) === normalizedInput);
  if (existingLocal) {
    linkInput.value = '';
    openDuplicateModal(existingLocal);
    return;
  }

  if (state.isFetching) return;
  state.isFetching = true;
  loadingBar.classList.remove('hidden');
  addBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (res.status === 409) {
      const data = await res.json();
      linkInput.value = '';
      if (data.existingLink) {
        openDuplicateModal(data.existingLink);
      } else {
        showToast('Link already exists in your vault!', 'info');
      }
      return;
    }

    if (!res.ok) throw new Error('Failed to save link');

    const newLink = await res.json();
    state.allLinks.unshift(newLink);

    // Auto-switch to the detected category
    state.activeCategory = newLink.category;
    state.activeTag = 'All';
    updateTabStyles();
    updateTabCounts();
    renderTagBar();
    renderCards();

    linkInput.value = '';
    showToast(`Saved to ${newLink.category.toUpperCase()}! ⚔️`, 'success');
  } catch (err) {
    showToast('Error fetching link preview. Saved fallback!', 'info');
    await loadData();
  } finally {
    state.isFetching = false;
    loadingBar.classList.add('hidden');
    addBtn.disabled = false;
  }
}

async function toggleFavorite(id) {
  const link = state.allLinks.find(l => l.id === id);
  if (!link) return;

  const newFavStatus = !link.favorite;
  link.favorite = newFavStatus; // Optimistic update

  renderCards();

  try {
    await fetch(`${API_BASE}/links/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: newFavStatus })
    });
  } catch (err) {
    link.favorite = !newFavStatus; // Rollback
    renderCards();
    showToast('Failed to update favorite', 'error');
  }
}

function openDeleteModal(id) {
  const link = state.allLinks.find(l => l.id === id);
  if (!link) return;

  state.deletingLinkId = id;
  deleteModalText.textContent = `Are you sure you want to delete "${link.title || link.url}" from your vault?`;
  deleteModal.showModal();
}

async function performDeleteLink(id) {
  const cardElem = document.querySelector(`.link-card[data-id="${id}"]`);
  if (cardElem) {
    cardElem.classList.add('dismissing');
  }

  try {
    const res = await fetch(`${API_BASE}/links/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');

    state.allLinks = state.allLinks.filter(l => l.id !== id);
    updateTabCounts();
    renderTagBar();
    
    setTimeout(() => {
      renderCards();
      showToast('Link deleted 💀', 'info');
    }, 200);
  } catch (err) {
    showToast('Failed to delete link', 'error');
  }
}

// Edit Modal DOM binding
const editImageInput = document.getElementById('edit-image');

function openEditModal(id) {
  const link = state.allLinks.find(l => l.id === id);
  if (!link) return;

  state.editingLinkId = id;
  editTitleInput.value = link.title || '';
  editNotesInput.value = link.notes || '';
  editImageInput.value = link.image || '';

  // Set selected category radio
  const radio = document.querySelector(`input[name="category"][value="${link.category}"]`);
  if (radio) radio.checked = true;

  renderModalTags(link.category, link.tags || []);
  editModal.showModal();
}

function renderModalTags(category, currentTags) {
  const available = TAG_MAP[category] || [];
  modalTagsContainer.innerHTML = available.map(tag => {
    const checked = currentTags.includes(tag) ? 'checked' : '';
    return `
      <label class="modal-tag-item">
        <input type="checkbox" class="nes-checkbox" name="modal-tags" value="${escapeHtml(tag)}" ${checked} />
        <span>${escapeHtml(tag)}</span>
      </label>
    `;
  }).join('');
}

async function handleSaveEdit() {
  const id = state.editingLinkId;
  if (!id) return;

  const selectedCategory = document.querySelector('input[name="category"]:checked').value;
  const selectedTags = Array.from(document.querySelectorAll('input[name="modal-tags"]:checked')).map(cb => cb.value);
  const updatedTitle = editTitleInput.value.trim();
  const updatedNotes = editNotesInput.value.trim();
  const updatedImage = editImageInput.value.trim();

  try {
    const res = await fetch(`${API_BASE}/links/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: updatedTitle,
        category: selectedCategory,
        tags: selectedTags,
        notes: updatedNotes,
        image: updatedImage
      })
    });

    if (!res.ok) throw new Error('Update failed');

    const updatedLink = await res.json();
    const index = state.allLinks.findIndex(l => l.id === id);
    if (index !== -1) {
      state.allLinks[index] = updatedLink;
    }

    editModal.close();
    updateTabCounts();
    renderTagBar();
    renderCards();
    showToast('Vault link updated ✨', 'success');
  } catch (err) {
    showToast('Failed to update link', 'error');
  }
}

// ===== DOM RENDERERS =====

function updateTabStyles() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const cat = btn.dataset.category;
    btn.classList.toggle('active', cat === state.activeCategory);
  });
}

function updateTabCounts() {
  const counts = { web: 0, api: 0, personal: 0 };
  state.allLinks.forEach(l => {
    if (counts[l.category] !== undefined) {
      counts[l.category]++;
    }
  });

  document.querySelector('#badge-web span').textContent = counts.web;
  document.querySelector('#badge-api span').textContent = counts.api;
  document.querySelector('#badge-personal span').textContent = counts.personal;
}

function renderTagBar() {
  const categoryLinks = state.allLinks.filter(l => l.category === state.activeCategory);
  
  // Calculate counts for each tag in this category
  const tagCounts = {};
  categoryLinks.forEach(l => {
    (l.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  const availableTags = TAG_MAP[state.activeCategory] || [];
  
  let html = `
    <button class="tag-pill ${state.activeTag === 'All' ? 'active' : ''}" data-tag="All">
      ALL (${categoryLinks.length})
    </button>
  `;

  availableTags.forEach(tag => {
    const count = tagCounts[tag] || 0;
    const isActive = state.activeTag === tag;
    html += `
      <button class="tag-pill ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}" title="${escapeHtml(tag)}">
        ${escapeHtml(tag)} (${count})
      </button>
    `;
  });

  tagFilterBar.innerHTML = html;

  tagFilterBar.querySelectorAll('.tag-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTag = btn.dataset.tag;
      renderTagBar();
      renderCards();
    });
  });
}

function renderCards() {
  // Filter by category
  let filtered = state.allLinks.filter(l => l.category === state.activeCategory);

  // Filter by tag
  if (state.activeTag !== 'All') {
    filtered = filtered.filter(l => l.tags && l.tags.includes(state.activeTag));
  }

  // Filter by favorites toggle
  if (state.showFavoritesOnly) {
    filtered = filtered.filter(l => l.favorite);
  }

  // Filter by search query
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(l => 
      (l.title && l.title.toLowerCase().includes(q)) ||
      (l.description && l.description.toLowerCase().includes(q)) ||
      (l.url && l.url.toLowerCase().includes(q)) ||
      (l.notes && l.notes.toLowerCase().includes(q)) ||
      (l.tags && l.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  if (filtered.length === 0) {
    cardsGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  cardsGrid.innerHTML = filtered.map(link => createCardHtml(link)).join('');

  // Attach card event listeners with null safety checks
  cardsGrid.querySelectorAll('.link-card').forEach(card => {
    const id = card.dataset.id;
    const favBtn = card.querySelector('.fav-btn');
    const editBtn = card.querySelector('.edit-btn');
    const delBtn = card.querySelector('.del-btn');
    if (favBtn) favBtn.addEventListener('click', () => toggleFavorite(id));
    if (editBtn) editBtn.addEventListener('click', () => openEditModal(id));
    if (delBtn) delBtn.addEventListener('click', () => openDeleteModal(id));
  });
}

function createCardHtml(link) {
  const isArabic = /[\u0600-\u06FF]/.test(link.title + ' ' + link.description);
  const dirAttr = isArabic ? 'dir="rtl" lang="ar"' : '';

  let domain = link.url;
  try { domain = new URL(link.url).hostname.replace('www.', ''); } catch (e) {}

  let iconClass = 'heart';
  if (link.category === 'api') iconClass = 'like';
  if (link.category === 'personal') iconClass = 'star';

  const placeholderHtml = `
    <div class="card-image-placeholder" data-category="${link.category}">
      <i class="nes-icon is-medium ${iconClass}"></i>
      <span class="placeholder-domain pixel-text">${escapeHtml(domain)}</span>
    </div>
  `;

  // Clean image section without inline onerror JS attributes
  let imageHtml = '';
  if (link.image) {
    imageHtml = `<img src="${escapeHtml(link.image)}" alt="Preview" class="card-image" data-fallback-category="${link.category}" data-fallback-domain="${escapeHtml(domain)}" />`;
  } else {
    imageHtml = placeholderHtml;
  }

  // Tags html
  const tagsHtml = (link.tags || []).map(t => {
    return `<span class="card-tag" title="${escapeHtml(t)}">${escapeHtml(t)}</span>`;
  }).join('');

  // Notes section
  const notesHtml = link.notes ? `<div class="card-notes" ${dirAttr}>📝 ${escapeHtml(link.notes)}</div>` : '';

  // Heart icon class
  const heartClass = link.favorite ? 'heart' : 'heart is-empty';

  return `
    <div class="link-card" data-id="${link.id}" data-category="${link.category}">
      <div class="card-image-wrapper">
        ${imageHtml}
      </div>
      <div class="card-body" ${dirAttr}>
        <div class="card-title-row">
          ${link.favicon ? `<img src="${escapeHtml(link.favicon)}" class="card-favicon" />` : ''}
          <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="card-title">
            ${escapeHtml(link.title || link.url)}
          </a>
        </div>
        <p class="card-description">${escapeHtml(link.description || 'No description available.')}</p>
        
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
        ${notesHtml}

        <div class="card-footer">
          <div class="card-actions">
            <button type="button" class="nes-btn fav-btn" title="Favorite">
              <i class="nes-icon is-small ${heartClass}"></i>
            </button>
            <button type="button" class="nes-btn edit-btn" title="Edit">✏️</button>
            <button type="button" class="nes-btn is-error del-btn" title="Delete">🗑️</button>
          </div>
          <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="nes-btn is-primary pixel-text" style="padding: 4px 8px !important; font-size: 8px !important;">
            OPEN 🔗
          </a>
        </div>
      </div>
    </div>
  `;
}

// ===== UTILITIES =====

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('dismissing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.allLinks, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `link_vault_export_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Vault exported to JSON! 💾', 'success');
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    const res = await fetch(`${API_BASE}/links/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    });

    if (!res.ok) throw new Error('Import failed');

    const result = await res.json();
    state.allLinks = result.links;
    updateTabCounts();
    renderTagBar();
    renderCards();
    showToast(result.message || 'Import successful! 📂', 'success');
  } catch (err) {
    showToast('Failed to import JSON file', 'error');
  } finally {
    importFileInput.value = '';
  }
}

async function checkClipboardForUrl() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text && /^https?:\/\/[^\s]+$/i.test(text.trim())) {
      if (linkInput.value !== text.trim() && !state.allLinks.some(l => l.url === text.trim())) {
        linkInput.value = text.trim();
        showToast('Detected link in clipboard! 📋', 'info');
      }
    }
  } catch (e) {
    // Clipboard permission denied or unavailable
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
