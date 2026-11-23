let creatingOffscreen = null;
let queueOperation = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      console.error("Pin2Discord:", error);

      sendResponse({
        success: false,
        error: error.message
      });
    });

  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "ADD_TO_QUEUE":
      return addToQueue(message);

    case "GET_PROCESSOR_QUEUE":
      return {
        success: true,
        queue: await getQueue()
      };

    case "GET_PROCESSOR_SETTINGS":
      return {
        success: true,
        ...(await chrome.storage.local.get({
          webhook: "",
          saveImages: true,
          sendSource: true
        }))
      };

    case "UPDATE_QUEUE_ITEM":
      await updateQueueItem(message.id, message.changes);

      return { success: true };

    case "OFFSCREEN_READY":
      return { success: true };

    default:
      return {
        success: false,
        error: "Неизвестный тип сообщения"
      };
  }
}

// Последовательное изменение очереди,
// чтобы параллельные обновления не перезаписывали друг друга.
function serializeQueueOperation(operation) {
  const result = queueOperation.then(operation);

  queueOperation = result.catch(() => {});

  return result;
}

async function getQueue() {
  const { queue = [] } = await chrome.storage.local.get("queue");
  return queue;
}

async function addToQueue(message) {
  const { imageUrl, sourceUrl } = message;

  if (!imageUrl) {
    throw new Error("Нет URL изображения");
  }

  const url = new URL(imageUrl);

  if (
    url.protocol !== "https:" ||
    url.hostname !== "i.pinimg.com"
  ) {
    throw new Error("Некорректный URL изображения");
  }

  const result = await serializeQueueOperation(async () => {
    const queue = await getQueue();

    if (queue.some(item => item.imageUrl === imageUrl)) {
      return {
        success: true,
        duplicate: true
      };
    }

    queue.push({
      id: crypto.randomUUID(),
      imageUrl,
      sourceUrl,
      status: "waiting",
      downloadStatus: "waiting",
      discordStatus: "waiting",
      addedAt: Date.now()
    });

    await chrome.storage.local.set({ queue });

    return {
      success: true,
      duplicate: false
    };
  });

  if (result.success && !result.duplicate) {
    await startProcessor();
  }

  return result;
}

async function updateQueueItem(id, changes) {
  return serializeQueueOperation(async () => {
    const queue = await getQueue();
    const item = queue.find(item => item.id === id);

    if (!item) {
      throw new Error("Элемент очереди не найден");
    }

    Object.assign(item, changes);

    await chrome.storage.local.set({ queue });
  });
}

async function ensureOffscreenDocument() {
  if (creatingOffscreen) {
    return creatingOffscreen;
  }

  creatingOffscreen = (async () => {
    const url = chrome.runtime.getURL("offscreen/offscreen.html");

    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url]
    });

    if (contexts.length > 0) {
      return;
    }

    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html",
      reasons: ["BLOBS"],
      justification:
        "Загрузка изображений Pinterest, обработка файлов и отправка в Discord."
    });
  })();

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function startProcessor() {
  await ensureOffscreenDocument();

  await chrome.runtime.sendMessage({
    type: "PROCESS_QUEUE"
  });
}