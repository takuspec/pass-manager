const STORAGE_KEY = "watch-pass:v3";
const LEGACY_KEYS = ["watch-pass:v2", "wrb-video-vault:v1"];
const IMAGE_DB_NAME = "watch-pass-images";
const IMAGE_STORE_NAME = "images";
const IMAGE_DB_VERSION = 1;
const MAX_IMAGE_EDGE = 900;
const IMAGE_QUALITY = 0.76;

const screens = {
  folders: document.querySelector("#folderScreen"),
  detail: document.querySelector("#detailScreen"),
  folderForm: document.querySelector("#folderFormScreen"),
  form: document.querySelector("#formScreen"),
  linkForm: document.querySelector("#linkFormScreen"),
};

const screenTitle = document.querySelector("#screenTitle");
const backButton = document.querySelector("#backButton");
const folderList = document.querySelector("#folderList");
const editModeButton = document.querySelector("#editModeButton");
const folderEmptyState = document.querySelector("#folderEmptyState");
const editActions = document.querySelector("#editActions");
const addFolderButton = document.querySelector("#addFolderButton");
const folderForm = document.querySelector("#folderForm");
const editingFolderId = document.querySelector("#editingFolderId");
const folderNameInput = document.querySelector("#folderNameInput");
const saveFolderButton = document.querySelector("#saveFolderButton");
const deleteFolderButton = document.querySelector("#deleteFolderButton");
const form = document.querySelector("#entryForm");
const editingId = document.querySelector("#editingId");
const titleInput = document.querySelector("#titleInput");
const urlInput = document.querySelector("#urlInput");
const passwordInput = document.querySelector("#passwordInput");
const imageInput = document.querySelector("#imageInput");
const imagePreview = document.querySelector("#imagePreview");
const deleteEntryButton = document.querySelector("#deleteEntryButton");
const cropModal = document.querySelector("#cropModal");
const cropStage = document.querySelector("#cropStage");
const cropFrame = document.querySelector(".crop-frame");
const cropImage = document.querySelector("#cropImage");
const cropZoomInput = document.querySelector("#cropZoomInput");
const cropCancelButton = document.querySelector("#cropCancelButton");
const cropSaveButton = document.querySelector("#cropSaveButton");
const toast = document.querySelector("#toast");
const saveButton = document.querySelector("#saveButton");
const detailContent = document.querySelector("#detailContent");
const linkForm = document.querySelector("#linkForm");
const editingLinkId = document.querySelector("#editingLinkId");
const parentEntryId = document.querySelector("#parentEntryId");
const linkTitleInput = document.querySelector("#linkTitleInput");
const linkUrlInput = document.querySelector("#linkUrlInput");
const linkPasswordInput = document.querySelector("#linkPasswordInput");
const saveLinkButton = document.querySelector("#saveLinkButton");
const deleteLinkButton = document.querySelector("#deleteLinkButton");

let data = loadData();
let activeFolderId = "";
let activeEntryId = "";
let isEditMode = false;
let activeDetailId = "";
let activeLinkDetailId = "";
let activeDetailType = "";
let dragState = null;
let suppressNextClick = false;
let toastTimer;
let pendingImageBlob = null;
let pendingImageRemoved = false;
let previewUrl = "";
let cropSourceUrl = "";
const cropPointers = new Map();
let cropGesture = null;
let cropState = { x: 0, y: 0, zoom: 1 };

window.addEventListener("hashchange", route);
editModeButton.addEventListener("click", toggleEditMode);
addFolderButton.addEventListener("click", () => showFolderForm());
backButton.addEventListener("click", goBack);
folderForm.addEventListener("submit", saveFolder);
deleteFolderButton.addEventListener("click", deleteEditingFolder);
form.addEventListener("submit", saveEntry);
deleteEntryButton.addEventListener("click", deleteEditingEntry);
linkForm.addEventListener("submit", saveLink);
deleteLinkButton.addEventListener("click", deleteEditingLink);
imageInput.addEventListener("change", handleImageSelection);
cropStage.addEventListener("pointerdown", startCropDrag);
cropStage.addEventListener("pointermove", moveCropDrag);
cropStage.addEventListener("pointerup", endCropDrag);
cropStage.addEventListener("pointercancel", endCropDrag);
cropZoomInput.addEventListener("input", () => {
  cropState.zoom = Number(cropZoomInput.value);
  updateCropImageLayout();
});
cropCancelButton.addEventListener("click", closeCropModal);
cropSaveButton.addEventListener("click", saveCroppedImage);
window.addEventListener("resize", updateCropImageLayout);

folderList.addEventListener("click", async (event) => {
  if (suppressNextClick) {
    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const linkCard = event.target.closest("[data-link-id]");
  if (linkCard) {
    const parentCard = event.target.closest("[data-id]");
    const entry = parentCard ? findEntry(parentCard.dataset.id) : null;
    const link = entry ? findLink(entry, linkCard.dataset.linkId) : null;
    const linkButton = event.target.closest("[data-action]");
    if (!entry || !link) return;

    event.stopPropagation();

    if (linkButton?.dataset.action === "edit-link") {
      showLinkForm(entry, link);
      return;
    }

    if (linkButton?.dataset.action === "open-link") {
      await openLink(link, entry);
      return;
    }

    location.hash = `#/detail/${entry.id}/link-detail/${link.id}`;
    return;
  }

  const entryCard = event.target.closest("[data-id]");
  if (entryCard) {
    const entry = findEntry(entryCard.dataset.id);
    if (!entry) return;
    const entryButton = event.target.closest("[data-action]");

    if (entryButton?.dataset.action === "open-entry") {
      event.stopPropagation();
      await openEntry(entry);
      return;
    }

    if (entryButton?.dataset.action === "add-link") {
      event.stopPropagation();
      showLinkForm(entry);
      return;
    }

    if (entryButton?.dataset.action === "edit-entry") {
      event.stopPropagation();
      showEntryForm(entry);
      return;
    }

    const shouldOpenEntry = activeEntryId !== entry.id;
    if (shouldOpenEntry) {
      activeEntryId = entry.id;
    } else {
      activeEntryId = "";
    }
    renderFolders();
    if (shouldOpenEntry) scrollEntryToTop(entry.id);
    return;
  }

  const button = event.target.closest("[data-action]");
  const card = event.target.closest("[data-folder-id]");
  if (!card) return;

  const folder = findFolder(card.dataset.folderId);
  if (!folder) return;

  if (button?.dataset.action === "add-file") {
    event.stopPropagation();
    activeFolderId = folder.id;
    showEntryForm();
    return;
  }

  if (button?.dataset.action === "edit-folder") {
    event.stopPropagation();
    showFolderForm(folder);
    return;
  }

  activeFolderId = activeFolderId === folder.id ? "" : folder.id;
  activeEntryId = "";
  renderFolders();
});

folderList.addEventListener("pointerdown", startListDrag);
window.addEventListener("pointermove", moveListDrag);
window.addEventListener("pointerup", endListDrag);
window.addEventListener("pointercancel", endListDrag);

detailContent.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const linkCard = event.target.closest("[data-link-id]");
  if (!button && !(activeDetailType === "entry" && linkCard)) return;

  const entry = findEntry(activeDetailId);
  if (!entry) return;
  const linkId = activeDetailType === "link" ? activeLinkDetailId : linkCard?.dataset.linkId;
  const link = linkId ? findLink(entry, linkId) : null;

  if (!button && link) {
    location.hash = `#/detail/${entry.id}/link-detail/${link.id}`;
    return;
  }

  if (button.dataset.action === "add-link") showLinkForm(entry);
  if (button.dataset.action === "open-entry") await openEntry(entry);
  if (button.dataset.action === "copy-entry") {
    await copyPassword(entry.password);
    showToast("PWをコピーしました");
  }
  if (button.dataset.action === "copy-entry-url") {
    await copyPassword(entry.url);
    showToast("親URLをコピーしました");
  }
  if (button.dataset.action === "copy-link-url" && link) {
    await copyPassword(link.url);
    showToast("子URLをコピーしました");
  }
  if (button.dataset.action === "open-link" && link) await openLink(link, entry);
  if (button.dataset.action === "edit-link" && link) showLinkForm(entry, link);
  if (button.dataset.action === "show-link" && link) location.hash = `#/detail/${entry.id}/link-detail/${link.id}`;
  if (button.dataset.action === "edit") showEntryForm(entry);
});

if (!location.hash) {
  history.replaceState(null, "", "#/");
}
saveData();
route();

function route() {
  const hash = location.hash || "#/";
  const linkDetailMatch = hash.match(/^#\/detail\/(.+)\/link-detail\/(.+)$/);
  const detailMatch = hash.match(/^#\/detail\/(.+)$/);
  const editMatch = hash.match(/^#\/edit\/(.+)$/);
  const newLinkMatch = hash.match(/^#\/detail\/(.+)\/new-link$/);
  const editLinkMatch = hash.match(/^#\/detail\/(.+)\/link\/(.+)$/);
  const folderEditMatch = hash.match(/^#\/folder-edit\/(.+)$/);

  if (newLinkMatch) {
    const entry = findEntry(newLinkMatch[1]);
    entry ? showLinkForm(entry) : showFolders();
    return;
  }

  if (editLinkMatch) {
    const entry = findEntry(editLinkMatch[1]);
    const link = entry ? findLink(entry, editLinkMatch[2]) : null;
    entry && link ? showLinkForm(entry, link) : showFolders();
    return;
  }

  if (linkDetailMatch) {
    const entry = findEntry(linkDetailMatch[1]);
    const link = entry ? findLink(entry, linkDetailMatch[2]) : null;
    entry && link ? showLinkDetail(entry, link) : showFolders();
    return;
  }

  if (detailMatch) {
    const entry = findEntry(detailMatch[1]);
    entry ? showDetail(entry) : showFolders();
    return;
  }

  if (editMatch) {
    const entry = findEntry(editMatch[1]);
    entry ? showEntryForm(entry) : showFolders();
    return;
  }

  if (folderEditMatch) {
    const folder = findFolder(folderEditMatch[1]);
    folder ? showFolderForm(folder) : showFolders();
    return;
  }

  if (hash === "#/new-folder") {
    showFolderForm();
    return;
  }

  if (hash === "#/new-file") {
    activeFolderId ? showEntryForm() : showFolders();
    return;
  }

  showFolders();
}

function setScreen(name, title) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("is-active", key === name);
  });

  screenTitle.textContent = title;
  backButton.hidden = name === "folders";
  editModeButton.hidden = name !== "folders";
  editActions.hidden = name !== "folders" || !isEditMode;
}

function showFolders() {
  activeDetailId = "";
  activeLinkDetailId = "";
  activeDetailType = "";
  setScreen("folders", "OMOCOROPASS");
  renderFolders();
}

function showDetail(entry) {
  activeDetailType = "entry";
  activeDetailId = entry.id;
  activeLinkDetailId = "";
  activeFolderId = entry.folderId || activeFolderId || getFallbackFolderId();
  setScreen("detail", "詳細");
  detailContent.innerHTML = renderDetail(entry);
  hydrateImages(detailContent);
  resetScreenScroll();
}

function showLinkDetail(entry, link) {
  activeDetailType = "link";
  activeDetailId = entry.id;
  activeLinkDetailId = link.id;
  activeFolderId = entry.folderId || activeFolderId || getFallbackFolderId();
  setScreen("detail", "詳細");
  detailContent.innerHTML = renderLinkDetail(entry, link);
  hydrateImages(detailContent);
  resetScreenScroll();
}

function resetScreenScroll() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function showLinkForm(entry, link) {
  const isEdit = Boolean(link);
  activeDetailId = entry.id;
  activeFolderId = entry.folderId || activeFolderId || getFallbackFolderId();
  setScreen("linkForm", isEdit ? "キャプチャURL編集" : "キャプチャURL追加");
  parentEntryId.value = entry.id;
  editingLinkId.value = link?.id || "";
  linkTitleInput.value = link?.title || "";
  linkUrlInput.value = link?.url || "";
  linkPasswordInput.value = link?.password || "";
  saveLinkButton.textContent = isEdit ? "更新" : "保存";
  deleteLinkButton.hidden = !isEdit;

  const nextHash = isEdit ? `#/detail/${entry.id}/link/${link.id}` : `#/detail/${entry.id}/new-link`;
  if (location.hash !== nextHash) location.hash = nextHash;
  setTimeout(() => linkTitleInput.focus(), 0);
}

function showFolderForm(folder) {
  const isEdit = Boolean(folder);
  setScreen("folderForm", isEdit ? "フォルダ編集" : "新規フォルダ");
  editingFolderId.value = folder?.id || "";
  folderNameInput.value = folder?.name || "";
  saveFolderButton.textContent = isEdit ? "更新" : "保存";
  deleteFolderButton.hidden = !isEdit;

  const nextHash = isEdit ? `#/folder-edit/${folder.id}` : "#/new-folder";
  if (location.hash !== nextHash) location.hash = nextHash;
  setTimeout(() => folderNameInput.focus(), 0);
}

function showEntryForm(entry) {
  const isEdit = Boolean(entry);
  const folderId = entry?.folderId || activeFolderId || getFallbackFolderId();
  activeFolderId = folderId;

  setScreen("form", isEdit ? "ファイル編集" : "新規ファイル");
  editingId.value = entry?.id || "";
  titleInput.value = entry?.title || "";
  urlInput.value = entry?.url || "";
  passwordInput.value = entry?.password || "";
  imageInput.value = "";
  pendingImageBlob = null;
  pendingImageRemoved = false;
  saveButton.textContent = isEdit ? "更新" : "保存";
  deleteEntryButton.hidden = !isEdit;
  setImagePreviewEmpty();

  if (entry?.imageId) {
    setImagePreviewFromStored(entry.imageId);
  }

  const nextHash = isEdit ? `#/edit/${entry.id}` : "#/new-file";
  if (location.hash !== nextHash) location.hash = nextHash;
  setTimeout(() => titleInput.focus(), 0);
}

function goBack() {
  if (screens.detail.classList.contains("is-active")) {
    location.hash = "#/";
    return;
  }

  if (screens.form.classList.contains("is-active")) {
    location.hash = "#/";
    return;
  }

  if (screens.linkForm.classList.contains("is-active")) {
    location.hash = "#/";
    return;
  }

  if (screens.folderForm.classList.contains("is-active")) {
    location.hash = "#/";
  }
}

function cancelEntryEdit() {
  location.hash = "#/";
}

function deleteEditingFolder() {
  const folder = findFolder(editingFolderId.value);
  if (folder) deleteFolder(folder);
}

function deleteEditingEntry() {
  const entry = findEntry(editingId.value);
  if (entry) deleteEntry(entry);
}

function deleteEditingLink() {
  const entry = findEntry(parentEntryId.value);
  const link = entry ? findLink(entry, editingLinkId.value) : null;
  if (entry && link) deleteLink(entry, link);
}

function saveFolder(event) {
  event.preventDefault();
  const name = folderNameInput.value.trim();

  if (!name) {
    showToast("作品系統を入力してください");
    return;
  }

  const now = new Date().toISOString();
  const currentId = editingFolderId.value;

  if (currentId) {
    data.folders = data.folders.map((folder) =>
      folder.id === currentId ? { ...folder, name, updatedAt: now } : folder
    );
    saveData();
    showToast("フォルダを更新しました");
    location.hash = "#/";
    return;
  }

  const folder = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
  data.folders = [...data.folders, folder];
  activeFolderId = folder.id;
  saveData();
  showToast("フォルダを保存しました");
  location.hash = "#/";
}

async function saveEntry(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const url = normalizeUrl(urlInput.value.trim());
  const password = passwordInput.value.trim();
  const folderId = activeFolderId || getFallbackFolderId();

  if (!title || !url || !password) {
    showToast("タイトル、URL、PWを入力してください");
    return;
  }

  try {
    new URL(url);
  } catch {
    showToast("URLを確認してください");
    return;
  }

  const now = new Date().toISOString();
  const currentId = editingId.value;
  const existing = currentId ? findEntry(currentId) : null;
  let imageId = existing?.imageId || "";

  try {
    if (pendingImageRemoved && imageId) {
      await deleteImage(imageId);
      imageId = "";
    }

    if (pendingImageBlob) {
      if (imageId) await deleteImage(imageId);
      imageId = crypto.randomUUID();
      await putImage(imageId, pendingImageBlob);
    }
  } catch {
    showToast("画像の保存に失敗しました");
    return;
  }

  if (currentId) {
    data.entries = data.entries.map((entry) =>
      entry.id === currentId
        ? { ...entry, folderId, title, url, password, imageId, links: normalizeLinks(entry.links), updatedAt: now }
        : entry
    );
    saveData();
    showToast("ファイルを更新しました");
    activeFolderId = folderId;
    activeEntryId = currentId;
    location.hash = "#/";
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    folderId,
    title,
    url,
    password,
    imageId,
    links: [],
    createdAt: now,
    updatedAt: now,
  };
  data.entries = [...data.entries, entry];
  activeFolderId = folderId;
  activeEntryId = entry.id;
  saveData();
  showToast("ファイルを保存しました");
  location.hash = "#/";
}

function saveLink(event) {
  event.preventDefault();

  const entry = findEntry(parentEntryId.value);
  if (!entry) {
    showToast("親ファイルが見つかりません");
    location.hash = "#/";
    return;
  }

  const title = linkTitleInput.value.trim();
  const url = normalizeUrl(linkUrlInput.value.trim());
  if (!title || !url) {
    showToast("タイトル、URLを入力してください");
    return;
  }

  try {
    new URL(url);
  } catch {
    showToast("URLを確認してください");
    return;
  }

  const now = new Date().toISOString();
  const currentId = editingLinkId.value;
  const links = normalizeLinks(entry.links);
  const nextLinks = currentId
    ? links.map((link) => (link.id === currentId ? { ...link, title, url, updatedAt: now } : link))
    : [...links, { id: crypto.randomUUID(), title, url, createdAt: now, updatedAt: now }];

  data.entries = data.entries.map((item) =>
    item.id === entry.id ? { ...item, links: nextLinks, updatedAt: now } : item
  );
  activeFolderId = entry.folderId || activeFolderId;
  activeEntryId = entry.id;
  saveData();
  showToast(currentId ? "キャプチャURLを更新しました" : "キャプチャURLを保存しました");
  location.hash = "#/";
}

function renderFolders() {
  folderEmptyState.hidden = data.folders.length > 0;
  folderList.innerHTML = data.folders.map(renderFolder).join("");
  hydrateImages(folderList);
}

function scrollEntryToTop(entryId) {
  requestAnimationFrame(() => {
    const entryElement = [...folderList.querySelectorAll("[data-id]")].find((item) => item.dataset.id === entryId);
    entryElement?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  activeEntryId = "";
  editModeButton.textContent = isEditMode ? "完了" : "編集";
  editModeButton.classList.toggle("is-active", isEditMode);
  editActions.hidden = !isEditMode;
  renderFolders();
}

function startListDrag(event) {
  if (!isEditMode) return;
  if (event.target.closest("button, input, textarea, select, a")) return;
  const item = getDragItem(event.target);
  if (!item) return;

  event.preventDefault();
  dragState = {
    ...item,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  item.element.classList.add("is-dragging");
  document.body.classList.add("is-reordering");
  item.element.setPointerCapture?.(event.pointerId);
}

function moveListDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const deltaY = event.clientY - dragState.startY;
  const deltaX = event.clientX - dragState.startX;
  if (Math.abs(deltaY) > 4 || Math.abs(deltaX) > 4) dragState.moved = true;
  dragState.element.style.transform = `translateY(${deltaY}px)`;
}

function endListDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const state = dragState;
  dragState = null;
  state.element.classList.remove("is-dragging");
  state.element.style.transform = "";
  document.body.classList.remove("is-reordering");

  if (state.moved) {
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 250);
    state.element.style.pointerEvents = "none";
    const target = document.elementFromPoint(event.clientX, event.clientY);
    state.element.style.pointerEvents = "";
    const targetItem = target ? getDragItem(target) : null;
    if (targetItem && canDropItem(state, targetItem) && state.id !== targetItem.id) {
      const rect = targetItem.element.getBoundingClientRect();
      reorderItem(state, targetItem, event.clientY > rect.top + rect.height / 2);
    }
  }
}

function getDragItem(target) {
  const linkElement = target.closest("[data-link-id]");
  if (linkElement && folderList.contains(linkElement)) {
    const entryElement = linkElement.closest("[data-id]");
    return {
      type: "link",
      id: linkElement.dataset.linkId,
      parentId: entryElement?.dataset.id || "",
      element: linkElement,
    };
  }

  const entryElement = target.closest("[data-id]");
  if (entryElement && folderList.contains(entryElement)) {
    return {
      type: "entry",
      id: entryElement.dataset.id,
      parentId: findEntry(entryElement.dataset.id)?.folderId || "",
      element: entryElement,
    };
  }

  const folderElement = target.closest("[data-folder-id]");
  if (folderElement && folderList.contains(folderElement)) {
    return {
      type: "folder",
      id: folderElement.dataset.folderId,
      parentId: "",
      element: folderElement,
    };
  }

  return null;
}

function canDropItem(source, target) {
  if (source.type === target.type && source.parentId === target.parentId) return true;
  if (source.type === "entry" && target.type === "folder") return source.parentId !== target.id;
  if (source.type === "entry" && target.type === "entry") return source.parentId !== target.parentId;
  if (source.type === "link" && target.type === "entry") return source.parentId !== target.id;
  if (source.type === "link" && target.type === "link") return source.parentId !== target.parentId;
  return false;
}

function reorderItem(source, target, placeAfter) {
  if (source.type === "folder") {
    data.folders = reorderArrayById(data.folders, source.id, target.id, placeAfter);
  }

  if (source.type === "entry") {
    if (target.type === "folder") {
      moveEntryToFolder(source.id, target.id);
    } else if (source.parentId === target.parentId) {
      const siblings = data.entries.filter((entry) => entry.folderId === source.parentId);
      const reordered = reorderArrayById(siblings, source.id, target.id, placeAfter);
      let index = 0;
      data.entries = data.entries.map((entry) => (entry.folderId === source.parentId ? reordered[index++] : entry));
    } else {
      moveEntryNearEntry(source.id, target.id, placeAfter);
    }
  }

  if (source.type === "link") {
    if (target.type === "entry") {
      moveLinkToEntry(source.id, source.parentId, target.id);
    } else if (source.parentId === target.parentId) {
      const entry = findEntry(source.parentId);
      if (entry) entry.links = reorderArrayById(normalizeLinks(entry.links), source.id, target.id, placeAfter);
    } else {
      moveLinkNearLink(source.id, source.parentId, target.parentId, target.id, placeAfter);
    }
  }

  saveData();
  renderFolders();
}

function moveEntryToFolder(entryId, folderId) {
  const entry = findEntry(entryId);
  if (!entry || !findFolder(folderId)) return;

  const now = new Date().toISOString();
  const movedEntry = { ...entry, folderId, updatedAt: now };
  const rest = data.entries.filter((item) => item.id !== entryId);
  const lastFolderIndex = findLastIndex(rest, (item) => item.folderId === folderId);
  rest.splice(lastFolderIndex + 1, 0, movedEntry);
  data.entries = rest;
  activeFolderId = folderId;
  activeEntryId = entryId;
}

function moveEntryNearEntry(entryId, targetId, placeAfter) {
  const entry = findEntry(entryId);
  const target = findEntry(targetId);
  if (!entry || !target || entry.id === target.id) return;

  const now = new Date().toISOString();
  const movedEntry = { ...entry, folderId: target.folderId, updatedAt: now };
  const rest = data.entries.filter((item) => item.id !== entryId);
  const targetIndex = rest.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return;

  rest.splice(targetIndex + (placeAfter ? 1 : 0), 0, movedEntry);
  data.entries = rest;
  activeFolderId = target.folderId;
  activeEntryId = entryId;
}

function moveLinkToEntry(linkId, sourceEntryId, targetEntryId) {
  const sourceEntry = findEntry(sourceEntryId);
  const targetEntry = findEntry(targetEntryId);
  if (!sourceEntry || !targetEntry || sourceEntry.id === targetEntry.id) return;

  const link = findLink(sourceEntry, linkId);
  if (!link) return;

  sourceEntry.links = normalizeLinks(sourceEntry.links).filter((item) => item.id !== linkId);
  targetEntry.links = [...normalizeLinks(targetEntry.links), { ...link }];
  targetEntry.updatedAt = new Date().toISOString();
  activeFolderId = targetEntry.folderId;
  activeEntryId = targetEntry.id;
}

function moveLinkNearLink(linkId, sourceEntryId, targetEntryId, targetLinkId, placeAfter) {
  const sourceEntry = findEntry(sourceEntryId);
  const targetEntry = findEntry(targetEntryId);
  if (!sourceEntry || !targetEntry || sourceEntry.id === targetEntry.id) return;

  const link = findLink(sourceEntry, linkId);
  if (!link) return;

  sourceEntry.links = normalizeLinks(sourceEntry.links).filter((item) => item.id !== linkId);
  const targetLinks = normalizeLinks(targetEntry.links);
  const targetIndex = targetLinks.findIndex((item) => item.id === targetLinkId);
  if (targetIndex < 0) return;

  targetLinks.splice(targetIndex + (placeAfter ? 1 : 0), 0, { ...link });
  targetEntry.links = targetLinks;
  targetEntry.updatedAt = new Date().toISOString();
  activeFolderId = targetEntry.folderId;
  activeEntryId = targetEntry.id;
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function reorderArrayById(items, sourceId, targetId, placeAfter) {
  const next = [...items];
  const sourceIndex = next.findIndex((item) => item.id === sourceId);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const [item] = next.splice(sourceIndex, 1);
  const adjustedTargetIndex = next.findIndex((target) => target.id === targetId);
  next.splice(adjustedTargetIndex + (placeAfter ? 1 : 0), 0, item);
  return next;
}

function renderFolder(folder) {
  const entries = data.entries.filter((entry) => entry.folderId === folder.id);
  const isOpen = activeFolderId === folder.id;
  const addFileButton = isEditMode
    ? '<button class="add-file-button" type="button" data-action="add-file">作品ファイルを追加</button>'
    : "";
  const fileList = isOpen
    ? `
      <div class="folder-files">
        ${addFileButton}
        ${
          entries.length
            ? entries.map(renderListEntry).join("")
            : '<div class="folder-file-empty">ファイルなし</div>'
        }
      </div>
    `
    : "";

  return `
    <article class="folder-card ${isOpen ? "is-open" : ""} ${isEditMode ? "is-editing" : ""}" data-folder-id="${folder.id}" tabindex="0">
      <div class="folder-row">
        <div class="folder-icon" aria-hidden="true">${isOpen ? "▾" : "▸"}</div>
        <div class="folder-main">
          <h2 class="card-title">${escapeHtml(folder.name)}</h2>
          <p class="card-meta">${entries.length}作品ファイル</p>
        </div>
        ${
          isEditMode
            ? `<div class="folder-actions">
                <button class="mini-button" type="button" data-action="edit-folder">編集</button>
              </div>`
            : ""
        }
      </div>
      ${fileList}
    </article>
  `;
}

function renderListEntry(entry) {
  const links = normalizeLinks(entry.links);
  const isOpen = activeEntryId === entry.id;
  const addLinkButton = isEditMode
    ? '<button class="add-file-button nested-add-button" type="button" data-action="add-link">キャプチャURLを追加</button>'
    : "";
  const childList = isOpen
    ? `
      <div class="entry-files">
        ${addLinkButton}
        ${
          links.length
            ? links.map(renderLinkItem).join("")
            : '<div class="folder-file-empty">キャプチャURLなし</div>'
        }
      </div>
    `
    : "";
  return `
    <article class="entry-group ${isOpen ? "is-open" : ""}" data-id="${entry.id}" tabindex="0">
      <div class="video-card ${isEditMode ? "is-editing" : ""}">
        <div class="card-thumb" data-image-id="${escapeHtml(entry.imageId || "")}">
          <span>${entry.imageId ? "" : "No Image"}</span>
        </div>
        <div class="video-card-main">
          <h2 class="card-title">${escapeHtml(entry.title)}</h2>
        </div>
        <div class="entry-actions">
          ${
            isEditMode
              ? `<button class="mini-button" type="button" data-action="edit-entry">編集</button>`
              : `<button class="card-open" type="button" data-action="open-entry">開く</button>`
          }
        </div>
      </div>
      ${childList}
    </article>
  `;
}

function renderDetail(entry) {
  const folder = findFolder(entry.folderId);
  const links = normalizeLinks(entry.links);
  return `
    <div class="detail-panel">
      <section class="detail-cover" data-image-id="${escapeHtml(entry.imageId || "")}">
        <span>${entry.imageId ? "" : "No Image"}</span>
      </section>

      <section class="detail-hero">
        <p class="detail-folder">${escapeHtml(folder?.name || "未分類")}</p>
        <h2>${escapeHtml(entry.title)}</h2>
        <p class="detail-url">${escapeHtml(entry.url || "")}</p>
      </section>

      <div class="action-grid">
        <button class="primary-button" type="button" data-action="open-entry">PWコピーして開く</button>
        <button class="secondary-button" type="button" data-action="edit">編集</button>
      </div>

      <section class="info-block">
        <p class="info-label">パスワード</p>
        <div class="password-line">
          <code>${maskPassword(entry.password || "")}</code>
          <button class="ghost-button" type="button" data-action="copy-entry">コピー</button>
        </div>
      </section>

      <section class="link-list-block">
        <p class="info-label">キャプチャURL</p>
        ${
          links.length
            ? links.map(renderLinkItem).join("")
            : '<div class="folder-file-empty">キャプチャURLなし</div>'
        }
      </section>

    </div>
  `;
}

function renderLinkDetail(entry, link) {
  const folder = findFolder(entry.folderId);
  return `
    <div class="detail-panel is-link-detail">
      <section class="detail-cover" data-image-id="${escapeHtml(entry.imageId || "")}">
        <span>${entry.imageId ? "" : "No Image"}</span>
      </section>

      <section class="detail-hero">
        <p class="detail-folder">${escapeHtml(folder?.name || "未分類")}</p>
        <h2>${escapeHtml(entry.title)}</h2>
        <p class="detail-url">${escapeHtml(link.title)}</p>
      </section>

      <div class="action-grid">
        <button class="primary-button" type="button" data-action="open-link">PWコピーして開く</button>
      </div>

      <section class="info-block">
        <p class="info-label">パスワード</p>
        <div class="password-line">
          <code>${maskPassword(entry.password || "")}</code>
          <button class="ghost-button" type="button" data-action="copy-entry">コピー</button>
        </div>
      </section>

      <section class="info-block">
        <p class="info-label">子URL</p>
        <div class="url-copy-line">
          <p>${escapeHtml(link.url || "")}</p>
          <button class="ghost-button" type="button" data-action="copy-link-url">コピー</button>
        </div>
      </section>

      <section class="info-block">
        <p class="info-label">親URL</p>
        <div class="url-copy-line">
          <p>${escapeHtml(entry.url || "")}</p>
          <button class="ghost-button" type="button" data-action="copy-entry-url">コピー</button>
        </div>
      </section>
    </div>
  `;
}

function renderLinkItem(link) {
  return `
    <article class="link-card ${isEditMode ? "is-editing" : ""}" data-link-id="${escapeHtml(link.id)}">
      <div class="link-card-main">
        <h3 class="card-title">${escapeHtml(link.title)}</h3>
        <p class="card-meta">${escapeHtml(hostnameOf(link.url))}</p>
      </div>
      <div class="link-actions">
        ${
          isEditMode
            ? `<button class="mini-button" type="button" data-action="edit-link">編集</button>`
            : `<button class="card-open" type="button" data-action="open-link">開く</button>`
        }
      </div>
    </article>
  `;
}

function deleteFolder(folder) {
  const count = data.entries.filter((entry) => entry.folderId === folder.id).length;
  const message = count
    ? `「${folder.name}」には${count}件のファイルがあります。フォルダだけ削除して、ファイルは未分類へ移動しますか？`
    : `「${folder.name}」を削除しますか？`;
  if (!window.confirm(message)) return;

  const fallbackId = ensureFallbackFolder(folder.id);
  data.entries = data.entries.map((entry) =>
    entry.folderId === folder.id ? { ...entry, folderId: fallbackId } : entry
  );
  data.folders = data.folders.filter((item) => item.id !== folder.id);
  if (activeFolderId === folder.id) activeFolderId = "";
  saveData();
  showToast("フォルダを削除しました");
  renderFolders();
}

async function deleteEntry(entry) {
  const confirmed = window.confirm(`「${entry.title}」を削除しますか？`);
  if (!confirmed) return;

  if (entry.imageId) await deleteImage(entry.imageId);
  data.entries = data.entries.filter((item) => item.id !== entry.id);
  if (activeEntryId === entry.id) activeEntryId = "";
  saveData();
  showToast("削除しました");
  location.hash = "#/";
}

function deleteLink(entry, link) {
  const confirmed = window.confirm(`「${link.title}」を削除しますか？`);
  if (!confirmed) return;

  const now = new Date().toISOString();
  data.entries = data.entries.map((item) =>
    item.id === entry.id
      ? { ...item, links: normalizeLinks(item.links).filter((target) => target.id !== link.id), updatedAt: now }
      : item
  );
  saveData();
  showToast("URL/PWを削除しました");
  if (screens.detail.classList.contains("is-active")) showDetail(findEntry(entry.id));
  else renderFolders();
}

async function handleImageSelection() {
  const file = imageInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    imageInput.value = "";
    showToast("画像ファイルを選んでください");
    return;
  }

  try {
    const sourceUrl = URL.createObjectURL(file);
    openCropModal(sourceUrl);
  } catch {
    imageInput.value = "";
    pendingImageBlob = null;
    showToast("画像を読み込めませんでした");
  }
}

function setImagePreviewEmpty() {
  revokePreviewUrl();
  imagePreview.innerHTML = "<span>画像なし</span>";
}

function setImagePreviewFromBlob(blob) {
  revokePreviewUrl();
  previewUrl = URL.createObjectURL(blob);
  imagePreview.innerHTML = `<img src="${previewUrl}" alt="">`;
}

async function setImagePreviewFromStored(imageId) {
  const blob = await getImage(imageId);
  if (!blob) {
    setImagePreviewEmpty();
    return;
  }
  setImagePreviewFromBlob(blob);
}

function revokePreviewUrl() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
}

function openCropModal(sourceUrl) {
  revokeCropSourceUrl();
  cropSourceUrl = sourceUrl;
  cropPointers.clear();
  cropGesture = null;
  cropState = { x: 0, y: 0, zoom: 1 };
  cropZoomInput.value = "1";
  cropImage.src = sourceUrl;
  cropModal.hidden = false;
  cropImage.onload = updateCropImageLayout;
  setTimeout(updateCropImageLayout, 0);
}

function closeCropModal() {
  cropModal.hidden = true;
  cropImage.removeAttribute("src");
  cropPointers.clear();
  cropGesture = null;
  revokeCropSourceUrl();
}

function revokeCropSourceUrl() {
  if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
  cropSourceUrl = "";
}

function startCropDrag(event) {
  if (event.target.closest(".crop-controls")) return;
  event.preventDefault();
  cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  cropStage.setPointerCapture(event.pointerId);
  resetCropGesture();
}

function moveCropDrag(event) {
  if (!cropPointers.has(event.pointerId)) return;
  event.preventDefault();
  cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (cropGesture?.type === "pan" && cropPointers.size === 1) {
    const point = cropPointers.get(event.pointerId);
    cropState.x = cropGesture.originX + point.x - cropGesture.startX;
    cropState.y = cropGesture.originY + point.y - cropGesture.startY;
  } else if (cropGesture?.type === "pinch" && cropPointers.size >= 2) {
    const [first, second] = getCropPointerPair();
    const center = getPointCenter(first, second);
    const distance = getPointDistance(first, second);
    cropState.zoom = clamp(cropGesture.originZoom * (distance / cropGesture.startDistance), 1, 3);
    cropState.x = cropGesture.originX + center.x - cropGesture.startCenter.x;
    cropState.y = cropGesture.originY + center.y - cropGesture.startCenter.y;
    cropZoomInput.value = cropState.zoom.toFixed(2);
  }

  updateCropImageLayout();
}

function endCropDrag(event) {
  if (!cropPointers.has(event.pointerId)) return;
  cropPointers.delete(event.pointerId);
  if (cropStage.hasPointerCapture(event.pointerId)) {
    cropStage.releasePointerCapture(event.pointerId);
  }
  resetCropGesture();
}

function resetCropGesture() {
  if (cropPointers.size === 1) {
    const [point] = cropPointers.values();
    cropGesture = {
      type: "pan",
      startX: point.x,
      startY: point.y,
      originX: cropState.x,
      originY: cropState.y,
    };
    return;
  }

  if (cropPointers.size >= 2) {
    const [first, second] = getCropPointerPair();
    cropGesture = {
      type: "pinch",
      startCenter: getPointCenter(first, second),
      startDistance: getPointDistance(first, second),
      originX: cropState.x,
      originY: cropState.y,
      originZoom: cropState.zoom,
    };
    return;
  }

  cropGesture = null;
}

function getCropPointerPair() {
  return Array.from(cropPointers.values()).slice(0, 2);
}

function getPointCenter(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function getPointDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y) || 1;
}

function getCropMetrics() {
  const frameRect = cropFrame.getBoundingClientRect();
  const stageRect = cropStage.getBoundingClientRect();
  const naturalWidth = cropImage.naturalWidth || 1;
  const naturalHeight = cropImage.naturalHeight || 1;
  const baseScale = Math.max(frameRect.width / naturalWidth, frameRect.height / naturalHeight);
  const scale = baseScale * cropState.zoom;
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const left = frameRect.left - stageRect.left + frameRect.width / 2 + cropState.x - width / 2;
  const top = frameRect.top - stageRect.top + frameRect.height / 2 + cropState.y - height / 2;

  return { frameRect, stageRect, naturalWidth, naturalHeight, width, height, left, top };
}

function updateCropImageLayout() {
  if (cropModal.hidden || !cropImage.naturalWidth) return;
  let metrics = getCropMetrics();
  const frameLeft = metrics.frameRect.left - metrics.stageRect.left;
  const frameTop = metrics.frameRect.top - metrics.stageRect.top;
  const frameRight = frameLeft + metrics.frameRect.width;
  const frameBottom = frameTop + metrics.frameRect.height;

  if (metrics.left > frameLeft) cropState.x -= metrics.left - frameLeft;
  if (metrics.left + metrics.width < frameRight) cropState.x += frameRight - (metrics.left + metrics.width);
  if (metrics.top > frameTop) cropState.y -= metrics.top - frameTop;
  if (metrics.top + metrics.height < frameBottom) cropState.y += frameBottom - (metrics.top + metrics.height);

  metrics = getCropMetrics();
  cropImage.style.width = `${metrics.width}px`;
  cropImage.style.height = `${metrics.height}px`;
  cropImage.style.left = `${metrics.left}px`;
  cropImage.style.top = `${metrics.top}px`;
}

async function saveCroppedImage() {
  try {
    const blob = await cropAdjustedImage();
    pendingImageBlob = blob;
    pendingImageRemoved = false;
    setImagePreviewFromBlob(blob);
    imageInput.value = "";
    closeCropModal();
    showToast(`画像を調整しました (${formatBytes(blob.size)})`);
  } catch {
    showToast("画像の調整に失敗しました");
  }
}

function cropAdjustedImage() {
  const metrics = getCropMetrics();
  const frameLeft = metrics.frameRect.left - metrics.stageRect.left;
  const frameTop = metrics.frameRect.top - metrics.stageRect.top;
  const scaleX = metrics.naturalWidth / metrics.width;
  const scaleY = metrics.naturalHeight / metrics.height;
  const sourceX = clamp((frameLeft - metrics.left) * scaleX, 0, metrics.naturalWidth);
  const sourceY = clamp((frameTop - metrics.top) * scaleY, 0, metrics.naturalHeight);
  const sourceWidth = clamp(metrics.frameRect.width * scaleX, 1, metrics.naturalWidth - sourceX);
  const sourceHeight = clamp(metrics.frameRect.height * scaleY, 1, metrics.naturalHeight - sourceY);
  const outputWidth = 690;
  const outputHeight = 600;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.drawImage(
    cropImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Crop failed"));
      },
      "image/jpeg",
      IMAGE_QUALITY
    );
  });
}

async function openEntry(entry) {
  await copyPassword(entry.password);
  window.open(entry.url, "_blank", "noopener,noreferrer");
  showToast("PWをコピーして開きました");
}

async function openLink(link, entry) {
  await copyPassword(entry.password);
  window.open(link.url, "_blank", "noopener,noreferrer");
  showToast("PWをコピーして開きました");
}

async function copyPassword(password) {
  try {
    await navigator.clipboard.writeText(password);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = password;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch {}

  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return migrateEntries(parsed);
      return normalizeData(parsed);
    } catch {}
  }

  return { folders: [], entries: [] };
}

function migrateEntries(entries) {
  if (!entries.length) return { folders: [], entries: [] };
  const now = new Date().toISOString();
  const folder = { id: crypto.randomUUID(), name: "未分類", createdAt: now, updatedAt: now };
  return {
    folders: [folder],
    entries: entries.map((entry) => normalizeEntry(entry, folder.id)),
  };
}

function normalizeData(value) {
  if (Array.isArray(value)) return migrateEntries(value);
  const folders = Array.isArray(value?.folders) ? value.folders : [];
  const entries = Array.isArray(value?.entries) ? value.entries : [];
  const fallbackId = folders[0]?.id || crypto.randomUUID();
  const normalizedFolders = folders.length
    ? folders
    : entries.length
      ? [{ id: fallbackId, name: "未分類", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      : [];

  return {
    folders: normalizedFolders,
    entries: entries.map((entry) => normalizeEntry(entry, fallbackId)),
  };
}

function saveData() {
  data.folders = data.folders.map((folder) => ({
    ...folder,
    createdAt: folder.createdAt || new Date().toISOString(),
    updatedAt: folder.updatedAt || folder.createdAt || new Date().toISOString(),
  }));
  data.entries = data.entries.map((entry) => normalizeEntry(entry, getFallbackFolderId()));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function findFolder(id) {
  return data.folders.find((folder) => folder.id === id);
}

function findEntry(id) {
  return data.entries.find((entry) => entry.id === id);
}

function findLink(entry, linkId) {
  return normalizeLinks(entry.links).find((link) => link.id === linkId);
}

function normalizeEntry(entry, fallbackId) {
  const now = new Date().toISOString();
  let links = normalizeLinks(entry.links);
  let url = normalizeUrl(entry.url || "");
  let password = entry.password || "";

  if ((!url || !password) && links.length) {
    const [mainLink, ...restLinks] = links;
    if (!url) url = mainLink.url || "";
    if (!password) password = mainLink.password || "";
    links = restLinks;
  }

  return {
    ...entry,
    folderId: entry.folderId || fallbackId,
    imageId: entry.imageId || "",
    url,
    password,
    links,
    updatedAt: entry.updatedAt || now,
    createdAt: entry.createdAt || now,
  };
}

function normalizeLinks(links) {
  const now = new Date().toISOString();
  return Array.isArray(links)
    ? links.map((link) => ({
        id: link.id || crypto.randomUUID(),
        title: link.title || "キャプチャURL",
        url: normalizeUrl(link.url || ""),
        password: link.password || "",
        note: link.note || "",
        createdAt: link.createdAt || now,
        updatedAt: link.updatedAt || link.createdAt || now,
      }))
    : [];
}

function ensureFallbackFolder(excludeId = "") {
  const existing = data.folders.find((folder) => folder.id !== excludeId && folder.name === "未分類");
  if (existing) return existing.id;

  const folder = {
    id: crypto.randomUUID(),
    name: "未分類",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.folders = [...data.folders.filter((item) => item.id !== excludeId), folder];
  return folder.id;
}

function getFallbackFolderId() {
  if (activeFolderId && findFolder(activeFolderId)) return activeFolderId;
  if (data.folders[0]) return data.folders[0].id;
  return ensureFallbackFolder();
}

function normalizeUrl(value) {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "URL";
  }
}

function maskPassword(password) {
  if (password.length <= 4) return "••••";
  return `${escapeHtml(password.slice(0, 2))}${"•".repeat(Math.min(password.length - 2, 10))}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2100);
}

async function hydrateImages(root) {
  const targets = [...root.querySelectorAll("[data-image-id]")].filter((node) => node.dataset.imageId);
  await Promise.all(
    targets.map(async (target) => {
      const blob = await getImage(target.dataset.imageId);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      target.innerHTML = `<img src="${url}" alt="">`;
      const img = target.querySelector("img");
      img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    })
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function compressImage(file) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Compression failed"));
      },
      "image/jpeg",
      IMAGE_QUALITY
    );
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    image.src = url;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function openImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IMAGE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function imageStore(mode, action) {
  const db = await openImageDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, mode);
    const store = transaction.objectStore(IMAGE_STORE_NAME);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function putImage(id, blob) {
  return imageStore("readwrite", (store) => store.put(blob, id));
}

function getImage(id) {
  return imageStore("readonly", (store) => store.get(id));
}

function deleteImage(id) {
  return imageStore("readwrite", (store) => store.delete(id));
}

installManifestWhenSupported();

function installManifestWhenSupported() {
  if (!["http:", "https:"].includes(location.protocol)) return;

  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "manifest.webmanifest";
  document.head.appendChild(manifest);
}

if ("serviceWorker" in navigator && ["http:", "https:"].includes(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
