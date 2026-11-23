
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ADD_TO_QUEUE") {
    addToQueue(message)
      .then(async result => {
        if (result.success && !result.duplicate) {
          await chrome.tabs.create({
            url: chrome.runtime.getURL("processor/processor.html"),
            active: false
          });
        }

        sendResponse(result);
      })
      .catch(error => {
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }
});

async function addToQueue(message) {
  const { imageUrl, sourceUrl } = message;

  if (!imageUrl) throw new Error("Нет URL изображения");

  const url = new URL(imageUrl);

  if (url.protocol !== "https:" || url.hostname !== "i.pinimg.com") {
    throw new Error("Некорректный URL изображения");
  }

  const { queue = [] } = await chrome.storage.local.get("queue");

  if (queue.some(item => item.imageUrl === imageUrl)) {
    return { success: true, duplicate: true };
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

  return { success: true, duplicate: false };
}
