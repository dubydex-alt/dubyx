const PRODUCTS_TABLE = "products";
const PRODUCT_IMAGES_BUCKET = "product-images";
const MAX_IMAGES_PER_ITEM = 40;

const config = window.SUPABASE_CONFIG || {};
const supabaseClient = window.supabase && config.url && config.anonKey
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;

const state = {
  folders: [],
  virtualFolders: [],
  activeFolderId: null,
  searchQuery: "",
  sortBy: "latest",
  filterBy: "all",
  theme: "light"
};

const els = {
  body: document.body,
  appShell: document.getElementById("appShell"),
  sidebar: document.getElementById("sidebar"),
  folderList: document.getElementById("folderList"),
  folderCount: document.getElementById("folderCount"),
  activeFolderTitle: document.getElementById("activeFolderTitle"),
  itemGrid: document.getElementById("itemGrid"),
  emptyState: document.getElementById("emptyState"),
  statsGrid: document.getElementById("statsGrid"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  addItemBtn: document.getElementById("addItemBtn"),
  exportOrganizedImagesBtn: document.getElementById("exportOrganizedImagesBtn"),
  emptyAddBtn: document.getElementById("emptyAddBtn"),
  newFolderBtn: document.getElementById("newFolderBtn"),
  toggleSidebarBtn: document.getElementById("toggleSidebarBtn"),
  folderModal: document.getElementById("folderModal"),
  folderForm: document.getElementById("folderForm"),
  folderNameInput: document.getElementById("folderNameInput"),
  itemModal: document.getElementById("itemModal"),
  itemForm: document.getElementById("itemForm"),
  itemModalTitle: document.getElementById("itemModalTitle"),
  itemIdInput: document.getElementById("itemIdInput"),
  itemImageInput: document.getElementById("itemImageInput"),
  imagePreviewGrid: document.getElementById("imagePreviewGrid"),
  titleInput: document.getElementById("titleInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  priceInput: document.getElementById("priceInput"),
  linkRows: document.getElementById("linkRows"),
  addLinkRowBtn: document.getElementById("addLinkRowBtn"),
  pinnedInput: document.getElementById("pinnedInput"),
  favoriteInput: document.getElementById("favoriteInput"),
  removeImageBtn: document.getElementById("removeImageBtn"),
  uploadOverlay: document.getElementById("uploadOverlay"),
  uploadOverlayTitle: document.getElementById("uploadOverlayTitle"),
  uploadOverlayStatus: document.getElementById("uploadOverlayStatus"),
  uploadOverlayBar: document.getElementById("uploadOverlayBar"),
  uploadOverlaySize: document.getElementById("uploadOverlaySize"),
  uploadOverlayPercent: document.getElementById("uploadOverlayPercent"),
  uploadCancelBtn: document.getElementById("uploadCancelBtn"),
  uploadBackgroundBtn: document.getElementById("uploadBackgroundBtn"),
  uploadTasks: document.getElementById("uploadTasks"),
  viewerModal: document.getElementById("viewerModal"),
  viewerTitle: document.getElementById("viewerTitle"),
  viewerImage: document.getElementById("viewerImage"),
  viewerEmpty: document.getElementById("viewerEmpty"),
  viewerThumbs: document.getElementById("viewerThumbs"),
  viewerImageMeta: document.getElementById("viewerImageMeta"),
  viewerDescription: document.getElementById("viewerDescription"),
  viewerLinks: document.getElementById("viewerLinks"),
  viewerPrevBtn: document.getElementById("viewerPrevBtn"),
  viewerNextBtn: document.getElementById("viewerNextBtn"),
  toast: document.getElementById("toast"),
  folderItemTemplate: document.getElementById("folderItemTemplate"),
  itemCardTemplate: document.getElementById("itemCardTemplate")
};

let draftImages = [];
let viewerState = { itemId: null, index: 0 };
let toastTimer = null;
let uploadTasks = [];
let activeOverlayTaskId = null;
init();

async function init() {
  bindEvents();
  renderLinkRows();
  applyTheme();
  ensureFallbackFolder();
  render();
  if (!supabaseClient) {
    showToast("Supabase not connected", "error");
    console.error("Supabase client could not be created.");
    return;
  }
  await loadProducts();
}

function bindEvents() {
  els.exportOrganizedImagesBtn.addEventListener("click", exportImagesInOrganizedFolders);
  els.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value.trim();
    renderItems();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    renderItems();
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filterBy = chip.dataset.filter;
      renderToolbar();
      renderItems();
    });
  });

  els.themeToggleBtn.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
  });

  els.toggleSidebarBtn.addEventListener("click", () => {
    els.sidebar.classList.toggle("open");
  });

  els.newFolderBtn.addEventListener("click", openFolderModal);
  els.addItemBtn.addEventListener("click", () => openItemModal());
  els.emptyAddBtn.addEventListener("click", () => openItemModal());
  els.folderForm.addEventListener("submit", handleFolderSubmit);
  els.itemForm.addEventListener("submit", handleItemSubmit);
  els.itemImageInput.addEventListener("change", handleImageSelection);
  els.removeImageBtn.addEventListener("click", clearDraftImages);
  els.addLinkRowBtn.addEventListener("click", () => addLinkRow());
  els.uploadCancelBtn.addEventListener("click", cancelActiveOverlayTask);
  els.uploadBackgroundBtn.addEventListener("click", sendActiveTaskToBackground);

  els.viewerPrevBtn.addEventListener("click", () => stepViewer(-1));
  els.viewerNextBtn.addEventListener("click", () => stepViewer(1));

  document.querySelectorAll("[data-close-folder-modal]").forEach((node) => node.addEventListener("click", closeFolderModal));
  document.querySelectorAll("[data-close-item-modal]").forEach((node) => node.addEventListener("click", closeItemModal));
  document.querySelectorAll("[data-close-viewer-modal]").forEach((node) => node.addEventListener("click", closeViewerModal));
}

function ensureFallbackFolder() {
  if (state.folders.length) return;
  const folder = createVirtualFolder("DPM Products");
  state.virtualFolders = [folder];
  state.folders = [{ id: folder.id, name: folder.name, items: [], isVirtual: true, source: "virtual" }];
  state.activeFolderId = folder.id;
}

async function loadProducts() {
  try {
    const { data, error } = await supabaseClient
      .from(PRODUCTS_TABLE)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const virtualFolders = [...state.virtualFolders];
    const map = new Map();

    (data || []).forEach((row, index) => {
      const item = rowToItem(row, index);
      const id = folderId(item.folder);
      if (!map.has(id)) {
        map.set(id, { id, name: item.folder, items: [], source: "online" });
      }
      map.get(id).items.push(item);
    });

    virtualFolders.forEach((folder) => {
      if (!map.has(folder.id)) {
        map.set(folder.id, { id: folder.id, name: folder.name, items: [], isVirtual: true, source: "virtual" });
      }
    });

    state.folders = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (!state.folders.length) ensureFallbackFolder();
    if (!getActiveFolder()) state.activeFolderId = state.folders[0].id;
    render();
  } catch (error) {
    console.error("Could not load products", error);
    showToast("Could not load products", "error");
  }
}

function rowToItem(row, index) {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    price: Number(row.price || 0),
    folder: String(row.folder || "DPM Products"),
    images: normalizeImageList(row.image_urls || row.image_url),
    links: normalizeLinkList(row.links || row.product_links),
    pinned: Boolean(row.pinned),
    favorite: Boolean(row.favorite),
    order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

function render() {
  renderFolders();
  renderToolbar();
  renderStats();
  renderItems();
}

function renderFolders() {
  els.folderList.innerHTML = "";
  els.folderCount.textContent = String(state.folders.length);
  const folder = getActiveFolder();
  els.activeFolderTitle.textContent = folder ? folder.name : "No Folder";

  state.folders.forEach((folderItem) => {
    const fragment = els.folderItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".folder-pill");
    fragment.querySelector(".folder-pill__name").textContent = folderItem.name;
    fragment.querySelector(".folder-pill__meta").textContent = `${folderItem.items.length} item${folderItem.items.length === 1 ? "" : "s"}`;
    fragment.querySelector(".folder-pill__pin").textContent = folderItem.id === state.activeFolderId ? "Active" : "";

    if (folderItem.id === state.activeFolderId) button.classList.add("active");

    button.addEventListener("click", () => {
      state.activeFolderId = folderItem.id;
      els.sidebar.classList.remove("open");
      render();
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      renameOrDeleteFolder(folderItem);
    });

    fragment.querySelector(".folder-pill__delete").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteFolder(folderItem);
    });

    els.folderList.appendChild(fragment);
  });
}

function renderToolbar() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("chip--active", chip.dataset.filter === state.filterBy);
  });
}

function renderStats() {
  const folder = getActiveFolder();
  const items = folder ? folder.items : [];
  const stats = [
    { label: "Items", value: items.length },
    { label: "Pinned", value: items.filter((item) => item.pinned).length },
    { label: "Favorites", value: items.filter((item) => item.favorite).length }
  ];

  els.statsGrid.innerHTML = "";

  stats.forEach((stat) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<p>${escapeHtml(stat.label)}</p><strong>${escapeHtml(String(stat.value))}</strong>`;
    els.statsGrid.appendChild(card);
  });
}

function renderItems() {
  const folder = getActiveFolder();
  const items = folder ? getVisibleItems(folder.items) : [];
  els.itemGrid.innerHTML = "";
  els.emptyState.classList.toggle("hidden", items.length > 0 || Boolean(state.searchQuery) || state.filterBy !== "all");

  if (!folder) return;

  if (!items.length) {
    if (state.searchQuery || state.filterBy !== "all") {
      els.itemGrid.innerHTML = `<div class="empty-state"><div class="empty-state__art"></div><h3>No matching items</h3><p>Try a different search phrase or filter.</p></div>`;
    }
    return;
  }

  items.forEach((item) => {
    const fragment = els.itemCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".item-card");
    const image = fragment.querySelector(".item-card__image");
    const placeholder = fragment.querySelector(".item-card__placeholder");
    const badges = fragment.querySelector(".item-card__badges");
    const linksWrap = fragment.querySelector(".item-card__links");
    const favoriteToggle = fragment.querySelector(".item-card__favorite-toggle");

    card.dataset.itemId = item.id;
    fragment.querySelector(".item-card__title").textContent = item.title;
    fragment.querySelector(".item-card__price").textContent = formatCurrency(item.price);
    fragment.querySelector(".item-card__description").textContent = item.description || "No description added.";
    fragment.querySelector(".item-card__date").textContent = `Updated ${formatShortDate(item.updatedAt)}`;

    if (item.images.length) {
      image.src = item.images[0];
      image.alt = item.title;
      image.classList.remove("hidden");
      placeholder.classList.add("hidden");
      fragment.querySelector(".item-card__image-wrap").addEventListener("click", () => openViewer(item.id));
      fragment.querySelector(".item-card__view-media").classList.remove("hidden");
    }

    if (item.pinned) badges.appendChild(createBadge("Pinned"));
    if (item.favorite) {
      badges.appendChild(createBadge("Favorite"));
      favoriteToggle.classList.add("active");
    }
    if (item.images.length > 1) badges.appendChild(createBadge(`${item.images.length} Images`));

    if (item.links.length) {
      linksWrap.classList.remove("hidden");
      item.links.slice(0, 3).forEach((link, index) => {
        const anchor = document.createElement("a");
        anchor.className = "item-card__link";
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = link.title || `Open Link ${index + 1}`;
        linksWrap.appendChild(anchor);
      });
    }

    favoriteToggle.addEventListener("click", () => toggleFavorite(item));
    fragment.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleCardAction(button.dataset.action, item.id));
    });

    els.itemGrid.appendChild(fragment);
  });
}

function getVisibleItems(items) {
  const query = state.searchQuery.toLowerCase();
  return items
    .filter((item) => {
      const searchText = [item.title, item.description, ...item.links.flatMap((link) => [link.title, link.url])].join(" ").toLowerCase();
      const searchMatch = !query || searchText.includes(query);
      const filterMatch = state.filterBy === "all" || (state.filterBy === "pinned" && item.pinned) || (state.filterBy === "favorites" && item.favorite);
      return searchMatch && filterMatch;
    })
    .sort((a, b) => sortItems(a, b));
}

function sortItems(a, b) {
  if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
  if (state.sortBy === "name-asc") return a.title.localeCompare(b.title);
  if (state.sortBy === "name-desc") return b.title.localeCompare(a.title);
  if (state.sortBy === "price-asc") return a.price - b.price;
  if (state.sortBy === "price-desc") return b.price - a.price;
  return (a.order ?? 0) - (b.order ?? 0);
}

function openFolderModal() {
  els.folderForm.reset();
  els.folderModal.classList.remove("hidden");
  els.folderModal.setAttribute("aria-hidden", "false");
}

function closeFolderModal() {
  els.folderModal.classList.add("hidden");
  els.folderModal.setAttribute("aria-hidden", "true");
}

function handleFolderSubmit(event) {
  event.preventDefault();
  const name = els.folderNameInput.value.trim();
  if (!name) return;

  const folder = createVirtualFolder(name);
  if (!state.folders.some((item) => item.id === folder.id)) {
    state.virtualFolders.unshift(folder);
    state.folders.unshift({ id: folder.id, name: folder.name, items: [], isVirtual: true, source: "virtual" });
  }
  state.activeFolderId = folder.id;
  closeFolderModal();
  render();
  showToast("Folder created", "success");
}

async function renameOrDeleteFolder(folder) {
  const action = window.prompt(`Folder: ${folder.name}\nType "rename" or "delete"`, "rename");
  if (!action) return;

  if (action.toLowerCase() === "rename") {
    const nextName = window.prompt("Rename folder", folder.name);
    if (!nextName) return;

    if (folder.isVirtual) {
      folder.name = nextName.trim();
      folder.id = folderId(nextName);
      state.activeFolderId = folder.id;
      state.virtualFolders = state.virtualFolders.map((item) => item.name === folder.name ? createVirtualFolder(nextName) : item);
      render();
      return;
    }

    if (!supabaseClient) return showToast("Supabase not connected", "error");

    try {
      const { error } = await supabaseClient.from(PRODUCTS_TABLE).update({ folder: nextName.trim(), updated_at: new Date().toISOString() }).eq("folder", folder.name);
      if (error) throw error;
      await loadProducts();
      showToast("Folder renamed", "success");
    } catch (error) {
      console.error("Could not rename folder", error);
      showToast("Could not rename folder", "error");
    }
    return;
  }

  if (action.toLowerCase() === "delete") {
    await deleteFolder(folder);
  }
}

async function deleteFolder(folder) {
  if (!window.confirm(`Delete "${folder.name}"${folder.items.length ? " and all items" : ""}?`)) return;

  if (folder.isVirtual) {
    state.folders = state.folders.filter((item) => item.id !== folder.id);
    state.virtualFolders = state.virtualFolders.filter((item) => item.id !== folder.id);
    ensureFallbackFolder();
    render();
    return;
  }

  if (folder.source === "local") {
    try {
      await clearLocalFolderData(folder.handle);
      localFolders = localFolders.filter((item) => item.id !== folder.id);
      localFolderHandles.delete(folder.id);
      await removeLocalFolderRecord(folder.id);
      ensureFallbackFolder();
      render();
      showToast("Local folder deleted", "success");
    } catch (error) {
      console.error("Could not delete local folder", error);
      showToast("Could not delete local folder", "error");
    }
    return;
  }

  if (!supabaseClient) return showToast("Supabase not connected", "error");

  try {
    const { error } = await supabaseClient.from(PRODUCTS_TABLE).delete().eq("folder", folder.name);
    if (error) throw error;
    if (folder.items.length) {
      await deleteImagesFromStorage(folder.items.flatMap((item) => item.images));
    }
    await loadProducts();
    showToast("Folder deleted", "success");
  } catch (error) {
    console.error("Could not delete folder", error);
    showToast("Could not delete folder", "error");
  }
}

async function handleShiftFolder() {
  const folder = getActiveFolder();
  if (!folder || folder.source === "virtual") return;
  if (folder.source === "local") {
    await shiftLocalFolderToOnline(folder);
    return;
  }
  await shiftOnlineFolderToLocal(folder);
}

async function shiftOnlineFolderToLocal(folder) {
  if (!window.showDirectoryPicker) return showToast("File Manager access needs Chrome or Edge", "error");
  const task = createBlockingTask(`Shifting ${folder.name} to local`);
  try {
    showBlockingOverlay(task);
    const targetHandle = await getLocalFolderHandle(folder);
    updateBlockingTask(task, "Saving files to local folder...", 25);
    await writeLocalFolderData(folder, targetHandle);
    updateBlockingTask(task, "Deleting online database data...", 60);
    const { error } = await supabaseClient.from(PRODUCTS_TABLE).delete().eq("folder", folder.name);
    if (error) throw error;
    if (folder.items.length) {
      updateBlockingTask(task, "Deleting online storage images...", 80);
      await deleteImagesFromStorage(folder.items.flatMap((item) => item.images));
    }
    const localFolder = {
      id: folder.id,
      name: folder.name,
      items: await buildLocalItemsFromHandle(folder.name, targetHandle),
      source: "local",
      handle: targetHandle
    };
    localFolders = localFolders.filter((item) => item.id !== folder.id).concat(localFolder);
    await saveLocalFolderRecord(localFolder);
    await loadProducts();
    state.activeFolderId = localFolder.id;
    render();
    updateBlockingTask(task, "Done", 100);
    hideBlockingOverlay();
    showToast("Folder shifted to local", "success");
  } catch (error) {
    hideBlockingOverlay();
    console.error("Could not shift folder to local", error);
    showToast("Could not shift folder to local", "error");
  }
}

async function shiftLocalFolderToOnline(folder) {
  const task = createBlockingTask(`Shifting ${folder.name} to online`);
  try {
    showBlockingOverlay(task);
    const manifest = await readLocalManifest(folder.handle);
    if (!manifest || !Array.isArray(manifest.items)) throw new Error("Local folder manifest missing");
    for (let index = 0; index < manifest.items.length; index += 1) {
      const item = manifest.items[index];
      updateBlockingTask(task, `Uploading ${item.title || `item ${index + 1}`}`, Math.round((index / Math.max(manifest.items.length, 1)) * 80));
      const imageUrls = await uploadLocalFilesToSupabase(folder.handle, folder.name, item.images || []);
      const payload = {
        id: item.id || createId(),
        title: item.title || "",
        description: item.description || "",
        price: Number(item.price || 0),
        folder: folder.name,
        image_urls: imageUrls,
        links: item.links || [],
        pinned: Boolean(item.pinned),
        favorite: Boolean(item.favorite),
        sort_order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { error } = await supabaseClient.from(PRODUCTS_TABLE).insert(payload);
      if (error) throw error;
    }
    updateBlockingTask(task, "Cleaning local folder...", 90);
    await clearLocalFolderData(folder.handle);
    updateBlockingTask(task, "Refreshing online data...", 95);
    localFolders = localFolders.filter((item) => item.id !== folder.id);
    localFolderHandles.delete(folder.id);
    await removeLocalFolderRecord(folder.id);
    await loadProducts();
    state.activeFolderId = folder.id;
    render();
    updateBlockingTask(task, "Done", 100);
    hideBlockingOverlay();
    showToast("Folder shifted to online", "success");
  } catch (error) {
    hideBlockingOverlay();
    console.error("Could not shift folder to online", error);
    showToast("Could not shift folder to online", "error");
  }
}

function openItemModal(itemId = "") {
  const folder = getActiveFolder();
  if (!folder) return;

  els.itemForm.reset();
  els.itemIdInput.value = "";
  clearDraftImages();
  renderLinkRows();

  if (itemId) {
    const item = findItem(itemId);
    if (!item) return;
    els.itemModalTitle.textContent = "Edit Item";
    els.itemIdInput.value = item.id;
    els.titleInput.value = item.title;
    els.descriptionInput.value = item.description;
    els.priceInput.value = item.price;
    els.pinnedInput.checked = item.pinned;
    els.favoriteInput.checked = item.favorite;
    renderLinkRows(item.links);
    draftImages = item.images.map((url) => ({ file: null, previewUrl: url, publicUrl: url }));
    renderImagePreviewGrid();
  } else {
    els.itemModalTitle.textContent = "Add Item";
  }

  els.itemModal.classList.remove("hidden");
  els.itemModal.setAttribute("aria-hidden", "false");
}

function closeItemModal() {
  els.itemModal.classList.add("hidden");
  els.itemModal.setAttribute("aria-hidden", "true");
}

function handleImageSelection(event) {
  const files = Array.from(event.target.files || []);
  const remaining = MAX_IMAGES_PER_ITEM - draftImages.length;
  const selected = files.slice(0, Math.max(0, remaining));
  draftImages = draftImages.concat(selected.map((file) => ({ file, previewUrl: URL.createObjectURL(file), publicUrl: "" })));
  renderImagePreviewGrid();
  els.itemImageInput.value = "";
}

function clearDraftImages() {
  draftImages.forEach((item) => {
    if (item.file) URL.revokeObjectURL(item.previewUrl);
  });
  draftImages = [];
  renderImagePreviewGrid();
}

function renderImagePreviewGrid() {
  els.imagePreviewGrid.innerHTML = "";
  els.imagePreviewGrid.classList.toggle("hidden", draftImages.length === 0);
  draftImages.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "image-preview-card";
    card.innerHTML = `<img src="${item.previewUrl}" alt="Upload ${index + 1}"><button type="button" aria-label="Remove image">x</button>`;
    card.querySelector("button").addEventListener("click", () => {
      if (item.file) URL.revokeObjectURL(item.previewUrl);
      draftImages = draftImages.filter((_, imageIndex) => imageIndex !== index);
      renderImagePreviewGrid();
    });
    els.imagePreviewGrid.appendChild(card);
  });
}

async function handleItemSubmit(event) {
  event.preventDefault();
  const folder = getActiveFolder();
  if (!folder) return;
  if (!supabaseClient) return showToast("Supabase not connected", "error");

  const itemId = els.itemIdInput.value.trim();
  const existingItem = itemId ? findItem(itemId) : null;
  if (!els.titleInput.value.trim()) return showToast("Title is required", "error");

  const task = createUploadTask({
    itemId,
    existingItem,
    folderName: folder.name,
    title: els.titleInput.value.trim(),
    description: els.descriptionInput.value.trim(),
    price: Number(els.priceInput.value || 0),
    links: collectLinks(),
    pinned: els.pinnedInput.checked,
    favorite: els.favoriteInput.checked,
    draftImages: draftImages.map((item) => ({ ...item }))
  });

  uploadTasks.unshift(task);
  activeOverlayTaskId = task.id;
  renderUploadTasks();
  showUploadOverlay(task);
  resetItemFormForNextTask();
  runUploadTask(task);
}

async function runUploadTask(task) {
  try {
    updateTask(task.id, { statusText: "Uploading images..." });
    const imageUrls = await uploadImagesForTask(task);
    if (isTaskCancelled(task.id)) {
      finishTask(task.id, "cancelled", "Upload cancelled");
      return;
    }

    updateTask(task.id, { statusText: "Saving product..." });
    const now = new Date().toISOString();
    const payload = {
      id: task.itemId || createId(),
      title: task.title,
      description: task.description,
      price: task.price,
      folder: task.folderName,
      image_urls: imageUrls,
      links: task.links,
      pinned: task.pinned,
      favorite: task.favorite,
      sort_order: task.existingItem ? task.existingItem.order : getFolderItemCount(task.folderName),
      created_at: task.existingItem ? task.existingItem.createdAt : now,
      updated_at: now
    };

    const request = task.itemId
      ? supabaseClient.from(PRODUCTS_TABLE).update(payload).eq("id", task.itemId)
      : supabaseClient.from(PRODUCTS_TABLE).insert(payload);

    const { error } = await request;
    if (error) throw error;

    const removedImageUrls = task.existingItem
      ? task.existingItem.images.filter((url) => !imageUrls.includes(url))
      : [];

    if (removedImageUrls.length) {
      await deleteImagesFromStorage(removedImageUrls);
    }

    await loadProducts();
    finishTask(task.id, "done", task.itemId ? "Item updated" : "Item added");
    showToast(task.itemId ? "Item updated" : "Item added", "success");
  } catch (error) {
    console.error("Could not save item", error);
    finishTask(task.id, "error", "Upload failed");
    showToast("Could not save item", "error");
  }
}

async function saveLocalItem(folder, existingItem) {
  const task = createBlockingTask(existingItem ? "Updating local item" : "Adding local item");
  try {
    showBlockingOverlay(task);
    updateBlockingTask(task, "Saving item to local folder...", 35);

    const now = new Date().toISOString();
    const nextItem = {
      id: existingItem ? existingItem.id : createId(),
      title: els.titleInput.value.trim(),
      description: els.descriptionInput.value.trim(),
      price: Number(els.priceInput.value || 0),
      folder: folder.name,
      images: draftImages.map((item) => item.file ? URL.createObjectURL(item.file) : item.publicUrl),
      links: collectLinks(),
      pinned: els.pinnedInput.checked,
      favorite: els.favoriteInput.checked,
      order: existingItem ? existingItem.order : getFolderItemCount(folder.name),
      createdAt: existingItem ? existingItem.createdAt : now,
      updatedAt: now
    };

    const nextItems = existingItem
      ? folder.items.map((item) => item.id === existingItem.id ? nextItem : item)
      : folder.items.concat(nextItem);

    await writeLocalFolderData({ name: folder.name, items: nextItems }, folder.handle);
    const refreshedItems = await buildLocalItemsFromHandle(folder.name, folder.handle);
    localFolders = localFolders.map((item) => item.id === folder.id ? { ...item, items: refreshedItems } : item);
    await saveLocalFolderRecord({ id: folder.id, name: folder.name, handle: folder.handle });
    await loadProducts();
    closeItemModal();
    updateBlockingTask(task, "Done", 100);
    hideBlockingOverlay();
    showToast(existingItem ? "Local item updated" : "Local item added", "success");
  } catch (error) {
    hideBlockingOverlay();
    console.error("Could not save local item", error);
    showToast("Could not save local item", "error");
  }
}

async function deleteLocalItem(folder, item) {
  try {
    const nextItems = folder.items.filter((entry) => entry.id !== item.id);
    await writeLocalFolderData({ name: folder.name, items: nextItems }, folder.handle);
    const refreshedItems = await buildLocalItemsFromHandle(folder.name, folder.handle);
    localFolders = localFolders.map((entry) => entry.id === folder.id ? { ...entry, items: refreshedItems } : entry);
    await saveLocalFolderRecord({ id: folder.id, name: folder.name, handle: folder.handle });
    await loadProducts();
    showToast("Local item deleted", "success");
  } catch (error) {
    console.error("Could not delete local item", error);
    showToast("Could not delete local item", "error");
  }
}

async function updateLocalItem(folder, itemId, updater) {
  try {
    const nextItems = folder.items.map((item) => item.id === itemId ? updater(item) : item);
    await writeLocalFolderData({ name: folder.name, items: nextItems }, folder.handle);
    const refreshedItems = await buildLocalItemsFromHandle(folder.name, folder.handle);
    localFolders = localFolders.map((entry) => entry.id === folder.id ? { ...entry, items: refreshedItems } : entry);
    await saveLocalFolderRecord({ id: folder.id, name: folder.name, handle: folder.handle });
    await loadProducts();
  } catch (error) {
    console.error("Could not update local item", error);
    showToast("Could not update local item", "error");
  }
}

async function uploadImagesForTask(task) {
  const urls = [];
  let uploadedBytes = 0;
  for (const item of task.draftImages) {
    if (isTaskCancelled(task.id)) break;
    if (!item.file) {
      urls.push(item.publicUrl);
      uploadedBytes += item.sizeBytes || 0;
      syncTaskProgress(task.id, uploadedBytes, task.totalBytes);
      continue;
    }
    updateTask(task.id, { statusText: `Uploading ${item.file.name}` });
    const path = `${sanitizeFileName(task.folderName)}/${Date.now()}-${createId()}-${sanitizeFileName(item.file.name)}`;
    const { error: uploadError } = await supabaseClient.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, item.file, { upsert: false, contentType: item.file.type || undefined });
    if (uploadError) throw uploadError;
    const { data } = supabaseClient.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
    uploadedBytes += item.sizeBytes || item.file.size || 0;
    syncTaskProgress(task.id, uploadedBytes, task.totalBytes);
  }
  return urls;
}

async function handleCardAction(action, itemId) {
  const item = findItem(itemId);
  if (!item) return;
  const folder = findFolderByItemId(itemId);

  if (action === "edit") return openItemModal(itemId);
  if (action === "view-media") return openViewer(itemId);

  if (action === "copy-link") {
    const text = item.links.map((link) => link.title ? `${link.title} | ${link.url}` : link.url).join("\n");
    if (!text) return showToast("No links available to copy", "error");
    return copyText(text);
  }

  if (action === "delete") {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    if (!supabaseClient) return showToast("Supabase not connected", "error");
    try {
      const { error } = await supabaseClient.from(PRODUCTS_TABLE).delete().eq("id", item.id);
      if (error) throw error;
      if (item.images.length) {
        await deleteImagesFromStorage(item.images);
      }
      await loadProducts();
      showToast("Item deleted", "success");
    } catch (error) {
      console.error("Could not delete item", error);
      showToast("Could not delete item", "error");
    }
  }
}

async function toggleFavorite(item) {
  const folder = findFolderByItemId(item.id);
  if (!supabaseClient) return showToast("Supabase not connected", "error");
  try {
    const { error } = await supabaseClient.from(PRODUCTS_TABLE).update({ favorite: !item.favorite, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) throw error;
    await loadProducts();
  } catch (error) {
    console.error("Could not update product", error);
    showToast("Could not update product", "error");
  }
}

async function editNote(item) {
  if (!supabaseClient) return showToast("Supabase not connected", "error");
  const nextNote = window.prompt("Edit note", item.description || "");
  if (nextNote === null) return;
  try {
    const { error } = await supabaseClient
      .from(PRODUCTS_TABLE)
      .update({
        description: nextNote.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);
    if (error) throw error;
    await loadProducts();
    showToast("Note updated", "success");
  } catch (error) {
    console.error("Could not update note", error);
    showToast("Could not update note", "error");
  }
}

async function deleteNote(item) {
  if (!supabaseClient) return showToast("Supabase not connected", "error");
  if (!window.confirm(`Delete note for "${item.title}"?`)) return;
  try {
    const { error } = await supabaseClient
      .from(PRODUCTS_TABLE)
      .update({
        description: "",
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);
    if (error) throw error;
    await loadProducts();
    showToast("Note deleted", "success");
  } catch (error) {
    console.error("Could not delete note", error);
    showToast("Could not delete note", "error");
  }
}

async function exportImagesInOrganizedFolders() {
  const folder = getActiveFolder();
  if (!folder) return showToast("Select a folder first", "error");
  if (!window.showDirectoryPicker) return showToast("File Manager access needs Chrome or Edge", "error");

  const itemsWithImages = folder.items.filter((item) => Array.isArray(item.images) && item.images.length);
  if (!itemsWithImages.length) return showToast("No images found in this folder", "error");

  const task = createBlockingTask(`Exporting images from ${folder.name}`);

  try {
    showBlockingOverlay(task);
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const folderHandle = await rootHandle.getDirectoryHandle(sanitizeFileName(folder.name) || "folder", { create: true });

    let completed = 0;
    const total = itemsWithImages.reduce((sum, item) => sum + item.images.length, 0);

    for (const item of itemsWithImages) {
      const itemHandle = await folderHandle.getDirectoryHandle(sanitizeFileName(item.title || item.id || "item"), { create: true });

      for (let index = 0; index < item.images.length; index += 1) {
        const imageUrl = item.images[index];
        updateBlockingTask(task, `Exporting ${item.title || `item ${completed + 1}`}`, Math.round((completed / Math.max(total, 1)) * 100));

        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not download image: ${imageUrl}`);
        const blob = await response.blob();
        const extension = mimeToExtension(blob.type);
        const fileName = `${sanitizeFileName(item.title || item.id || "image")}-${index + 1}.${extension}`;
        const fileHandle = await itemHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        completed += 1;
      }
    }

    updateBlockingTask(task, "Done", 100);
    hideBlockingOverlay();
    showToast("Images exported", "success");
  } catch (error) {
    hideBlockingOverlay();
    console.error("Could not export images", error);
    showToast("Could not export images", "error");
  }
}

function openViewer(itemId) {
  const item = findItem(itemId);
  if (!item) return;
  viewerState = { itemId, index: 0 };
  renderViewer(item);
  els.viewerModal.classList.remove("hidden");
}

function closeViewerModal() {
  els.viewerModal.classList.add("hidden");
}

function stepViewer(direction) {
  const item = findItem(viewerState.itemId);
  if (!item || item.images.length <= 1) return;
  viewerState.index = (viewerState.index + direction + item.images.length) % item.images.length;
  renderViewer(item);
}

function renderViewer(item) {
  const index = Math.min(viewerState.index, Math.max(item.images.length - 1, 0));
  els.viewerTitle.textContent = item.title;
  els.viewerDescription.textContent = item.description || "No notes added for this item.";
  els.viewerThumbs.innerHTML = "";
  els.viewerLinks.innerHTML = "";
  els.viewerImageMeta.textContent = "";

  if (item.images.length) {
    els.viewerImage.src = item.images[index];
    els.viewerImage.alt = item.title;
    els.viewerImage.classList.remove("hidden");
    els.viewerEmpty.classList.add("hidden");
  } else {
    els.viewerImage.classList.add("hidden");
    els.viewerEmpty.classList.remove("hidden");
  }

  els.viewerPrevBtn.disabled = item.images.length <= 1;
  els.viewerNextBtn.disabled = item.images.length <= 1;

  item.images.forEach((src, thumbIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `viewer__thumb${thumbIndex === index ? " active" : ""}`;
    button.innerHTML = `<img src="${src}" alt="Preview ${thumbIndex + 1}">`;
    button.addEventListener("click", () => {
      viewerState.index = thumbIndex;
      renderViewer(item);
    });
    els.viewerThumbs.appendChild(button);
  });

  item.links.forEach((link, linkIndex) => {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.title || `Open Link ${linkIndex + 1}`;
    els.viewerLinks.appendChild(anchor);
  });
}

function createUploadTask(payload) {
  const taskImages = payload.draftImages.map((item) => ({
    file: item.file || null,
    previewUrl: item.previewUrl,
    publicUrl: item.publicUrl || "",
    sizeBytes: item.file ? item.file.size : estimateRemoteImageSize(item.publicUrl)
  }));
  const totalBytes = taskImages.reduce((sum, item) => sum + item.sizeBytes, 0);
  return {
    id: createId(),
    itemId: payload.itemId,
    existingItem: payload.existingItem,
    folderName: payload.folderName,
    title: payload.title,
    description: payload.description,
    price: payload.price,
    links: payload.links,
    pinned: payload.pinned,
    favorite: payload.favorite,
    draftImages: taskImages,
    totalBytes,
    uploadedBytes: 0,
    progress: 0,
    status: "running",
    statusText: "Preparing upload...",
    cancelRequested: false
  };
}

function createBlockingTask(title) {
  return {
    id: createId(),
    title,
    progress: 0,
    uploadedBytes: 0,
    totalBytes: 0,
    statusText: "Starting...",
    status: "running",
    blocking: true
  };
}

function resetItemFormForNextTask() {
  els.itemForm.reset();
  els.itemIdInput.value = "";
  clearDraftImages();
  renderLinkRows();
}

function getFolderItemCount(folderName) {
  const folder = state.folders.find((item) => item.name === folderName);
  return folder ? folder.items.length : 0;
}

function syncTaskProgress(taskId, uploadedBytes, totalBytes) {
  const progress = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 100;
  updateTask(taskId, {
    uploadedBytes,
    totalBytes,
    progress
  });
}

function updateTask(taskId, updates) {
  uploadTasks = uploadTasks.map((task) => task.id === taskId ? { ...task, ...updates } : task);
  renderUploadTasks();
  if (activeOverlayTaskId === taskId) {
    const task = uploadTasks.find((item) => item.id === taskId);
    if (task) showUploadOverlay(task);
  }
}

function finishTask(taskId, status, statusText) {
  updateTask(taskId, {
    status,
    statusText,
    progress: status === "done" ? 100 : uploadTasks.find((item) => item.id === taskId)?.progress || 0
  });

  if (activeOverlayTaskId === taskId) {
    hideUploadOverlay();
    closeItemModal();
  }

  if (status === "done" || status === "cancelled") {
    setTimeout(() => {
      uploadTasks = uploadTasks.filter((task) => task.id !== taskId);
      renderUploadTasks();
    }, 2600);
  }
}

function showUploadOverlay(task) {
  activeOverlayTaskId = task.id;
  els.uploadOverlay.classList.remove("hidden");
  els.uploadOverlay.setAttribute("aria-hidden", "false");
  els.uploadOverlayTitle.textContent = task.title || "Saving product...";
  els.uploadOverlayStatus.textContent = task.statusText;
  els.uploadOverlayBar.style.width = `${task.progress}%`;
  els.uploadOverlayPercent.textContent = `${task.progress}%`;
  els.uploadOverlaySize.textContent = `${formatMegabytes(task.uploadedBytes)} / ${formatMegabytes(task.totalBytes)}`;
  els.uploadCancelBtn.disabled = task.status !== "running" || !!task.blocking;
  els.uploadBackgroundBtn.disabled = task.status !== "running" || !!task.blocking;
  els.uploadCancelBtn.classList.toggle("hidden", !!task.blocking);
  els.uploadBackgroundBtn.classList.toggle("hidden", !!task.blocking);
}

function hideUploadOverlay() {
  activeOverlayTaskId = null;
  els.uploadOverlay.classList.add("hidden");
  els.uploadOverlay.setAttribute("aria-hidden", "true");
  els.uploadCancelBtn.classList.remove("hidden");
  els.uploadBackgroundBtn.classList.remove("hidden");
}

function cancelActiveOverlayTask() {
  const task = uploadTasks.find((item) => item.id === activeOverlayTaskId);
  if (!task) return;
  task.cancelRequested = true;
  task.statusText = "Cancelling after current upload...";
  renderUploadTasks();
  showUploadOverlay(task);
}

function sendActiveTaskToBackground() {
  hideUploadOverlay();
  closeItemModal();
}

function showBlockingOverlay(task) {
  showUploadOverlay(task);
}

function updateBlockingTask(task, statusText, progress) {
  task.statusText = statusText;
  task.progress = progress;
  showUploadOverlay(task);
}

function hideBlockingOverlay() {
  hideUploadOverlay();
}

function isTaskCancelled(taskId) {
  const task = uploadTasks.find((item) => item.id === taskId);
  return Boolean(task && task.cancelRequested);
}

function renderUploadTasks() {
  els.uploadTasks.innerHTML = "";
  uploadTasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = `upload-task${task.status === "done" ? " upload-task--done" : ""}${task.status === "error" ? " upload-task--error" : ""}`;
    card.innerHTML = `
      <div class="upload-task__head">
        <h4 class="upload-task__title">${escapeHtml(task.title || "Untitled Product")}</h4>
        <span>${task.progress}%</span>
      </div>
      <p class="upload-task__status">${escapeHtml(task.statusText)}</p>
      <div class="upload-progress">
        <div class="upload-progress__bar" style="width:${task.progress}%"></div>
      </div>
      <div class="upload-task__meta">
        <span>${formatMegabytes(task.uploadedBytes)} / ${formatMegabytes(task.totalBytes)}</span>
        <span>${task.status}</span>
      </div>
    `;
    if (task.status === "running") {
      card.addEventListener("click", () => showUploadOverlay(task));
    }
    els.uploadTasks.appendChild(card);
  });
}

function renderLinkRows(links = [{ title: "", url: "" }]) {
  els.linkRows.innerHTML = "";
  links.forEach((link) => addLinkRow(link));
}

function addLinkRow(link = { title: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `<input class="link-row__title" type="text" placeholder="Optional title" value="${escapeAttribute(link.title || "")}"><input class="link-row__url" type="url" placeholder="https://example.com/product-page" value="${escapeAttribute(link.url || "")}"><button class="link-row__remove" type="button" aria-label="Remove link">x</button>`;
  row.querySelector(".link-row__remove").addEventListener("click", () => {
    row.remove();
    if (!els.linkRows.children.length) addLinkRow();
  });
  els.linkRows.appendChild(row);
}

function collectLinks() {
  return Array.from(els.linkRows.querySelectorAll(".link-row"))
    .map((row) => ({
      title: row.querySelector(".link-row__title").value.trim(),
      url: normalizeUrl(row.querySelector(".link-row__url").value.trim())
    }))
    .filter((item) => item.url);
}

function getActiveFolder() {
  return state.folders.find((folder) => folder.id === state.activeFolderId) || null;
}

function findItem(itemId) {
  for (const folder of state.folders) {
    const item = folder.items.find((entry) => entry.id === itemId);
    if (item) return item;
  }
  return null;
}

function createVirtualFolder(name) {
  return { id: folderId(name), name: String(name || "").trim() || "DPM Products", source: "virtual" };
}

function folderId(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [value];
    } catch (error) {
      return [value];
    }
  }
  return [];
}

function normalizeLinkList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeLinkItem).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(normalizeLinkItem).filter(Boolean) : [normalizeLinkItem(value)].filter(Boolean);
    } catch (error) {
      return [normalizeLinkItem(value)].filter(Boolean);
    }
  }
  return [];
}

function normalizeLinkItem(value) {
  if (!value) return null;
  if (typeof value === "string") return { title: "", url: normalizeUrl(value) };
  const url = normalizeUrl(value.url || "");
  return url ? { title: String(value.title || ""), url } : null;
}

function normalizeUrl(value) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function findFolderByItemId(itemId) {
  return state.folders.find((folder) => folder.items.some((entry) => entry.id === itemId)) || null;
}

async function writeLocalFolderData(folder, handle) {
  await clearLocalFolderData(handle);
  const imagesHandle = await handle.getDirectoryHandle("images", { create: true });
  const manifest = { version: 1, name: folder.name, exportedAt: new Date().toISOString(), items: [] };
  for (const item of folder.items) {
    const manifestItem = {
      id: item.id,
      title: item.title,
      description: item.description,
      price: item.price,
      links: item.links,
      pinned: item.pinned,
      favorite: item.favorite,
      order: item.order,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      images: []
    };
    for (let index = 0; index < item.images.length; index += 1) {
      const response = await fetch(item.images[index]);
      const blob = await response.blob();
      const fileName = `${sanitizeFileName(item.id || item.title || "item")}-${index + 1}.${mimeToExtension(blob.type)}`;
      const fileHandle = await imagesHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      manifestItem.images.push({ fileName });
    }
    manifest.items.push(manifestItem);
  }
  const manifestHandle = await handle.getFileHandle("folder-manifest.json", { create: true });
  const writable = await manifestHandle.createWritable();
  await writable.write(JSON.stringify(manifest, null, 2));
  await writable.close();
}

async function readLocalManifest(handle) {
  const manifestHandle = await handle.getFileHandle("folder-manifest.json");
  const file = await manifestHandle.getFile();
  return JSON.parse(await file.text());
}

async function getLocalFolderHandle(folder) {
  const existingHandle = localFolderHandles.get(folder.id);
  if (existingHandle) return existingHandle;
  const parentHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  const folderHandle = await parentHandle.getDirectoryHandle(sanitizeFileName(folder.name) || "folder", { create: true });
  localFolderHandles.set(folder.id, folderHandle);
  return folderHandle;
}

async function clearLocalFolderData(handle) {
  try {
    for await (const [name, childHandle] of handle.entries()) {
      await handle.removeEntry(name, { recursive: childHandle.kind === "directory" });
    }
  } catch (error) {
    if (!error || error.name !== "NotFoundError") throw error;
  }
}

async function restoreLocalFolders() {
  try {
    const records = await getAllLocalFolderRecords();
    const restoredFolders = [];

    for (const record of records) {
      if (!record || !record.id || !record.name || !record.handle) continue;
      try {
        const permission = await record.handle.queryPermission({ mode: "readwrite" });
        if (permission === "denied") {
          await removeLocalFolderRecord(record.id);
          localFolderHandles.delete(record.id);
          continue;
        }

        const items = await buildLocalItemsFromHandle(record.name, record.handle);
        localFolderHandles.set(record.id, record.handle);
        restoredFolders.push({
          id: record.id,
          name: record.name,
          items,
          source: "local",
          handle: record.handle
        });
      } catch (error) {
        console.error(`Could not restore local folder "${record.name}"`, error);
        await removeLocalFolderRecord(record.id);
        localFolderHandles.delete(record.id);
      }
    }

    localFolders = restoredFolders;
  } catch (error) {
    console.error("Could not restore local folders", error);
  }
}

async function saveLocalFolderRecord(folder) {
  const db = await openLocalFoldersDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_FOLDER_STORE, "readwrite");
    const store = transaction.objectStore(LOCAL_FOLDER_STORE);
    const request = store.put({
      id: folder.id,
      name: folder.name,
      handle: folder.handle
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function removeLocalFolderRecord(folderId) {
  const db = await openLocalFoldersDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_FOLDER_STORE, "readwrite");
    const store = transaction.objectStore(LOCAL_FOLDER_STORE);
    const request = store.delete(folderId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllLocalFolderRecords() {
  const db = await openLocalFoldersDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_FOLDER_STORE, "readonly");
    const store = transaction.objectStore(LOCAL_FOLDER_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
  });
}

async function openLocalFoldersDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_FOLDER_STORE)) {
        db.createObjectStore(LOCAL_FOLDER_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function buildLocalItemsFromHandle(folderName, handle) {
  const manifest = await readLocalManifest(handle);
  const imagesHandle = await handle.getDirectoryHandle("images");
  const items = [];
  for (let index = 0; index < (manifest.items || []).length; index += 1) {
    const item = manifest.items[index];
    const imageUrls = [];
    for (const image of item.images || []) {
      const fileHandle = await imagesHandle.getFileHandle(image.fileName);
      const file = await fileHandle.getFile();
      imageUrls.push(URL.createObjectURL(file));
    }
    items.push({
      id: item.id || createId(),
      title: item.title || "",
      description: item.description || "",
      price: Number(item.price || 0),
      folder: folderName,
      images: imageUrls,
      links: normalizeLinkList(item.links || []),
      pinned: Boolean(item.pinned),
      favorite: Boolean(item.favorite),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
    });
  }
  return items;
}

async function uploadLocalFilesToSupabase(handle, folderName, images) {
  const imagesHandle = await handle.getDirectoryHandle("images");
  const urls = [];
  for (const image of images) {
    const fileHandle = await imagesHandle.getFileHandle(image.fileName);
    const file = await fileHandle.getFile();
    const path = `${sanitizeFileName(folderName)}/${Date.now()}-${createId()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabaseClient.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw uploadError;
    const { data } = supabaseClient.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

function mimeToExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

async function deleteImagesFromStorage(imageUrls) {
  const paths = imageUrls
    .map((url) => getStoragePathFromUrl(url))
    .filter(Boolean);

  if (!paths.length) return;

  const { error } = await supabaseClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove(paths);

  if (error) {
    console.error("Could not delete images from storage", error);
  }
}

function getStoragePathFromUrl(url) {
  const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const index = String(url || "").indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(String(url).slice(index + marker.length));
}

function applyTheme() {
  els.body.classList.toggle("dark", state.theme === "dark");
  setThemeToggleIcon(state.theme);
}

function setThemeToggleIcon(theme) {
  const isDark = theme === "dark";
  els.themeToggleBtn.textContent = isDark ? "☀" : "☾";
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = text;
  return badge;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFileName(value) {
  return String(value || "").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 80);
}

function copyText(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value).then(() => showToast("Copied", "success"));
  }
  return Promise.resolve();
}

function estimateRemoteImageSize() {
  return 0;
}

function formatMegabytes(bytes) {
  const value = Number(bytes || 0) / (1024 * 1024);
  return `${value.toFixed(value >= 10 ? 0 : 1)} MB`;
}

function showToast(message, type = "info") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove("toast--success", "toast--error");
  if (type === "success") els.toast.classList.add("toast--success");
  if (type === "error") els.toast.classList.add("toast--error");
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
