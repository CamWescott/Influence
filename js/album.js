// Album — persistent browser-based gallery.
// Stores items (photos, slideshows, video thumbnails, reels) in localStorage.
// Organises them into user-created folders.
// Exposes window.Album.save(opts) so other panels can hand off content.
(function () {
  "use strict";

  const STORE_KEY   = "wanderlust_album_v2";
  const DEFAULT_FID = "folder_default";

  // ---- Persistence ----
  function loadData() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return createEmptyData();
  }

  function createEmptyData() {
    return {
      version: 2,
      folders: [{ id: DEFAULT_FID, name: "My Album", created: Date.now() }],
      items: [],
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      if (e && e.name === "QuotaExceededError") {
        showToast("Album storage is full. Delete some items to save more.", true);
      }
    }
  }

  let data = loadData();

  // Ensure the default folder always exists after data migration.
  if (!data.folders.find(function (f) { return f.id === DEFAULT_FID; })) {
    data.folders.unshift({ id: DEFAULT_FID, name: "My Album", created: 0 });
    persist();
  }

  // ---- Storage usage estimate ----
  function storageUsedBytes() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? raw.length * 2 : 0; // UTF-16 = 2 bytes per char
    } catch (_) { return 0; }
  }

  function formatBytes(b) {
    if (b < 1024)       return b + " B";
    if (b < 1048576)    return (b / 1024).toFixed(0) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  // ---- State ----
  let currentFolderId = null; // null = "All Items"
  let pendingSave     = null; // { type, name, frames, count } waiting for dialog confirmation

  // ---- DOM shortcuts ----
  const panel       = document.getElementById("panel-album");
  if (!panel) return;

  const folderListEl  = document.getElementById("albumFolderList");
  const gridEl        = document.getElementById("albumGrid");
  const emptyEl       = document.getElementById("albumEmpty");
  const folderNameEl  = document.getElementById("albumFolderName");
  const itemCountEl   = document.getElementById("albumItemCount");
  const storageBarEl  = document.getElementById("albumStorageBar");
  const storageTextEl = document.getElementById("albumStorageText");
  const saveModal     = document.getElementById("albumSaveModal");
  const saveNameEl    = document.getElementById("albumSaveName");
  const saveFolderEl  = document.getElementById("albumSaveFolder");
  const saveConfirmBtn = document.getElementById("albumSaveConfirm");
  const saveCancelBtn  = document.getElementById("albumSaveCancel");
  const newFolderBtn  = document.getElementById("albumNewFolderBtn");
  const moveModal     = document.getElementById("albumMoveModal");
  const moveFolderListEl = document.getElementById("albumMoveFolderList");
  const moveCancelBtn    = document.getElementById("albumMoveCancel");

  let movingItemId = null;

  // ---- Folder CRUD ----
  function createFolder(name) {
    const id = "folder_" + Date.now();
    data.folders.push({ id, name: name.trim(), created: Date.now() });
    persist();
    return id;
  }

  function deleteFolder(id) {
    if (id === DEFAULT_FID) return; // can't delete default
    // Move its items to default folder
    data.items.forEach(function (item) {
      if (item.folderId === id) item.folderId = DEFAULT_FID;
    });
    data.folders = data.folders.filter(function (f) { return f.id !== id; });
    if (currentFolderId === id) currentFolderId = null;
    persist();
    renderAll();
  }

  function renameFolder(id, name) {
    const f = data.folders.find(function (f) { return f.id === id; });
    if (f) { f.name = name.trim() || f.name; persist(); renderAll(); }
  }

  // ---- Item CRUD ----
  function addItem(item) {
    data.items.unshift(item); // newest first
    persist();
    renderAll();
  }

  function deleteItem(id) {
    data.items = data.items.filter(function (i) { return i.id !== id; });
    persist();
    renderAll();
  }

  function moveItemToFolder(itemId, folderId) {
    const item = data.items.find(function (i) { return i.id === itemId; });
    if (item) { item.folderId = folderId; persist(); renderAll(); }
  }

  function renameItem(id, name) {
    const item = data.items.find(function (i) { return i.id === id; });
    if (item) { item.name = name.trim() || item.name; persist(); renderAll(); }
  }

  // ---- Render ----
  function renderAll() {
    renderFolderList();
    renderGrid();
    renderStorageBar();
  }

  function renderFolderList() {
    if (!folderListEl) return;
    folderListEl.innerHTML = "";

    // "All Items" pseudo-folder
    const allLi = document.createElement("li");
    allLi.className = "album-folder-item" + (currentFolderId === null ? " active" : "");
    allLi.innerHTML = '<span class="folder-icon">&#128247;</span><span class="folder-name">All Items</span>' +
      '<span class="folder-count">' + data.items.length + '</span>';
    allLi.addEventListener("click", function () { currentFolderId = null; renderAll(); });
    folderListEl.appendChild(allLi);

    data.folders.forEach(function (folder) {
      const count = data.items.filter(function (i) { return i.folderId === folder.id; }).length;
      const li = document.createElement("li");
      li.className = "album-folder-item" + (currentFolderId === folder.id ? " active" : "");
      li.dataset.folderId = folder.id;

      const nameSpan = document.createElement("span");
      nameSpan.className = "folder-name";
      nameSpan.textContent = folder.name;

      const icon = document.createElement("span");
      icon.className = "folder-icon";
      icon.textContent = "\uD83D\uDCC1";

      const countSpan = document.createElement("span");
      countSpan.className = "folder-count";
      countSpan.textContent = count;

      // Delete button (hidden for default folder)
      const delBtn = document.createElement("button");
      delBtn.className = "folder-del-btn";
      delBtn.title = "Delete folder";
      delBtn.innerHTML = "&#10005;";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm('Delete folder "' + folder.name + '"? Its items will move to My Album.')) {
          deleteFolder(folder.id);
        }
      });

      li.appendChild(icon);
      li.appendChild(nameSpan);
      li.appendChild(countSpan);
      if (folder.id !== DEFAULT_FID) li.appendChild(delBtn);

      // Double-click to rename
      nameSpan.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        const input = document.createElement("input");
        input.className = "folder-rename-input";
        input.value = folder.name;
        li.replaceChild(input, nameSpan);
        input.focus();
        input.select();
        function commit() {
          renameFolder(folder.id, input.value);
        }
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { li.replaceChild(nameSpan, input); }
        });
      });

      li.addEventListener("click", function () { currentFolderId = folder.id; renderAll(); });
      folderListEl.appendChild(li);
    });
  }

  function renderGrid() {
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const items = currentFolderId === null
      ? data.items
      : data.items.filter(function (i) { return i.folderId === currentFolderId; });

    // Update header
    if (folderNameEl) {
      if (currentFolderId === null) {
        folderNameEl.textContent = "All Items";
      } else {
        const f = data.folders.find(function (f) { return f.id === currentFolderId; });
        folderNameEl.textContent = f ? f.name : "Folder";
      }
    }
    if (itemCountEl) itemCountEl.textContent = items.length + " item" + (items.length !== 1 ? "s" : "");

    if (items.length === 0) {
      if (emptyEl) emptyEl.style.display = "";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    items.forEach(function (item) {
      const card = document.createElement("div");
      card.className = "album-card";
      card.dataset.itemId = item.id;

      // Thumbnail
      const thumb = document.createElement("div");
      thumb.className = "album-card-thumb";
      const img = document.createElement("img");
      img.src = item.frames[0] || "";
      img.alt = item.name;
      img.loading = "lazy";
      if (item.count > 1) {
        const badge = document.createElement("span");
        badge.className = "album-frame-badge";
        badge.textContent = item.count + " \uD83D\uDDBC\uFE0F";
        thumb.appendChild(badge);
      }
      thumb.appendChild(img);

      // Type pill
      const typePill = document.createElement("span");
      typePill.className = "album-type-pill album-type-" + item.type;
      typePill.textContent = TYPE_LABELS[item.type] || item.type;

      // Info
      const info = document.createElement("div");
      info.className = "album-card-info";

      const nameEl = document.createElement("p");
      nameEl.className = "album-card-name";
      nameEl.textContent = item.name;

      const dateEl = document.createElement("p");
      dateEl.className = "album-card-date";
      dateEl.textContent = formatDate(item.created);

      info.appendChild(nameEl);
      info.appendChild(dateEl);

      // Actions
      const actions = document.createElement("div");
      actions.className = "album-card-actions";

      const dlBtn = document.createElement("button");
      dlBtn.className = "album-action-btn";
      dlBtn.title = "Download";
      dlBtn.innerHTML = "&#11015; Download";
      dlBtn.addEventListener("click", function () { downloadItem(item); });

      const moveBtn = document.createElement("button");
      moveBtn.className = "album-action-btn";
      moveBtn.title = "Move to folder";
      moveBtn.innerHTML = "&#128193; Move";
      moveBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        openMoveModal(item.id);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "album-action-btn album-action-del";
      delBtn.title = "Delete";
      delBtn.innerHTML = "&#128465;";
      delBtn.addEventListener("click", function () {
        if (confirm('Delete "' + item.name + '"?')) deleteItem(item.id);
      });

      actions.appendChild(dlBtn);
      actions.appendChild(moveBtn);
      actions.appendChild(delBtn);

      // Double-click name to rename
      nameEl.addEventListener("dblclick", function () {
        const input = document.createElement("input");
        input.className = "album-card-rename";
        input.value = item.name;
        info.replaceChild(input, nameEl);
        input.focus();
        input.select();
        function commit() { renameItem(item.id, input.value); }
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { info.replaceChild(nameEl, input); }
        });
      });

      card.appendChild(thumb);
      card.appendChild(typePill);
      card.appendChild(info);
      card.appendChild(actions);
      gridEl.appendChild(card);
    });
  }

  function renderStorageBar() {
    const used  = storageUsedBytes();
    const max   = 5 * 1024 * 1024; // 5 MB guideline
    const pct   = Math.min(100, Math.round(used / max * 100));
    if (storageBarEl) {
      storageBarEl.style.width = pct + "%";
      storageBarEl.className = "album-storage-fill" + (pct > 80 ? " warn" : "");
    }
    if (storageTextEl) storageTextEl.textContent = formatBytes(used) + " used";
  }

  const TYPE_LABELS = {
    "photo":      "📷 Photo",
    "slideshow":  "🎬 Slideshow",
    "video-clip": "🎥 Clip",
    "reel":       "🎞️ Reel",
  };

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  // ---- Save dialog ----
  function openSaveDialog(opts) {
    // opts: { type, suggestedName, frames, count }
    pendingSave = opts;
    if (!saveModal) {
      // No dialog in DOM yet; commit immediately with defaults
      commitSave(opts.suggestedName, DEFAULT_FID);
      return;
    }
    if (saveNameEl)   saveNameEl.value = opts.suggestedName;

    // Populate folder picker
    if (saveFolderEl) {
      saveFolderEl.innerHTML = "";
      data.folders.forEach(function (f) {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.name;
        if (f.id === (currentFolderId || DEFAULT_FID)) opt.selected = true;
        saveFolderEl.appendChild(opt);
      });
    }

    saveModal.classList.add("visible");
    if (saveNameEl) { saveNameEl.focus(); saveNameEl.select(); }
  }

  function closeSaveDialog() {
    if (saveModal) saveModal.classList.remove("visible");
    pendingSave = null;
  }

  function commitSave(name, folderId) {
    if (!pendingSave) return;
    const item = {
      id:       "item_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      folderId: folderId,
      type:     pendingSave.type,
      name:     (name || pendingSave.suggestedName).trim(),
      created:  Date.now(),
      frames:   pendingSave.frames,
      count:    pendingSave.count || pendingSave.frames.length,
    };
    addItem(item);
    pendingSave = null;
    showToast('"' + item.name + '" saved to ' + folderName(folderId));
  }

  function folderName(id) {
    const f = data.folders.find(function (f) { return f.id === id; });
    return f ? f.name : "Album";
  }

  // ---- Move modal ----
  function openMoveModal(itemId) {
    movingItemId = itemId;
    if (!moveModal) return;
    if (moveFolderListEl) {
      moveFolderListEl.innerHTML = "";
      data.folders.forEach(function (f) {
        const btn = document.createElement("button");
        btn.className = "move-folder-btn";
        btn.textContent = "\uD83D\uDCC1 " + f.name;
        btn.addEventListener("click", function () {
          moveItemToFolder(movingItemId, f.id);
          moveModal.classList.remove("visible");
          movingItemId = null;
        });
        moveFolderListEl.appendChild(btn);
      });
    }
    moveModal.classList.add("visible");
  }

  // ---- Download ----
  function downloadItem(item) {
    if (item.frames.length === 1) {
      triggerDownload(item.frames[0], sanitizeFilename(item.name) + ".jpg");
    } else {
      // Multi-frame: download each with a slight delay
      showToast("Downloading " + item.frames.length + " files\u2026");
      item.frames.forEach(function (frame, i) {
        setTimeout(function () {
          triggerDownload(frame, sanitizeFilename(item.name) + "_" + (i + 1) + ".jpg");
        }, i * 250);
      });
    }
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 200);
  }

  function sanitizeFilename(name) {
    return (name || "download").replace(/[^a-z0-9_\-\s]/gi, "").replace(/\s+/g, "_").slice(0, 60) || "download";
  }

  // ---- Toast ----
  function showToast(msg, isErr) {
    let t = document.getElementById("magicToast");
    if (!t) {
      t = document.createElement("div"); t.id = "magicToast"; t.className = "magic-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "magic-toast" + (isErr ? " error" : "") + " visible";
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("visible"); }, 3500);
  }

  // ---- Wire dialog buttons ----
  if (saveConfirmBtn) {
    saveConfirmBtn.addEventListener("click", function () {
      const name     = saveNameEl ? saveNameEl.value.trim() : "";
      const folderId = saveFolderEl ? saveFolderEl.value : DEFAULT_FID;
      commitSave(name, folderId);
      closeSaveDialog();
    });
  }
  if (saveCancelBtn) saveCancelBtn.addEventListener("click", closeSaveDialog);
  if (saveModal) {
    saveModal.addEventListener("click", function (e) {
      if (e.target === saveModal) closeSaveDialog();
    });
  }
  if (saveNameEl) {
    saveNameEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); saveConfirmBtn && saveConfirmBtn.click(); }
      if (e.key === "Escape") closeSaveDialog();
    });
  }

  // ---- Wire move modal ----
  if (moveCancelBtn) moveCancelBtn.addEventListener("click", function () {
    moveModal && moveModal.classList.remove("visible");
  });
  if (moveModal) {
    moveModal.addEventListener("click", function (e) {
      if (e.target === moveModal) moveModal.classList.remove("visible");
    });
  }

  // ---- New folder button ----
  if (newFolderBtn) {
    newFolderBtn.addEventListener("click", function () {
      const name = prompt("Folder name:");
      if (name && name.trim()) {
        const id = createFolder(name);
        currentFolderId = id;
        renderAll();
      }
    });
  }

  // ---- Wire save buttons (set by other panels) ----
  function wireSaveBtn(id, getDataFn) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      const opts = getDataFn();
      if (!opts || !opts.frames || !opts.frames.length) {
        showToast("Nothing to save yet!", true); return;
      }
      openSaveDialog(opts);
    });
  }

  wireSaveBtn("savePhotoBtn", function () {
    const api = window.PhotoMagic;
    if (!api) return null;
    const frame = api.captureActiveFrame ? api.captureActiveFrame() : null;
    if (!frame) return null;
    return { type: "photo", suggestedName: "Photo " + simpleDateStr(), frames: [frame], count: 1 };
  });

  wireSaveBtn("saveSlideshowBtn", function () {
    const api = window.PhotoMagic;
    if (!api) return null;
    const frames = api.captureAllFrames ? api.captureAllFrames() : [];
    if (!frames.length) return null;
    return { type: "slideshow", suggestedName: "Slideshow " + simpleDateStr(), frames, count: frames.length };
  });

  wireSaveBtn("saveClipBtn", function () {
    const api = window.VideoMagic;
    if (!api) return null;
    const frame = api.captureActiveThumb ? api.captureActiveThumb() : null;
    if (!frame) return null;
    return { type: "video-clip", suggestedName: "Clip " + simpleDateStr(), frames: [frame], count: 1 };
  });

  wireSaveBtn("saveReelBtn", function () {
    const api = window.VideoMagic;
    if (!api) return null;
    const frames = api.captureAllThumbs ? api.captureAllThumbs() : [];
    if (!frames.length) return null;
    return { type: "reel", suggestedName: "Reel " + simpleDateStr(), frames, count: frames.length };
  });

  function simpleDateStr() {
    const d = new Date();
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  // ---- Tab navigation: re-render when Album tab is clicked ----
  const albumTab = document.querySelector('[data-tab="album"]');
  if (albumTab) albumTab.addEventListener("click", renderAll);

  // ---- Public API ----
  window.Album = {
    save: function (opts) { openSaveDialog(opts); },
  };

  // ---- Initial render ----
  renderAll();
})();
