const webhookInput = document.getElementById("webhook");
const showWebhook = document.getElementById("showWebhook");

const saveImages = document.getElementById("saveImages");
const sendSource = document.getElementById("sendSource");

const saveButton = document.getElementById("saveButton");
const saveStatus = document.getElementById("saveStatus");

const chooseFolderButton = document.getElementById("chooseFolder");
const folderName = document.getElementById("folderName");
const folderStatus = document.getElementById("folderStatus");

let selectedDirectory = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("Pin2DiscordDB", 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectoryHandle(handle) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("settings", "readwrite");

    transaction.objectStore("settings").put(
      handle,
      "directoryHandle"
    );

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getDirectoryHandle() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("settings", "readonly");

    const request = transaction
      .objectStore("settings")
      .get("directoryHandle");

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function checkDirectory() {
  try {
    selectedDirectory = await getDirectoryHandle();

    if (!selectedDirectory) {
      folderName.textContent = "Папка не выбрана";
      folderStatus.textContent = "Выбери папку на компьютере";
      return;
    }

    const permission = await selectedDirectory.queryPermission({
      mode: "readwrite"
    });

    folderName.textContent = selectedDirectory.name;

    folderStatus.textContent = permission === "granted"
      ? "Доступ разрешён"
      : "Нужно повторно подтвердить доступ";

  } catch (error) {
    console.error(error);

    folderName.textContent = "Ошибка доступа";
    folderStatus.textContent = "Выбери папку заново";
  }
}

chooseFolderButton.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({
      mode: "readwrite"
    });

    const permission = await handle.requestPermission({
      mode: "readwrite"
    });

    if (permission !== "granted") {
      throw new Error("Нет разрешения на запись");
    }

    selectedDirectory = handle;

    await saveDirectoryHandle(handle);
    await checkDirectory();

  } catch (error) {
    if (error.name === "AbortError") return;

    console.error(error);

    folderStatus.textContent = error.message ||
      "Не удалось выбрать папку";
  }
});

showWebhook.addEventListener("change", () => {
  webhookInput.type = showWebhook.checked
    ? "text"
    : "password";
});

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    webhook: "",
    saveImages: true,
    sendSource: true
  });

  webhookInput.value = settings.webhook;
  saveImages.checked = settings.saveImages;
  sendSource.checked = settings.sendSource;

  await checkDirectory();
}

saveButton.addEventListener("click", async () => {
  try {
    await chrome.storage.local.set({
      webhook: webhookInput.value.trim(),
      saveImages: saveImages.checked,
      sendSource: sendSource.checked
    });

    saveStatus.textContent = "Настройки сохранены!";

  } catch (error) {
    console.error(error);
    saveStatus.textContent = "Ошибка сохранения настроек";
  }

  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2500);
});

loadSettings();