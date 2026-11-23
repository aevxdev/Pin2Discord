let processing = false;

function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

async function getQueue() {
  const response = await sendToBackground({
    type: "GET_PROCESSOR_QUEUE"
  });

  if (!response?.success) {
    throw new Error(response?.error || "Не удалось получить очередь");
  }

  return response.queue;
}

async function getSettings() {
  const response = await sendToBackground({
    type: "GET_PROCESSOR_SETTINGS"
  });

  if (!response?.success) {
    throw new Error(response?.error || "Не удалось получить настройки");
  }

  return response;
}

async function updateItem(id, changes) {
  const response = await sendToBackground({
    type: "UPDATE_QUEUE_ITEM",
    id,
    changes
  });

  if (!response?.success) {
    throw new Error(response?.error || "Не удалось обновить очередь");
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("Pin2DiscordDB", 1);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getDirectoryHandle() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains("settings")) {
      resolve(null);
      return;
    }

    const transaction = db.transaction("settings", "readonly");

    const request = transaction
      .objectStore("settings")
      .get("directoryHandle");

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function fetchPinterestImage(url) {
  const candidates = [
    url,
    url.replace("/originals/", "/736x/"),
    url.replace("/originals/", "/474x/"),
    url.replace("/originals/", "/236x/")
  ];

  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate);

      if (!response.ok) continue;

      const blob = await response.blob();

      if (blob.type.startsWith("image/")) {
        return blob;
      }
    } catch (error) {
      console.warn("Не удалось загрузить:", candidate, error);
    }
  }

  throw new Error("Не удалось загрузить изображение Pinterest");
}

async function saveImage(image) {
  const directory = await getDirectoryHandle();

  if (!directory) {
    throw new Error("Папка не выбрана");
  }

  const permission = await directory.queryPermission({
    mode: "readwrite"
  });

  if (permission !== "granted") {
    throw new Error(
      "Нет доступа к папке. Открой настройки расширения и заново выбери папку."
    );
  }

  const blob = await fetchPinterestImage(image.imageUrl);

  const extension = blob.type.includes("png") ? "png" : "jpg";
  const filename = `pin_${image.id}.${extension}`;

  const fileHandle = await directory.getFileHandle(filename, {
    create: true
  });

  const writable = await fileHandle.createWritable();

  await writable.write(blob);
  await writable.close();

  return filename;
}

async function sendToDiscord(image, settings) {
  if (!settings.webhook) {
    throw new Error("Discord Webhook не настроен");
  }

  const blob = await fetchPinterestImage(image.imageUrl);

  const extension = blob.type.includes("png") ? "png" : "jpg";

  const formData = new FormData();

  formData.append(
    "files[0]",
    blob,
    `pin_${image.id}.${extension}`
  );

  if (settings.sendSource && image.sourceUrl) {
    formData.append(
      "payload_json",
      JSON.stringify({
        content: `Источник: ${image.sourceUrl}`
      })
    );
  }

  const response = await fetch(settings.webhook, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Discord HTTP ${response.status}`);
  }
}

async function processImage(image, settings) {
  const tasks = [];

  // Сохранение на компьютер
  if (settings.saveImages) {
    tasks.push(
      saveImage(image)
        .then(filename => {
          return updateItem(image.id, {
            downloadStatus: "done",
            filename,
            downloadError: null
          });
        })
        .catch(error => {
          console.error("Ошибка сохранения:", error);

          return updateItem(image.id, {
            downloadStatus: "error",
            downloadError: error.message
          });
        })
    );
  } else {
    tasks.push(
      updateItem(image.id, {
        downloadStatus: "skipped",
        downloadError: null
      })
    );
  }

  // Отправка в Discord
  tasks.push(
    sendToDiscord(image, settings)
      .then(() => {
        return updateItem(image.id, {
          discordStatus: "done",
          discordError: null
        });
      })
      .catch(error => {
        console.error("Ошибка Discord:", error);

        return updateItem(image.id, {
          discordStatus: "error",
          discordError: error.message
        });
      })
  );

  await Promise.all(tasks);
}

async function processQueue() {
  if (processing) return;

  processing = true;

  try {
    const settings = await getSettings();
    const queue = await getQueue();

    for (const image of queue) {
      const downloadFinished = [
        "done",
        "skipped"
      ].includes(image.downloadStatus);

      const discordFinished = image.discordStatus === "done";

      if (downloadFinished && discordFinished) {
        continue;
      }

      await processImage(image, settings);
    }
  } catch (error) {
    console.error("Pin2Discord processor:", error);
  } finally {
    processing = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROCESS_QUEUE") {
    processQueue();
    sendResponse({ success: true });
  }
});

sendToBackground({
  type: "OFFSCREEN_READY"
}).catch(console.error);