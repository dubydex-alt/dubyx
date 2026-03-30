const STORAGE_KEY = "product-keep-app-v1";
const THEME_KEY = "product-keep-theme";

const defaultState = {
  activeFolderId: null,
  searchQuery: "",
  sortBy: "latest",
  filterBy: "all",
  folders: []
};

const els = {
  body: document.body,
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
  emptyAddBtn: document.getElementById("emptyAddBtn"),
  exportFolderBtn: document.getElementById("exportFolderBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  importInput: document.getElementById("importInput"),
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

let state = loadState();
let draggedItemId = null;
let toastTimer = null;
let draftImages = [];
let viewerState = {
  itemId: null,
  index: 0
};

bootstrap();

function bootstrap() {
  if (!["all", "pinned", "favorites"].includes(state.filterBy)) {
    state.filterBy = "all";
  }
  applyTheme(loadTheme());
  ensureInitialFolder();
  bindEvents();
  syncControls();
  render();
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value.trim();
    persistAndRender(false);
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    persistAndRender(false);
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filterBy = chip.dataset.filter;
      persistAndRender(false);
    });
  });

  els.themeToggleBtn.addEventListener("click", () => {
    const next = els.body.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
  });

  els.newFolderBtn.addEventListener("click", openFolderModal);
  els.addItemBtn.addEventListener("click", () => openItemModal());
  els.emptyAddBtn.addEventListener("click", () => openItemModal());
  els.exportFolderBtn.addEventListener("click", exportActiveFolder);
  els.exportAllBtn.addEventListener("click", exportAllData);
  els.importInput.addEventListener("change", handleImport);
  els.toggleSidebarBtn.addEventListener("click", () => {
    els.sidebar.classList.toggle("open");
  });

  els.folderForm.addEventListener("submit", handleFolderSubmit);
  els.itemForm.addEventListener("submit", handleItemSubmit);
  els.itemImageInput.addEventListener("change", handleImageSelection);
  els.removeImageBtn.addEventListener("click", clearImagePreview);
  els.addLinkRowBtn.addEventListener("click", () => addLinkRow());
  els.viewerPrevBtn.addEventListener("click", () => stepViewer(-1));
  els.viewerNextBtn.addEventListener("click", () => stepViewer(1));

  document.querySelectorAll("[data-close-folder-modal]").forEach((element) => {
    element.addEventListener("click", closeFolderModal);
  });

  document.querySelectorAll("[data-close-item-modal]").forEach((element) => {
    element.addEventListener("click", closeItemModal);
  });

  document.querySelectorAll("[data-close-viewer-modal]").forEach((element) => {
    element.addEventListener("click", closeViewerModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFolderModal();
      closeItemModal();
      closeViewerModal();
      els.sidebar.classList.remove("open");
    }

    if (!els.viewerModal.classList.contains("hidden")) {
      if (event.key === "ArrowLeft") stepViewer(-1);
      if (event.key === "ArrowRight") stepViewer(1);
    }
  });
}

function ensureInitialFolder() {
  if (state.folders.length) {
    state.folders.forEach(normalizeFolderItems);
    if (!getActiveFolder()) {
      state.activeFolderId = state.folders[0].id;
    }
    return;
  }

  const folderId = createId("folder");
  state.folders.push({
    id: folderId,
    name: "DPM Products",
    createdAt: new Date().toISOString(),
    items: []
  });
  state.activeFolderId = folderId;
  saveState();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultState, folders: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      folders: Array.isArray(parsed.folders) ? parsed.folders : []
    };
  } catch (error) {
    console.error("Failed to load state", error);
    return { ...defaultState, folders: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistAndRender(save = true) {
  if (save) {
    saveState();
  }
  render();
}

function syncControls() {
  els.searchInput.value = state.searchQuery;
  els.sortSelect.value = state.sortBy;
}

function render() {
  renderFolders();
  renderToolbar();
  renderStats();
  renderItems();
}

function renderFolders() {
  const activeFolder = getActiveFolder();
  els.folderList.innerHTML = "";
  els.folderCount.textContent = String(state.folders.length);
  els.activeFolderTitle.textContent = activeFolder ? activeFolder.name : "No Folder";

  state.folders.forEach((folder) => {
    const fragment = els.folderItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".folder-pill");
    const name = fragment.querySelector(".folder-pill__name");
    const meta = fragment.querySelector(".folder-pill__meta");
    const pin = fragment.querySelector(".folder-pill__pin");
    const deleteButton = fragment.querySelector(".folder-pill__delete");

    name.textContent = folder.name;
    meta.textContent = `${folder.items.length} item${folder.items.length === 1 ? "" : "s"}`;
    pin.textContent = folder.id === state.activeFolderId ? "Active" : "";

    if (folder.id === state.activeFolderId) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      state.activeFolderId = folder.id;
      els.sidebar.classList.remove("open");
      persistAndRender();
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      handleFolderContext(folder);
    });

    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteFolder(folder.id);
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
  const pinnedCount = items.filter((item) => item.pinned).length;
  const favoriteCount = items.filter((item) => item.favorite).length;

  const stats = [
    { label: "Items", value: items.length },
    { label: "Pinned", value: pinnedCount },
    { label: "Favorites", value: favoriteCount }
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

  els.emptyState.classList.toggle("hidden", items.length > 0 || !!state.searchQuery || state.filterBy !== "all");

  if (!folder) {
    return;
  }

  if (!items.length) {
    if (state.searchQuery || state.filterBy !== "all") {
      els.itemGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"></div>
          <h3>No matching items</h3>
          <p>Try a different search phrase or filter.</p>
        </div>
      `;
    }
    return;
  }

  items.forEach((item) => {
    const fragment = els.itemCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".item-card");
    const image = fragment.querySelector(".item-card__image");
    const placeholder = fragment.querySelector(".item-card__placeholder");
    const badges = fragment.querySelector(".item-card__badges");
    const viewMediaButton = fragment.querySelector(".item-card__view-media");
    const imageWrap = fragment.querySelector(".item-card__image-wrap");
    const title = fragment.querySelector(".item-card__title");
    const price = fragment.querySelector(".item-card__price");
    const description = fragment.querySelector(".item-card__description");
    const linksWrap = fragment.querySelector(".item-card__links");
    const date = fragment.querySelector(".item-card__date");
    const favoriteToggle = fragment.querySelector(".item-card__favorite-toggle");
    const itemImages = getItemImages(item);
    const itemLinks = getItemLinks(item);

    card.dataset.itemId = item.id;
    title.textContent = item.title;
    price.textContent = formatCurrency(Number(item.price) || 0);
    description.textContent = item.description || "No description added.";
    date.textContent = `Updated ${formatShortDate(item.updatedAt || item.createdAt)}`;

    if (itemImages.length) {
      image.src = itemImages[0];
      image.alt = item.title;
      image.classList.remove("hidden");
      placeholder.classList.add("hidden");
    }
    if (itemImages.length || itemLinks.length || item.description) {
      viewMediaButton.classList.remove("hidden");
      imageWrap.addEventListener("click", () => openViewerModal(item.id));
    }

    if (item.pinned) badges.appendChild(createBadge("Pinned"));
    if (item.favorite) {
      badges.appendChild(createBadge("Favorite"));
      favoriteToggle.classList.add("active");
    }
    if (itemImages.length > 1) {
      badges.appendChild(createBadge(`${itemImages.length} Images`));
    }
    if (itemLinks.length > 1) {
      badges.appendChild(createBadge(`${itemLinks.length} Links`));
    }

    if (itemLinks.length) {
      linksWrap.classList.remove("hidden");
      itemLinks.slice(0, 3).forEach((itemLink, index) => {
        const anchor = document.createElement("a");
        anchor.className = "item-card__link";
        anchor.href = itemLink.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = itemLink.title || (itemLinks.length === 1 ? "Open Product Link" : `Open Link ${index + 1}`);
        linksWrap.appendChild(anchor);
      });
    }

    favoriteToggle.addEventListener("click", () => {
      item.favorite = !item.favorite;
      item.updatedAt = new Date().toISOString();
      persistAndRender();
      showToast(item.favorite ? "Added to favorites" : "Removed from favorites");
    });

    fragment.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleItemAction(button.dataset.action, item.id));
    });

    setupDragAndDrop(card, item.id);
    els.itemGrid.appendChild(fragment);
  });
}

function getVisibleItems(items) {
  const query = state.searchQuery.toLowerCase();
  const filtered = items.filter((item) => {
    const searchPool = [
      item.title,
      item.description,
      ...getItemLinks(item).flatMap((entry) => [entry.title, entry.url])
    ];
    const matchesSearch = !query || searchPool.some((value) => (value || "").toLowerCase().includes(query));
    const matchesFilter = state.filterBy === "all"
      || (state.filterBy === "pinned" && item.pinned)
      || (state.filterBy === "favorites" && item.favorite);
    return matchesSearch && matchesFilter;
  });

  return filtered.sort((first, second) => compareItems(first, second, state.sortBy));
}

function compareItems(first, second, sortBy) {
  if (first.pinned !== second.pinned) {
    return Number(second.pinned) - Number(first.pinned);
  }

  switch (sortBy) {
    case "name-asc":
      return first.title.localeCompare(second.title);
    case "name-desc":
      return second.title.localeCompare(first.title);
    case "price-asc":
      return (Number(first.price) || 0) - (Number(second.price) || 0);
    case "price-desc":
      return (Number(second.price) || 0) - (Number(first.price) || 0);
    case "latest":
    default:
      return (first.order ?? Number.MAX_SAFE_INTEGER) - (second.order ?? Number.MAX_SAFE_INTEGER);
  }
}

function openFolderModal() {
  els.folderForm.reset();
  els.folderModal.classList.remove("hidden");
  els.folderModal.setAttribute("aria-hidden", "false");
  setTimeout(() => els.folderNameInput.focus(), 30);
}

function closeFolderModal() {
  els.folderModal.classList.add("hidden");
  els.folderModal.setAttribute("aria-hidden", "true");
}

function handleFolderSubmit(event) {
  event.preventDefault();
  const name = els.folderNameInput.value.trim();
  if (!name) return;

  state.folders.unshift({
    id: createId("folder"),
    name,
    createdAt: new Date().toISOString(),
    items: []
  });
  state.activeFolderId = state.folders[0].id;
  saveState();
  closeFolderModal();
  render();
  showToast("Folder created");
}

function handleFolderContext(folder) {
  const action = window.prompt(`Folder: ${folder.name}\nType "rename" or "delete"`, "rename");
  if (!action) return;

  if (action.toLowerCase() === "rename") {
    const nextName = window.prompt("Rename folder", folder.name);
    if (!nextName) return;
    folder.name = nextName.trim() || folder.name;
    saveState();
    render();
    showToast("Folder renamed");
    return;
  }

  if (action.toLowerCase() === "delete") {
    deleteFolder(folder.id);
  }
}

function deleteFolder(folderId) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  if (!folder) return;
  if (state.folders.length === 1) {
    showToast("At least one folder is required");
    return;
  }

  const confirmed = window.confirm(`Delete "${folder.name}" and all of its items?`);
  if (!confirmed) return;

  state.folders = state.folders.filter((entry) => entry.id !== folderId);
  state.activeFolderId = state.folders[0].id;
  saveState();
  render();
  showToast("Folder deleted");
}

function openItemModal(itemId = null) {
  const folder = getActiveFolder();
  if (!folder) {
    showToast("Create a folder first");
    return;
  }

  els.itemForm.reset();
  els.itemIdInput.value = "";
  clearImagePreview(false);
  renderLinkRows();

  if (itemId) {
    const item = folder.items.find((entry) => entry.id === itemId);
    if (!item) return;
    els.itemModalTitle.textContent = "Edit Item";
    els.itemIdInput.value = item.id;
    els.titleInput.value = item.title;
    els.descriptionInput.value = item.description || "";
    els.priceInput.value = item.price;
    renderLinkRows(getItemLinks(item));
    els.pinnedInput.checked = Boolean(item.pinned);
    els.favoriteInput.checked = Boolean(item.favorite);
    draftImages = [...getItemImages(item)];
    renderImagePreviewGrid();
  } else {
    els.itemModalTitle.textContent = "Add Item";
  }

  els.itemModal.classList.remove("hidden");
  els.itemModal.setAttribute("aria-hidden", "false");
  setTimeout(() => els.titleInput.focus(), 30);
}

function closeItemModal() {
  els.itemModal.classList.add("hidden");
  els.itemModal.setAttribute("aria-hidden", "true");
}

async function handleImageSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const dataUrls = await Promise.all(files.map((file) => fileToDataUrl(file)));
  draftImages = [...draftImages, ...dataUrls];
  renderImagePreviewGrid();
  els.itemImageInput.value = "";
}

function clearImagePreview(resetInput = true) {
  draftImages = [];
  renderImagePreviewGrid();
  if (resetInput) els.itemImageInput.value = "";
}

function handleItemSubmit(event) {
  event.preventDefault();

  const folder = getActiveFolder();
  if (!folder) return;

  const itemId = els.itemIdInput.value;
  const now = new Date().toISOString();
  const itemData = {
    id: itemId || createId("item"),
    title: els.titleInput.value.trim(),
    description: els.descriptionInput.value.trim(),
    price: Number(els.priceInput.value || 0),
    links: collectLinkInputs(),
    images: [...draftImages],
    pinned: els.pinnedInput.checked,
    favorite: els.favoriteInput.checked,
    order: folder.items.length,
    createdAt: now,
    updatedAt: now
  };

  if (!itemData.title) {
    showToast("Title is required");
    return;
  }

  if (itemId) {
    const index = folder.items.findIndex((entry) => entry.id === itemId);
    if (index >= 0) {
      itemData.createdAt = folder.items[index].createdAt;
      itemData.order = folder.items[index].order ?? index;
      folder.items[index] = itemData;
      showToast("Item updated");
    }
  } else {
    folder.items.unshift(itemData);
    normalizeFolderItems(folder);
    showToast("Item added");
  }

  saveState();
  closeItemModal();
  render();
}

function handleItemAction(action, itemId) {
  const folder = getActiveFolder();
  if (!folder) return;
  const item = folder.items.find((entry) => entry.id === itemId);
  if (!item) return;

  if (action === "edit") {
    openItemModal(itemId);
    return;
  }

  if (action === "delete") {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    folder.items = folder.items.filter((entry) => entry.id !== itemId);
    saveState();
    render();
    showToast("Item deleted");
    return;
  }

  if (action === "view-media") {
    openViewerModal(itemId);
    return;
  }

  if (action === "copy-link") {
    const links = getItemLinks(item);
    if (!links.length) {
      showToast("No links available to copy");
      return;
    }
    copyToClipboard(links.map(formatLinkLine).join("\n"))
      .then(() => showToast(links.length === 1 ? "Link copied" : "Links copied"))
      .catch(() => showToast("Could not copy link"));
  }
}

function setupDragAndDrop(card, itemId) {
  card.addEventListener("dragstart", () => {
    draggedItemId = itemId;
    card.classList.add("dragging");
  });

  card.addEventListener("dragend", () => {
    draggedItemId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".item-card").forEach((entry) => entry.classList.remove("drop-target"));
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (draggedItemId && draggedItemId !== itemId) {
      card.classList.add("drop-target");
    }
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-target");
  });

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("drop-target");
    reorderItems(draggedItemId, itemId);
  });
}

function reorderItems(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const folder = getActiveFolder();
  if (!folder) return;

  const sourceIndex = folder.items.findIndex((item) => item.id === sourceId);
  const targetIndex = folder.items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const moved = folder.items.splice(sourceIndex, 1)[0];
  folder.items.splice(targetIndex, 0, moved);
  normalizeFolderItems(folder);
  saveState();
  render();
}

function openViewerModal(itemId) {
  const folder = getActiveFolder();
  if (!folder) return;
  const item = folder.items.find((entry) => entry.id === itemId);
  if (!item) return;

  viewerState.itemId = itemId;
  viewerState.index = 0;
  els.viewerModal.classList.remove("hidden");
  els.viewerModal.setAttribute("aria-hidden", "false");
  renderViewer(item);
}

function closeViewerModal() {
  els.viewerModal.classList.add("hidden");
  els.viewerModal.setAttribute("aria-hidden", "true");
  viewerState.itemId = null;
  viewerState.index = 0;
}

function stepViewer(direction) {
  if (!viewerState.itemId) return;
  const folder = getActiveFolder();
  if (!folder) return;
  const item = folder.items.find((entry) => entry.id === viewerState.itemId);
  if (!item) return;

  const images = getItemImages(item);
  if (!images.length) return;
  viewerState.index = (viewerState.index + direction + images.length) % images.length;
  renderViewer(item);
}

function renderViewer(item) {
  const images = getItemImages(item);
  const links = getItemLinks(item);
  const activeIndex = Math.min(viewerState.index, Math.max(images.length - 1, 0));
  viewerState.index = activeIndex;

  els.viewerTitle.textContent = item.title || "Item Preview";
  els.viewerDescription.textContent = item.description || "No notes added for this item.";
  els.viewerImageMeta.textContent = "";
  els.viewerThumbs.innerHTML = "";
  els.viewerLinks.innerHTML = "";

  if (images.length) {
    els.viewerImage.src = images[activeIndex];
    els.viewerImage.alt = item.title;
    els.viewerImage.classList.remove("hidden");
    els.viewerEmpty.classList.add("hidden");
    loadImageDimensions(images[activeIndex])
      .then((details) => {
        if (viewerState.itemId === item.id && viewerState.index === activeIndex) {
          els.viewerImageMeta.textContent = `Original size: ${details.width} x ${details.height}px`;
        }
      })
      .catch(() => {
        if (viewerState.itemId === item.id && viewerState.index === activeIndex) {
          els.viewerImageMeta.textContent = "Original size unavailable";
        }
      });
  } else {
    els.viewerImage.src = "";
    els.viewerImage.classList.add("hidden");
    els.viewerEmpty.classList.remove("hidden");
    els.viewerImageMeta.textContent = "";
  }

  els.viewerPrevBtn.disabled = images.length <= 1;
  els.viewerNextBtn.disabled = images.length <= 1;

  images.forEach((src, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `viewer__thumb${index === activeIndex ? " active" : ""}`;
    button.innerHTML = `<img src="${src}" alt="Preview ${index + 1}">`;
    button.addEventListener("click", () => {
      viewerState.index = index;
      renderViewer(item);
    });
    els.viewerThumbs.appendChild(button);
  });

  links.forEach((link, index) => {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.title || (links.length === 1 ? "Open Link" : `Open Link ${index + 1}`);
    els.viewerLinks.appendChild(anchor);
  });
}

function exportActiveFolder() {
  const folder = getActiveFolder();
  if (!folder) return;
  downloadJson({
    exportedAt: new Date().toISOString(),
    version: 1,
    folder
  }, `${slugify(folder.name)}-folder-backup.json`);
  showToast("Folder exported");
}

function exportAllData() {
  downloadJson({
    exportedAt: new Date().toISOString(),
    version: 1,
    app: "Dubydex Product Management (DPM)",
    state
  }, "dpm-backup.json");
  showToast("Backup exported");
}

async function handleImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);

    if (parsed.state && Array.isArray(parsed.state.folders)) {
      state = {
        ...defaultState,
        ...parsed.state,
        folders: parsed.state.folders
      };
    } else if (parsed.folder && parsed.folder.id) {
      const importedFolder = {
        ...parsed.folder,
        id: createId("folder"),
        name: getUniqueFolderName(parsed.folder.name || "Imported Folder")
      };
      state.folders.unshift(importedFolder);
      state.activeFolderId = importedFolder.id;
    } else {
      throw new Error("Unsupported backup format");
    }

    state.folders.forEach(normalizeFolderItems);
    ensureInitialFolder();
    saveState();
    render();
    showToast("Import complete");
  } catch (error) {
    console.error(error);
    showToast("Import failed. Check the JSON file.");
  } finally {
    event.target.value = "";
  }
}

function getActiveFolder() {
  return state.folders.find((folder) => folder.id === state.activeFolderId) || null;
}

function normalizeFolderItems(folder) {
  folder.items = (folder.items || []).map((item, index) => ({
    ...item,
    images: Array.isArray(item.images)
      ? item.images.filter(Boolean)
      : (item.imageData ? [item.imageData] : []),
    links: Array.isArray(item.links)
      ? item.links.map(normalizeLinkEntry).filter((entry) => entry && entry.url)
      : (item.link ? [normalizeLinkEntry(item.link)] : []),
    order: typeof item.order === "number" ? item.order : index
  })).sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

  folder.items.forEach((item, index) => {
    item.order = index;
  });
}

function getItemImages(item) {
  if (Array.isArray(item.images)) {
    return item.images.filter(Boolean);
  }
  return item.imageData ? [item.imageData] : [];
}

function getItemLinks(item) {
  if (Array.isArray(item.links)) {
    return item.links.map(normalizeLinkEntry).filter((entry) => entry && entry.url);
  }
  return item.link ? [normalizeLinkEntry(item.link)] : [];
}

function renderImagePreviewGrid() {
  els.imagePreviewGrid.innerHTML = "";
  els.imagePreviewGrid.classList.toggle("hidden", draftImages.length === 0);

  draftImages.forEach((src, index) => {
    const card = document.createElement("div");
    card.className = "image-preview-card";
    card.innerHTML = `<img src="${src}" alt="Upload ${index + 1}"><button type="button" aria-label="Remove image">x</button>`;
    card.querySelector("button").addEventListener("click", () => {
      draftImages = draftImages.filter((_, imageIndex) => imageIndex !== index);
      renderImagePreviewGrid();
    });
    els.imagePreviewGrid.appendChild(card);
  });
}

function normalizeLinkEntry(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return parseLegacyLinkLine(value);
  }

  const url = normalizeLink((value.url || "").trim());
  if (!url) return null;
  return {
    title: (value.title || "").trim(),
    url
  };
}

function formatLinkLine(link) {
  return link.title ? `${link.title} | ${link.url}` : link.url;
}

function renderLinkRows(links = [{ title: "", url: "" }]) {
  const normalizedLinks = links.length ? links : [{ title: "", url: "" }];
  els.linkRows.innerHTML = "";

  normalizedLinks.forEach((link) => {
    addLinkRow(link);
  });
}

function addLinkRow(link = { title: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <input class="link-row__title" type="text" placeholder="Optional title" value="${escapeAttribute(link.title || "")}">
    <input class="link-row__url" type="url" placeholder="https://example.com/product-page" value="${escapeAttribute(link.url || "")}">
    <button class="link-row__remove" type="button" aria-label="Remove link">x</button>
  `;

  row.querySelector(".link-row__remove").addEventListener("click", () => {
    row.remove();
    if (!els.linkRows.children.length) {
      addLinkRow();
    }
  });

  els.linkRows.appendChild(row);
}

function collectLinkInputs() {
  return Array.from(els.linkRows.querySelectorAll(".link-row"))
    .map((row) => ({
      title: row.querySelector(".link-row__title").value.trim(),
      url: normalizeLink(row.querySelector(".link-row__url").value.trim())
    }))
    .filter((entry) => entry.url);
}

function parseLegacyLinkLine(value) {
  if (!value) return null;

  const parts = value.split("|");
  if (parts.length === 1) {
    const url = normalizeLink(parts[0].trim());
    return url ? { title: "", url } : null;
  }

  const url = normalizeLink(parts.pop().trim());
  const title = parts.join("|").trim();
  return url ? { title, url } : null;
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function applyTheme(theme) {
  els.body.classList.toggle("dark", theme === "dark");
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = text;
  return badge;
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function normalizeLink(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "backup";
}

function getUniqueFolderName(baseName) {
  const normalizedBase = (baseName || "Imported Folder").trim() || "Imported Folder";
  const existingNames = new Set(state.folders.map((folder) => folder.name.toLowerCase()));
  if (!existingNames.has(normalizedBase.toLowerCase())) {
    return normalizedBase;
  }

  let copyIndex = 1;
  while (existingNames.has(`${normalizedBase}-copy${copyIndex}`.toLowerCase())) {
    copyIndex += 1;
  }

  return `${normalizedBase}-copy${copyIndex}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight
    });
    image.onerror = reject;
    image.src = src;
  });
}

function downloadJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function copyToClipboard(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value);
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      const copied = document.execCommand("copy");
      textarea.remove();
      if (copied) resolve();
      else reject(new Error("Copy command failed"));
    } catch (error) {
      textarea.remove();
      reject(error);
    }
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
