const STORAGE_KEY = "product-keep-app-v1";
const THEME_KEY = "product-keep-theme";
const MAX_IMAGES_PER_ITEM = 40;
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_OUTPUT_QUALITY = 0.82;
const ENCRYPTION_ITERATIONS = 120000;

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
  exportImagesBtn: document.getElementById("exportImagesBtn"),
  exportFolderBtn: document.getElementById("exportFolderBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  importInput: document.getElementById("importInput"),
  newFolderBtn: document.getElementById("newFolderBtn"),
  toggleSidebarBtn: document.getElementById("toggleSidebarBtn"),
  folderModal: document.getElementById("folderModal"),
  folderForm: document.getElementById("folderForm"),
  folderNameInput: document.getElementById("folderNameInput"),
  folderPasswordInput: document.getElementById("folderPasswordInput"),
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
  setThemeToggleIcon(loadTheme());
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
    setThemeToggleIcon(next);
    saveTheme(next);
    showToast(`Theme changed to ${next} mode`, "success");
  });

  els.newFolderBtn.addEventListener("click", openFolderModal);
  els.addItemBtn.addEventListener("click", () => openItemModal());
  els.emptyAddBtn.addEventListener("click", () => openItemModal());
  els.exportImagesBtn.addEventListener("click", exportActiveFolderImages);
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("Failed to save state", error);
    if (isQuotaExceededError(error)) {
      showToast("Storage full. Try fewer/smaller images or export backup.", "error");
    } else {
      showToast("Could not save changes", "error");
    }
    return false;
  }
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
      showToast(item.favorite ? "Added to favorites" : "Removed from favorites", "success");
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
    exportPassword: els.folderPasswordInput.value.trim(),
    createdAt: new Date().toISOString(),
    items: []
  });
  state.activeFolderId = state.folders[0].id;
  saveState();
  closeFolderModal();
  render();
  showToast("Folder created", "success");
}

function handleFolderContext(folder) {
  const action = window.prompt(`Folder: ${folder.name}\nType "rename", "password", or "delete"`, "rename");
  if (!action) return;

  if (action.toLowerCase() === "rename") {
    const nextName = window.prompt("Rename folder", folder.name);
    if (!nextName) return;
    folder.name = nextName.trim() || folder.name;
    saveState();
    render();
    showToast("Folder renamed", "success");
    return;
  }

  if (action.toLowerCase() === "delete") {
    deleteFolder(folder.id);
    return;
  }

  if (action.toLowerCase() === "password") {
    const nextPassword = window.prompt("Set export password (leave blank to clear)", folder.exportPassword || "");
    if (nextPassword === null) return;
    folder.exportPassword = nextPassword.trim();
    saveState();
    showToast(folder.exportPassword ? "Folder password saved" : "Folder password cleared", "success");
    render();
  }
}

function deleteFolder(folderId) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  if (!folder) return;
  if (state.folders.length === 1) {
    showToast("At least one folder is required", "error");
    return;
  }

  const confirmed = window.confirm(`Delete "${folder.name}" and all of its items?`);
  if (!confirmed) return;

  state.folders = state.folders.filter((entry) => entry.id !== folderId);
  state.activeFolderId = state.folders[0].id;
  saveState();
  render();
  showToast("Folder deleted", "success");
}

function openItemModal(itemId = null) {
  const folder = getActiveFolder();
  if (!folder) {
    showToast("Create a folder first", "error");
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

  const availableSlots = Math.max(0, MAX_IMAGES_PER_ITEM - draftImages.length);
  const acceptedFiles = files.slice(0, availableSlots);
  if (!acceptedFiles.length) {
    showToast(`Maximum ${MAX_IMAGES_PER_ITEM} images allowed per item`, "error");
    event.target.value = "";
    return;
  }

  if (files.length > acceptedFiles.length) {
    showToast(`Only ${acceptedFiles.length} images added (item limit reached)`, "error");
  }

  const optimizedImages = [];
  for (const file of acceptedFiles) {
    try {
      optimizedImages.push(await fileToOptimizedDataUrl(file));
    } catch (error) {
      console.error("Failed to process image", error);
    }
  }

  if (!optimizedImages.length) {
    showToast("Could not process selected images", "error");
    event.target.value = "";
    return;
  }

  draftImages = [...draftImages, ...optimizedImages];
  showToast(`${optimizedImages.length} image${optimizedImages.length === 1 ? "" : "s"} uploaded`, "success");
  if (getEstimatedStateSize() > 4.5 * 1024 * 1024) {
    showToast("Large image data detected. Export backup regularly.", "error");
  }
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
    showToast("Title is required", "error");
    return;
  }

  if (itemId) {
    const index = folder.items.findIndex((entry) => entry.id === itemId);
    if (index >= 0) {
      itemData.createdAt = folder.items[index].createdAt;
      itemData.order = folder.items[index].order ?? index;
      folder.items[index] = itemData;
      showToast("Item updated", "success");
    }
  } else {
    folder.items.unshift(itemData);
    normalizeFolderItems(folder);
    showToast("Item added", "success");
  }

  const saved = saveState();
  if (!saved) {
    return;
  }
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
    showToast("Item deleted", "success");
    return;
  }

  if (action === "view-media") {
    openViewerModal(itemId);
    return;
  }

  if (action === "copy-link") {
    const links = getItemLinks(item);
    if (!links.length) {
      showToast("No links available to copy", "error");
      return;
    }
    copyToClipboard(links.map(formatLinkLine).join("\n"))
      .then(() => showToast(links.length === 1 ? "Link copied" : "Links copied", "success"))
      .catch(() => showToast("Could not copy link", "error"));
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
  handleSecureExport({
    exportedAt: new Date().toISOString(),
    version: 2,
    folder: stripFolderSensitiveFields(folder)
  }, `${slugify(folder.name)}-folder-backup.json`, `folder "${folder.name}"`, folder.exportPassword || "");
}

async function exportActiveFolderImages() {
  const folder = getActiveFolder();
  if (!folder) return;
  const itemsWithImages = folder.items.filter((item) => getItemImages(item).length);
  if (!itemsWithImages.length) {
    showToast("No images found in this folder", "error");
    return;
  }

  if (!window.showDirectoryPicker) {
    showToast("Image export needs Chrome/Edge File System API support", "error");
    return;
  }

  try {
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const folderHandle = await rootHandle.getDirectoryHandle(sanitizeFileName(folder.name) || "folder", { create: true });
    const usedProductNames = new Set();

    for (let itemIndex = 0; itemIndex < itemsWithImages.length; itemIndex += 1) {
      const item = itemsWithImages[itemIndex];
      const productTitle = item.title || `product-${itemIndex + 1}`;
      const productFolderName = uniqueFolderName(sanitizeFileName(productTitle) || `product-${itemIndex + 1}`, usedProductNames);
      const productHandle = await folderHandle.getDirectoryHandle(productFolderName, { create: true });
      const images = getItemImages(item);

      for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
        const { blob, extension } = await imageSourceToBlob(images[imageIndex]);
        const fileHandle = await productHandle.getFileHandle(`img${imageIndex + 1}.${extension}`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }
    }

    showToast("Images exported in folder/product/image structure", "success");
  } catch (error) {
    if (error && error.name === "AbortError") {
      showToast("Export canceled", "error");
      return;
    }
    console.error("Failed to export images", error);
    showToast("Could not export images", "error");
  }
}

function exportAllData() {
  handleSecureExport({
    exportedAt: new Date().toISOString(),
    version: 2,
    app: "Dubydex Product Management (DPM)",
    state: {
      ...state,
      folders: state.folders.map(stripFolderSensitiveFields)
    }
  }, "dpm-backup.json", "full backup");
}

async function handleSecureExport(payload, fileName, scopeLabel, defaultPassword = "") {
  const typedPassword = window.prompt(`Optional password for ${scopeLabel} export.\nLeave blank for no password (or blank to use folder default).`, "");
  if (typedPassword === null) {
    showToast("Export canceled", "error");
    return;
  }
  const password = typedPassword.trim() || defaultPassword;

  if (!typedPassword.trim() && defaultPassword) {
    showToast("Using saved folder password for export", "success");
  }

  try {
    let exportPayload = payload;
    if (password.trim()) {
      exportPayload = await encryptPayload(payload, password.trim());
    }
    downloadJson(exportPayload, fileName);
    showToast(password.trim() ? "Password protected export complete" : "Export complete", "success");
  } catch (error) {
    console.error("Export failed", error);
    showToast("Export failed", "error");
  }
}

async function handleImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);
    const importPayload = parsed.encrypted ? await promptAndDecryptImport(parsed) : parsed;
    if (!importPayload) {
      return;
    }

    if (importPayload.state && Array.isArray(importPayload.state.folders)) {
      state = {
        ...defaultState,
        ...importPayload.state,
        folders: importPayload.state.folders
      };
    } else if (importPayload.folder && importPayload.folder.id) {
      const importedFolder = {
        ...importPayload.folder,
        id: createId("folder"),
        name: getUniqueFolderName(importPayload.folder.name || "Imported Folder")
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
    showToast("Import complete", "success");
  } catch (error) {
    console.error(error);
    showToast("Import failed. Check file/password.", "error");
  } finally {
    event.target.value = "";
  }
}

async function promptAndDecryptImport(parsed) {
  const password = window.prompt("This backup is password protected. Enter password to import:", "");
  if (password === null) {
    showToast("Import canceled", "error");
    return null;
  }

  try {
    return await decryptPayload(parsed, password.trim());
  } catch (error) {
    console.error("Decryption failed", error);
    showToast("Wrong password or corrupted file", "error");
    return null;
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

function setThemeToggleIcon(theme) {
  const isDark = theme === "dark";
  els.themeToggleBtn.textContent = isDark ? "☀" : "☾";
  els.themeToggleBtn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = text;
  return badge;
}

function showToast(message, type = "info") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove("toast--success", "toast--error");
  if (type === "success") {
    els.toast.classList.add("toast--success");
  } else if (type === "error") {
    els.toast.classList.add("toast--error");
  }
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

function isQuotaExceededError(error) {
  return Boolean(error) && (
    error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error.code === 22
    || error.code === 1014
  );
}

function getEstimatedStateSize() {
  try {
    return new Blob([JSON.stringify(state)]).size;
  } catch (error) {
    return 0;
  }
}

async function fileToOptimizedDataUrl(file) {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const target = getScaledDimensions(image.naturalWidth, image.naturalHeight, MAX_IMAGE_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, target.width, target.height);
  const optimized = canvas.toDataURL("image/webp", IMAGE_OUTPUT_QUALITY);
  return optimized.length < originalDataUrl.length ? optimized : originalDataUrl;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getScaledDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const scale = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function imageSourceToBlob(src) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Image fetch failed");
  }

  const blob = await response.blob();
  const extension = mimeTypeToExtension(blob.type);
  return { blob, extension };
}

function mimeTypeToExtension(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/bmp") return "bmp";
  if (type === "image/svg+xml") return "svg";
  return "jpg";
}

async function encryptPayload(payload, password) {
  const plainText = JSON.stringify(payload);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    version: 2,
    encrypted: true,
    algorithm: "AES-GCM",
    kdf: "PBKDF2",
    iterations: ENCRYPTION_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    payload: bytesToBase64(new Uint8Array(cipherBuffer))
  };
}

async function decryptPayload(encryptedData, password) {
  if (!encryptedData || !encryptedData.encrypted) {
    throw new Error("Invalid encrypted payload");
  }

  const salt = base64ToBytes(encryptedData.salt);
  const iv = base64ToBytes(encryptedData.iv);
  const cipherBytes = base64ToBytes(encryptedData.payload);
  const key = await deriveEncryptionKey(password, salt, encryptedData.iterations || ENCRYPTION_ITERATIONS);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes
  );

  const decoded = new TextDecoder().decode(plainBuffer);
  return JSON.parse(decoded);
}

async function deriveEncryptionKey(password, salt, iterations = ENCRYPTION_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
}

function uniqueFolderName(base, usedNames) {
  let candidate = base;
  let counter = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function stripFolderSensitiveFields(folder) {
  const cloned = { ...folder };
  delete cloned.exportPassword;
  return cloned;
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
