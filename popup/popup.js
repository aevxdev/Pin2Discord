
const queueCount = document.getElementById("queueCount");
const emptyState = document.getElementById("emptyState");
const imageGrid = document.getElementById("imageGrid");

const sendButton = document.getElementById("sendButton");
const clearButton = document.getElementById("clearButton");
const settingsButton = document.getElementById("settingsButton");

let images = [];

async function loadQueue() {
  const result = await chrome.storage.local.get({
    queue: []
  });

  images = result.queue;

  renderQueue();
}

function renderQueue() {
  const count = images.length;

  queueCount.textContent = `${count} изображений`;

  emptyState.style.display = count === 0 ? "flex" : "none";

  sendButton.disabled = count === 0;

  imageGrid.innerHTML = "";

  images.forEach((image) => {
    const card = document.createElement("div");
    card.className = "image-card";

    const img = document.createElement("img");
    img.src = image.imageUrl;

    img.alt = "Pinterest image";

    const removeButton = document.createElement("button");

    removeButton.className = "remove-image";
    removeButton.textContent = "×";

    removeButton.addEventListener("click", async () => {
      const queue = images.filter(
        item => item.id !== image.id
      );

      await chrome.storage.local.set({ queue });

      await loadQueue();
    });

    card.append(img, removeButton);
    imageGrid.appendChild(card);
  });
}

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.set({
    queue: []
  });

  await loadQueue();
});

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

sendButton.addEventListener("click", () => {
  alert("Отправку подключим следующим этапом!");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.queue) {
    loadQueue();
  }
});

loadQueue();
