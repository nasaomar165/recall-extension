function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch (e) {}
  return "#"; // Fallback for invalid or dangerous URLs
}

// ===== Local Storage Setup =====
const STORAGE_KEY = 'recall_items';
let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

let currentFilter = 'all';
let currentTag = null;
let searchQuery = '';
let formTags = [];
let contextItemId = null;
let deleteTargetId = null;
let reminderTimers = {};

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===== Initialize App =====
function initApp() {
  if (items.length === 0) seedDemoData();
  setupUI();
  renderAll();
  setupReminderTimers();
}

function seedDemoData() {
  items = [
    { id: generateId(), title: 'Meeting notes: Q4 planning', content: 'Discuss budget allocation.\n- Marketing needs 20% increase\n- R&D prototyping phase starts November', type: 'note', tags: ['work', 'meetings'], url: '', reminderTime: '', createdAt: Date.now() - 3600000, updatedAt: Date.now() - 3600000 },
    { id: generateId(), title: 'Call dentist', content: 'Dr. Martinez — (555) 234-5678', type: 'reminder', tags: ['health'], url: '', reminderTime: new Date(Date.now() + 7200000).toISOString().slice(0, 16), createdAt: Date.now() - 7200000, updatedAt: Date.now() - 7200000 },
    { id: generateId(), title: 'CSS Grid Guide', content: 'Excellent reference for layouts.', type: 'bookmark', tags: ['dev', 'css'], url: 'https://css-tricks.com/snippets/css/complete-guide-grid/', reminderTime: '', createdAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000 }
  ];
  saveItems();
}

// ===== UI Setup =====
function setupUI() {
  updateClock();
  setInterval(updateClock, 30000);
  
  // Notifications
  const notifBanner = document.getElementById('notifBanner');
  if ('Notification' in window && Notification.permission === 'default') {
    notifBanner.classList.add('visible');
  }
  notifBanner.addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    notifBanner.classList.remove('visible');
    showToast(perm === 'granted' ? 'Notifications enabled' : 'Notifications blocked', perm === 'granted' ? 'success' : 'error');
  });

  // Filters
  document.getElementById('statsRow').addEventListener('click', e => {
    const chip = e.target.closest('.stat-chip');
    if (!chip) return;
    currentFilter = chip.dataset.filter;
    document.querySelectorAll('.stat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderCards();
  });

  document.getElementById('tagsFilter').addEventListener('click', e => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    currentTag = currentTag === pill.dataset.tag ? null : pill.dataset.tag;
    renderTags();
    renderCards();
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.classList.toggle('visible', searchQuery.length > 0);
    renderCards();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = ''; searchQuery = ''; searchClear.classList.remove('visible'); renderCards(); searchInput.focus();
  });

  // Form Modal
  document.getElementById('fabBtn').addEventListener('click', () => openForm());
  document.getElementById('typeSelector').addEventListener('click', e => {
    const opt = e.target.closest('.type-option');
    if (!opt) return;
    selectedType = opt.dataset.type;
    updateTypeUI();
  });
  document.getElementById('tagsTextInput').addEventListener('keydown', handleTagInput);
  document.getElementById('tagsInputWrap').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-tag]');
    if (!btn) return;
    formTags.splice(parseInt(btn.dataset.removeTag), 1);
    renderFormTags();
  });
  document.getElementById('itemForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('formCancel').addEventListener('click', closeForm);
  document.getElementById('formModal').addEventListener('click', e => { if (e.target === document.getElementById('formModal')) closeForm(); });

  // Cards Interaction
  document.getElementById('cardList').addEventListener('click', e => {
    const menuBtn = e.target.closest('.card-menu-btn');
    if (menuBtn) { e.stopPropagation(); contextItemId = menuBtn.dataset.menuId; showContextMenu(e, contextItemId); return; }
    const card = e.target.closest('.item-card');
    if (card) openDetail(card.dataset.id);
  });

  // Context Menu
  document.addEventListener('click', e => { if (!document.getElementById('contextMenu').contains(e.target)) hideContextMenu(); });
  document.getElementById('contextMenu').addEventListener('click', handleContextAction);

  // Confirm Dialog
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmDelete').addEventListener('click', executeDelete);
  document.getElementById('confirmDialog').addEventListener('click', e => { if (e.target === document.getElementById('confirmDialog')) closeConfirm(); });
  document.getElementById('detailModal').addEventListener('click', e => { if (e.target === document.getElementById('detailModal')) closeDetail(); });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('confirmDialog').classList.contains('visible')) closeConfirm();
      else if (document.getElementById('formModal').classList.contains('visible')) closeForm();
      else if (document.getElementById('detailModal').classList.contains('visible')) closeDetail();
      else hideContextMenu();
    }
  });
}

// ===== Render Functions =====
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="material-icons-round">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 250); }, 2800);
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

function formatDate(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 172800000) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatReminderTime(ts) {
  if (!ts) return '';
  const d = new Date(ts); const isPast = d < new Date();
  return { text: (isPast ? 'Overdue: ' : '') + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), overdue: isPast };
}

function getAllTags() { const t = new Set(); items.forEach(i => (i.tags || []).forEach(tag => t.add(tag))); return Array.from(t).sort(); }

function getFilteredItems() {
  let filtered = items;
  if (currentFilter !== 'all') filtered = filtered.filter(i => i.type === currentFilter);
  if (currentTag) filtered = filtered.filter(i => (i.tags || []).includes(currentTag));
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(i => (i.title||'').toLowerCase().includes(q) || (i.content||'').toLowerCase().includes(q) || (i.tags||[]).some(t => t.toLowerCase().includes(q)));
  }
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

function renderCounts() {
  document.getElementById('countAll').textContent = items.length;
  document.getElementById('countNote').textContent = items.filter(i => i.type === 'note').length;
  document.getElementById('countReminder').textContent = items.filter(i => i.type === 'reminder').length;
  document.getElementById('countBookmark').textContent = items.filter(i => i.type === 'bookmark').length;
}

function renderTags() {
  const container = document.getElementById('tagsFilter');
  const tags = getAllTags();
  if (!tags.length) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  container.innerHTML = tags.map(t => `<button class="tag-pill ${currentTag === t ? 'active' : ''}" data-tag="${t}">${t}</button>`).join('');
}

function renderCards() {
  const list = document.getElementById('cardList');
  const filtered = getFilteredItems();
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="material-icons-round">inventory_2</span><h3>Nothing saved yet</h3><p>Tap + to save a note, reminder, or bookmark</p></div>`;
    return;
  }
  const typeIcons = { note: 'edit_note', reminder: 'alarm', bookmark: 'bookmark' };
  const typeLabels = { note: 'Note', reminder: 'Reminder', bookmark: 'Bookmark' };
  
  list.innerHTML = filtered.map(item => {
    let extra = '';
    if (item.type === 'reminder' && item.reminderTime) { const rt = formatReminderTime(item.reminderTime); extra = `<div class="card-reminder-time ${rt.overdue ? 'overdue' : ''}"><span class="material-icons-round">schedule</span>${rt.text}</div>`; }
    if (item.type === 'bookmark' && item.url) { try { const u = new URL(item.url); extra = `<div class="card-bookmark-url"><span class="material-icons-round">link</span>${u.hostname}</div>`; } catch { extra = `<div class="card-bookmark-url"><span class="material-icons-round">link</span>${item.url}</div>`; }}
    const tagsHtml = (item.tags||[]).map(t => `<span class="card-tag">${t}</span>`).join('');
    return `<article class="item-card" data-type="${item.type}" data-id="${item.id}" tabindex="0">
      <div class="card-top"><span class="card-type-badge ${item.type}"><span class="material-icons-round">${typeIcons[item.type]}</span>${typeLabels[item.type]}</span>
      <button class="card-menu-btn" data-menu-id="${item.id}"><span class="material-icons-round" style="font-size:18px">more_vert</span></button></div>
      ${extra}<div class="card-title">${escapeHtml(item.title)}</div>
      ${item.content ? `<div class="card-preview">${escapeHtml(item.content)}</div>` : ''}
      <div class="card-meta"><div class="card-tags">${tagsHtml}</div><span class="card-date">${formatDate(item.createdAt)}</span></div></article>`;
  }).join('');
}

function renderAll() { renderCounts(); renderTags(); renderCards(); }

// ===== Form & Modals =====
let selectedType = 'note';

function openForm(item = null) {
  formTags = item ? [...(item.tags || [])] : [];
  selectedType = item ? item.type : 'note';
  document.getElementById('editId').value = item ? item.id : '';
  document.getElementById('itemTitle').value = item ? item.title : '';
  document.getElementById('itemContent').value = item ? item.content : '';
  document.getElementById('itemUrl').value = item ? (item.url || '') : '';
  document.getElementById('itemReminderTime').value = item ? (item.reminderTime || '') : '';
  updateTypeUI(); renderFormTags();
  document.getElementById('formModal').classList.add('visible');
  setTimeout(() => document.getElementById('itemTitle').focus(), 300);
}

function closeForm() { document.getElementById('formModal').classList.remove('visible'); document.getElementById('itemForm').reset(); formTags = []; }

function updateTypeUI() {
  document.querySelectorAll('.type-option').forEach(o => o.classList.toggle('selected', o.dataset.type === selectedType));
  document.getElementById('urlGroup').style.display = selectedType === 'bookmark' ? 'block' : 'none';
  document.getElementById('reminderTimeGroup').style.display = selectedType === 'reminder' ? 'block' : 'none';
}

function handleTagInput(e) {
  if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v && !formTags.includes(v) && formTags.length < 8) { formTags.push(v); renderFormTags(); } e.target.value = ''; }
  if (e.key === 'Backspace' && e.target.value === '' && formTags.length > 0) { formTags.pop(); renderFormTags(); }
}

function renderFormTags() {
  const wrap = document.getElementById('tagsInputWrap');
  const input = document.getElementById('tagsTextInput');
  wrap.querySelectorAll('.form-tag-chip').forEach(c => c.remove());
  formTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'form-tag-chip';
    chip.innerHTML = `${escapeHtml(tag)}<button type="button" data-remove-tag="${i}">&times;</button>`;
    wrap.insertBefore(chip, input);
  });
}

function handleFormSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('editId').value;
  const title = document.getElementById('itemTitle').value.trim();
  const content = document.getElementById('itemContent').value.trim();
  const url = document.getElementById('itemUrl').value.trim();
  const reminderTime = document.getElementById('itemReminderTime').value;
  if (!title) return;
  
  if (selectedType === 'bookmark' && url) { try { new URL(url); } catch { showToast('Invalid URL', 'error'); return; } }

  if (editId) {
    const item = items.find(i => i.id === editId);
    if (item) { item.title = title; item.content = content; item.type = selectedType; item.tags = [...formTags]; item.url = selectedType === 'bookmark' ? url : ''; item.reminderTime = selectedType === 'reminder' ? reminderTime : ''; item.updatedAt = Date.now(); showToast('Item updated', 'success'); }
  } else {
    items.push({ id: generateId(), title, content, type: selectedType, tags: [...formTags], url: selectedType === 'bookmark' ? url : '', reminderTime: selectedType === 'reminder' ? reminderTime : '', createdAt: Date.now(), updatedAt: Date.now() });
    showToast(`${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} saved`, 'success');
  }
  saveItems(); closeForm(); renderAll(); setupReminderTimers();
}

// ===== Detail & Context =====
function openDetail(id) {
  const item = items.find(i => i.id === id); if (!item) return;
  const typeLabels = { note: 'Note', reminder: 'Reminder', bookmark: 'Bookmark' };
  const typeIcons = { note: 'edit_note', reminder: 'alarm', bookmark: 'bookmark' };
  let metaHtml = `<span class="card-type-badge ${item.type}"><span class="material-icons-round">${typeIcons[item.type]}</span>${typeLabels[item.type]}</span><span class="card-date">${new Date(item.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>`;
  let extraHtml = '';
  if (item.type === 'bookmark' && item.url) extraHtml = `<a class="detail-url" href="${sanitizeUrl(item.url)}" target="_blank" rel="noopener noreferrer"><span class="material-icons-round">open_in_new</span>${escapeHtml(item.url)}</a>`;
  if (item.type === 'reminder' && item.reminderTime) { const rt = formatReminderTime(item.reminderTime); extraHtml = `<div class="detail-reminder-info"><span class="material-icons-round">schedule</span>${rt.text}</div>`; }
  const tagsHtml = (item.tags||[]).map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');

  document.getElementById('detailContent').innerHTML = `<div class="detail-meta">${metaHtml}</div><div class="detail-title">${escapeHtml(item.title)}</div>${extraHtml}${item.content ? `<div class="detail-body">${escapeHtml(item.content)}</div>` : ''}${tagsHtml ? `<div class="card-tags" style="margin-top:12px">${tagsHtml}</div>` : ''}<div class="detail-actions"><button class="btn btn-secondary" id="btnEditDetail"><span class="material-icons-round" style="font-size:16px">edit</span> Edit</button><button class="btn btn-danger" id="btnDeleteDetail"><span class="material-icons-round" style="font-size:16px">delete</span> Delete</button></div>`;
  
  document.getElementById('btnEditDetail').onclick = () => { openForm(item); closeDetail(); };
  document.getElementById('btnDeleteDetail').onclick = () => { deleteTargetId = item.id; closeDetail(); document.getElementById('confirmDialog').classList.add('visible'); };
  document.getElementById('detailModal').classList.add('visible');
}

function closeDetail() { document.getElementById('detailModal').classList.remove('visible'); }

function showContextMenu(e, id) {
  const menu = document.getElementById('contextMenu');
  menu.style.left = Math.min(e.clientX - 10, 380) + 'px';
  menu.style.top = Math.min(e.clientY - 10, 400) + 'px';
  menu.classList.add('visible');
}

function hideContextMenu() { document.getElementById('contextMenu').classList.remove('visible'); contextItemId = null; }

function handleContextAction(e) {
  const btn = e.target.closest('button'); if (!btn || !contextItemId) return;
  const item = items.find(i => i.id === contextItemId); if (!item) { hideContextMenu(); return; }
  switch (btn.dataset.action) {
    case 'view': openDetail(item.id); break;
    case 'edit': openForm(item); break;
    case 'copy': navigator.clipboard.writeText(item.title + (item.content ? '\n\n' + item.content : '')).then(() => showToast('Copied', 'info')); break;
    case 'delete': deleteTargetId = item.id; document.getElementById('confirmDialog').classList.add('visible'); break;
  }
  hideContextMenu();
}

function closeConfirm() { document.getElementById('confirmDialog').classList.remove('visible'); deleteTargetId = null; }
function executeDelete() {
  if (deleteTargetId) { items = items.filter(i => i.id !== deleteTargetId); saveItems(); renderAll(); showToast('Deleted', 'error'); }
  closeConfirm();
}

// ===== Reminders =====
function setupReminderTimers() {
  Object.values(reminderTimers).forEach(clearTimeout);
  reminderTimers = {};

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  items.filter(i => i.type === 'reminder' && i.reminderTime).forEach(item => {
    const target = new Date(item.reminderTime).getTime();
    const delay = target - Date.now();

    if (delay > 0 && delay < 86400000 * 365) {
      reminderTimers[item.id] = setTimeout(() => {
        new Notification('Recall Reminder', {
          body: item.title + (item.content ? '\n' + item.content.slice(0, 100) : ''),
          icon: 'icon.png'
        });
        showToast(`Reminder: ${item.title}`, 'info');
        renderCards();
      }, delay);
    }
  });
}

// Boot
initApp();