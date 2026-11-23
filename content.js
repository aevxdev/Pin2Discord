
const BUTTON_CLASS = "pin2discord-floating";
const pinButtons = new Map();

let animationFrame = null;

function getBestImageUrl(image) {
  const candidates = [];

  if (image.srcset) {
    image.srcset.split(",").forEach(entry => {
      const parts = entry.trim().split(/\s+/);
      const width = parseInt(parts[1]) || 0;

      if (parts[0]) {
        candidates.push({ url: parts[0], width });
      }
    });
  }

  candidates.push({
    url: image.currentSrc || image.src,
    width: 0
  });

  candidates.sort((a, b) => b.width - a.width);

  return (candidates[0]?.url || image.src)
    .replace(/\/\d+x\d+\//, "/originals/");
}

function getPinCard(image) {
  const pin = image.closest(
    '[data-test-id="pin"], [data-grid-item="true"]'
  );

  if (pin) return pin;

  const link = image.closest('a[href*="/pin/"]');

  return link?.parentElement || image.parentElement;
}

function getHost(card) {
  if (!card) return null;

  // Кнопка должна быть соседом ссылки, а не её содержимым.
  if (card.tagName === "A") {
    return card.parentElement;
  }

  return card;
}

function createButton(host) {
  const button = document.createElement("button");

  button.className = BUTTON_CLASS;
  button.type = "button";
  button.textContent = "+ Pin2Discord";

  Object.assign(button.style, {
    position: "absolute",
    display: "none",
    zIndex: "999999",
    padding: "7px 10px",
    border: "none",
    borderRadius: "7px",
    background: "#5865F2",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px #0006",
    pointerEvents: "auto"
  });

  const record = {
    button,
    image: null,
    host
  };

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (button.disabled || !record.image) return;

    button.disabled = true;
    button.textContent = "Добавляем...";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ADD_TO_QUEUE",
        imageUrl: getBestImageUrl(record.image),
        sourceUrl:
          record.image.closest('a[href*="/pin/"]')?.href ||
          location.href
      });

      if (!response?.success) {
        throw new Error(response?.error || "Ошибка добавления");
      }

      button.textContent = response.duplicate
        ? "Уже добавлено"
        : "✓ Добавлено";

    } catch (error) {
      console.error("Pin2Discord:", error);
      button.textContent = "Ошибка";
    }

    setTimeout(() => {
      button.disabled = false;
      button.textContent = "+ Pin2Discord";
      scheduleUpdate();
    }, 1800);
  });

  host.appendChild(button);

  return record;
}

function updateButtons() {
  const images = document.querySelectorAll(
    'img[src*="i.pinimg.com"], img[srcset*="i.pinimg.com"]'
  );

  const cards = new Map();

  images.forEach(image => {
    const rect = image.getBoundingClientRect();

    if (rect.width < 100 || rect.height < 100) return;

    const card = getPinCard(image);
    const host = getHost(card);

    if (!host || !host.isConnected) return;

    const existing = cards.get(host);
    const area = rect.width * rect.height;

    if (!existing || area > existing.area) {
      cards.set(host, { image, area });
    }
  });

  // Удаляем кнопки исчезнувших карточек.
  for (const [host, record] of pinButtons) {
    if (!cards.has(host) || !host.isConnected) {
      record.button.remove();
      pinButtons.delete(host);
    }
  }

  // Создаём кнопки и обновляем их положение.
  for (const [host, data] of cards) {
    let record = pinButtons.get(host);

    if (!record) {
      if (getComputedStyle(host).position === "static") {
        host.style.position = "relative";
      }

      record = createButton(host);
      pinButtons.set(host, record);
    }

    record.image = data.image;

    const imageRect = data.image.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const button = record.button;

    button.style.display = "block";

    const left = imageRect.left - hostRect.left + 8;
    const top =
      imageRect.bottom - hostRect.top -
      button.offsetHeight - 8;

    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  }
}

function scheduleUpdate() {
  if (animationFrame !== null) return;

  animationFrame = requestAnimationFrame(() => {
    animationFrame = null;
    updateButtons();
  });
}

// Следим за изменениями Pinterest.
const observer = new MutationObserver(scheduleUpdate);

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src", "srcset"]
});

// Обновляем координаты только при изменениях размеров.
const resizeObserver = new ResizeObserver(scheduleUpdate);

function observeImages() {
  document.querySelectorAll(
    'img[src*="i.pinimg.com"], img[srcset*="i.pinimg.com"]'
  ).forEach(image => {
    resizeObserver.observe(image);

    const host = getHost(getPinCard(image));

    if (host) {
      resizeObserver.observe(host);
    }
  });
}

const imageObserver = new MutationObserver(() => {
  observeImages();
});

imageObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

observeImages();
scheduleUpdate();
