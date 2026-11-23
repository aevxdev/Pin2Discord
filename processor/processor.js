console.log("Pin2Discord processor:", {
  url: location.href,
  chrome: typeof chrome,
  runtime: typeof chrome?.runtime,
  storage: typeof chrome?.storage,
  local: typeof chrome?.storage?.local
});


const status = document.getElementById("status");
let processing = false;

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
    const request = db.transaction("settings", "readonly")
      .objectStore("settings")
      .get("directoryHandle");

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function updateItem(id, changes) {
  const { queue = [] } = await chrome.storage.local.get("queue");
  const item = queue.find(item => item.id === id);

  if (!item) return;

  Object.assign(item, changes);
  await chrome.storage.local.set({ queue });
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

      if (response.ok) {
        const blob = await response.blob();

        if (blob.type.startsWith("image/")) {
          return blob;
        }
      }
    } catch (error) {
      console.warn("Не удалось загрузить:", candidate);
    }
  }

  throw new Error("Не удалось загрузить изображение Pinterest");
}


async function saveImage(image) {
  const directory = await getDirectoryHandle();

  if (!directory) throw new Error("Папка не выбрана");

  let permission = await directory.queryPermission({ mode: "readwrite" });

  if (permission !== "granted") {
    permission = await directory.requestPermission({ mode: "readwrite" });
  }

  if (permission !== "granted") throw new Error("Нет доступа к папке");

  const blob = await fetchPinterestImage(image.imageUrl);
  const extension = blob.type.includes("png") ? "png" : "jpg";
  const filename = `pin_${image.id}.${extension}`;

  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(blob);
  await writable.close();

  return filename;
}

async function sendToDiscord(image) {
  const { webhook = "", sendSource = true } =
    await chrome.storage.local.get(["webhook", "sendSource"]);

  if (!webhook) throw new Error("Discord Webhook не настроен");

  const blob = await fetchPinterestImage(image.imageUrl);

  const extension = blob.type.includes("png") ? "png" : "jpg";
  const formData = new FormData();

  formData.append("files[0]", blob, `pin_${image.id}.${extension}`);

  if (sendSource && image.sourceUrl) {
    formData.append("payload_json", JSON.stringify({
      content: `Источник: ${image.sourceUrl}`
    }));
  }

  const result = await fetch(webhook, {
    method: "POST",
    body: formData
  });

  if (!result.ok) {
    throw new Error(`Discord HTTP ${result.status}`);
  }
}

async function processImage(image) {
  const tasks = [];

  tasks.push(
    saveImage(image)
      .then(filename => updateItem(image.id, {
        downloadStatus: "done",
        filename
      }))
      .catch(error => updateItem(image.id, {
        downloadStatus: "error",
        downloadError: error.message
      }))
  );

  tasks.push(
    sendToDiscord(image)
      .then(() => updateItem(image.id, {
        discordStatus: "done"
      }))
      .catch(error => updateItem(image.id, {
        discordStatus: "error",
        discordError: error.message
      }))
  );

  await Promise.all(tasks);
}

async function processQueue() {
  if (processing) return;

  processing = true;

  try {
    status.textContent = "Обрабатываю очередь...";

    const { queue = [] } = await chrome.storage.local.get("queue");

    for (const image of queue) {
      if (
        image.downloadStatus === "done" &&
        image.discordStatus === "done"
      ) continue;

      await processImage(image);
    }

    status.textContent = "Обработка завершена";
  } catch (error) {
    console.error(error);
    status.textContent = "Ошибка обработки";
  } finally {
    processing = false;
  }
}

  status.textContent = "Обработка завершена";

processQueue();
