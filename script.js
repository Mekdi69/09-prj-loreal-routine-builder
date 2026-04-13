/* Get references to DOM elements */
const CLOUDFLARE_WORKER_URL = "https://lorroutine.mekdimbekele.workers.dev";
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const clearSelectionsBtn = document.getElementById("clearSelections");
const userInput = document.getElementById("userInput");
const productDetailsModal = document.getElementById("productDetailsModal");
const productDetailsTitle = document.getElementById("productDetailsTitle");
const productDetailsDescription = document.getElementById(
  "productDetailsDescription",
);
const closeProductDetailsBtn = document.getElementById("closeProductDetails");
const PRODUCT_DETAILS_PLACEHOLDER_TEXT = "No product selected yet.";

/* Keep track of products currently visible and selected */
const selectedProducts = [];
let allProducts = [];
let visibleProducts = [];
let selectedCategory = "";
let conversationMessages = [];
const SELECTED_PRODUCTS_STORAGE_KEY = "lorealSelectedProducts";
let lastFocusedElement = null;
const MORNING_STEP_ORDER = ["Cleanser", "Treatment", "Moisturizer", "SPF"];
const EVENING_STEP_ORDER = ["Cleanser", "Treatment", "Moisturizer"];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  return fetch(`./products.json?v=${Date.now()}`)
    .then((res) => res.json())
    .then((data) => {
      console.log(data.products); // Log the products to verify they are loaded correctly
      displayProducts(data.products); // Display products after loading
      return data.products;
    });
}

/* Filter products by search term using name and keyword fields */
function matchesSearch(product, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const searchableText = [
    product.name,
    product.brand,
    product.category,
    product.description,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(searchTerm);
}

/* Apply category + search filters and refresh visible products */
function updateVisibleProducts() {
  const term = productSearch.value.trim().toLowerCase();

  if (!selectedCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products
      </div>
    `;
    visibleProducts = [];
    return;
  }

  const categoryProducts = allProducts.filter(
    (product) => product.category === selectedCategory,
  );

  const filteredProducts = categoryProducts.filter((product) =>
    matchesSearch(product, term),
  );

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products match your search.
      </div>
    `;
    visibleProducts = [];
    return;
  }

  displayProducts(filteredProducts);
}

/* Update the Selected Products section whenever the selection changes */
function renderSelectedProducts() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-placeholder">No product selected yet.</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
    <div class="selected-product-item">
      ${product.brand} - ${product.name}
    </div>
  `,
    )
    .join("");
}

function isProductSelected(productId) {
  return selectedProducts.some((product) => product.id === productId);
}

function toggleProductSelection(product) {
  const selectedIndex = selectedProducts.findIndex(
    (selectedProduct) => selectedProduct.id === product.id,
  );

  if (selectedIndex >= 0) {
    selectedProducts.splice(selectedIndex, 1);
  } else {
    selectedProducts.push(product);
  }

  renderSelectedProducts();
  saveSelectedProducts();
}

/* Save selected products to localStorage so choices persist on reload */
function saveSelectedProducts() {
  localStorage.setItem(
    SELECTED_PRODUCTS_STORAGE_KEY,
    JSON.stringify(selectedProducts),
  );
}

/* Restore selected products from localStorage and update the UI */
function restoreSelectedProducts() {
  const savedData = localStorage.getItem(SELECTED_PRODUCTS_STORAGE_KEY);

  if (!savedData) {
    return;
  }

  try {
    const parsedProducts = JSON.parse(savedData);

    if (!Array.isArray(parsedProducts)) {
      return;
    }

    selectedProducts.length = 0;
    selectedProducts.push(...parsedProducts);
    renderSelectedProducts();
  } catch {
    localStorage.removeItem(SELECTED_PRODUCTS_STORAGE_KEY);
  }
}

/* Clear selected products in memory, localStorage, and current card highlights */
function clearSelections() {
  selectedProducts.length = 0;
  localStorage.removeItem(SELECTED_PRODUCTS_STORAGE_KEY);
  renderSelectedProducts();

  const selectedCards = document.querySelectorAll(".product-card.selected");
  selectedCards.forEach((card) => {
    card.classList.remove("selected");
  });
}

/* Open modal with the selected product description */
function openProductDetails(product) {
  lastFocusedElement = document.activeElement;
  productDetailsTitle.textContent = `${product.brand} - ${product.name}`;
  productDetailsDescription.textContent = product.description;
  productDetailsModal.hidden = false;
  closeProductDetailsBtn.focus();
}

/* Close modal and return focus to where user was */
function closeProductDetails() {
  productDetailsModal.hidden = true;
  productDetailsTitle.textContent = "Product Details";
  productDetailsDescription.textContent = PRODUCT_DETAILS_PLACEHOLDER_TEXT;

  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
}

/* Return Cloudflare Worker endpoint (same-origin by default) */
function getWorkerEndpoint() {
  if (typeof CLOUDFLARE_WORKER_URL !== "undefined") {
    return CLOUDFLARE_WORKER_URL;
  }

  if (typeof WORKER_URL !== "undefined") {
    return WORKER_URL;
  }

  return "/api/routine";
}

/* Build a clean payload that includes only fields needed by the AI routine prompt */
function buildSelectedProductsPayload() {
  return {
    products: selectedProducts.map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    })),
  };
}

/* Escape user-facing text before inserting into HTML */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Add a chat message to the chat window and keep scroll at the latest message */
function appendChatMessage(role, content) {
  const speaker = role === "assistant" ? "Advisor" : "You";
  const safeContent = escapeHtml(content).replaceAll("\n", "<br>");

  chatWindow.innerHTML += `
    <p><strong>${speaker}:</strong> ${safeContent}</p>
  `;
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Match a selected product to a routine step using simple beginner-friendly keywords */
function matchesRoutineStep(product, stepName) {
  const searchableText =
    `${product.category} ${product.name} ${product.description}`.toLowerCase();

  if (stepName === "Cleanser") {
    return (
      searchableText.includes("cleanser") || searchableText.includes("cleanse")
    );
  }

  if (stepName === "Treatment") {
    return (
      searchableText.includes("treatment") ||
      searchableText.includes("serum") ||
      searchableText.includes("retinol") ||
      searchableText.includes("acid")
    );
  }

  if (stepName === "Moisturizer") {
    return (
      searchableText.includes("moisturizer") ||
      searchableText.includes("hydrat") ||
      searchableText.includes("cream") ||
      searchableText.includes("lotion")
    );
  }

  if (stepName === "SPF") {
    return (
      searchableText.includes("spf") ||
      searchableText.includes("sunscreen") ||
      searchableText.includes("sunblock") ||
      searchableText.includes("suncare")
    );
  }

  return false;
}

/* Build one routine line and avoid reusing the same product in multiple steps */
function buildRoutineStepLine(stepOrder) {
  const usedProductIds = [];

  const stepLabels = stepOrder.map((stepName) => {
    const matchingProduct = selectedProducts.find(
      (product) =>
        !usedProductIds.includes(product.id) &&
        matchesRoutineStep(product, stepName),
    );

    if (!matchingProduct) {
      return stepName;
    }

    usedProductIds.push(matchingProduct.id);
    return `${stepName} (${matchingProduct.brand} - ${matchingProduct.name})`;
  });

  return stepLabels.join(" \u2192 ");
}

/* Show a structured morning/evening step sequence above the AI response */
function appendRoutineStepOrderCard() {
  const morningLine = buildRoutineStepLine(MORNING_STEP_ORDER);
  const eveningLine = buildRoutineStepLine(EVENING_STEP_ORDER);

  chatWindow.innerHTML += `
    <div class="routine-steps-card" aria-label="Routine step order">
      <p class="routine-steps-title"><strong>Routine Step Order</strong></p>
      <p class="routine-steps-line"><strong>Morning:</strong> ${escapeHtml(morningLine)}</p>
      <p class="routine-steps-line"><strong>Evening:</strong> ${escapeHtml(eveningLine)}</p>
    </div>
  `;

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Send messages and optional selected products to the Cloudflare Worker */
async function requestAssistantReply(messages, productsPayload) {
  const endpoint = getWorkerEndpoint();

  if (!endpoint) {
    throw new Error("Missing Cloudflare Worker endpoint.");
  }

  const body = {
    messages,
    products: productsPayload,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  const isStructured =
    data &&
    typeof data === "object" &&
    data.success === true &&
    data.routine &&
    typeof data.routine.text === "string";

  if (!isStructured) {
    const errorMessage =
      data && data.error ? data.error : "Invalid Worker response.";
    throw new Error(errorMessage);
  }

  return {
    text: data.routine.text,
    metadata: data.metadata || {},
  };
}

/* Call the Cloudflare Worker and return the generated routine text */
async function generateRoutineFromSelectedProducts() {
  const payload = buildSelectedProductsPayload();
  const routineRequestText = `
Create a personalized morning and evening routine using only these selected products.
For each step, include the product name and a short reason.

Selected products JSON:
${JSON.stringify(payload, null, 2)}
  `.trim();

  conversationMessages = [
    {
      role: "user",
      content: routineRequestText,
    },
  ];

  const routineResult = await requestAssistantReply(
    conversationMessages,
    payload.products,
  );

  conversationMessages.push({
    role: "assistant",
    content: routineResult.text,
  });

  return routineResult;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  visibleProducts = products;

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card ${
      isProductSelected(product.id) ? "selected" : ""
    }" data-product-id="${product.id}" tabindex="0" aria-label="${product.name} by ${product.brand}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <div class="card-actions">
          <button
            class="details-btn"
            type="button"
            data-action="details"
            aria-label="View description for ${product.name}"
          >
            Details
          </button>
        </div>
        <p class="details-preview" aria-hidden="true">${product.description}</p>
      </div>
    </div>
  `,
    )
    .join("");
}

/* Let users click cards to select/unselect products */
productsContainer.addEventListener("click", (e) => {
  const detailsBtn = e.target.closest('[data-action="details"]');

  if (detailsBtn) {
    const productCard = detailsBtn.closest(".product-card");

    if (!productCard) {
      return;
    }

    const productId = Number(productCard.dataset.productId);
    const product = visibleProducts.find((item) => item.id === productId);

    if (product) {
      openProductDetails(product);
    }

    return;
  }

  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  const productId = Number(productCard.dataset.productId);
  const product = visibleProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  toggleProductSelection(product);
  productCard.classList.toggle("selected");
});

/* Support keyboard interaction for accessibility */
productsContainer.addEventListener("keydown", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  if (e.key === "Enter" || e.key === " ") {
    if (e.target.closest('[data-action="details"]')) {
      return;
    }

    e.preventDefault();

    const productId = Number(productCard.dataset.productId);
    const product = visibleProducts.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    toggleProductSelection(product);
    productCard.classList.toggle("selected");
  }
});

closeProductDetailsBtn.addEventListener("click", () => {
  closeProductDetails();
});

productDetailsModal.addEventListener("click", (e) => {
  if (e.target === productDetailsModal) {
    closeProductDetails();
  }
});

document.addEventListener("keydown", (e) => {
  if (!productDetailsModal.hidden && e.key === "Escape") {
    closeProductDetails();
  }
});

clearSelectionsBtn.addEventListener("click", () => {
  clearSelections();
  appendChatMessage("assistant", "Selections cleared.");
});

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  selectedCategory = e.target.value;
  updateVisibleProducts();
});

/* Real-time search: filter visible products by name/keyword while typing */
productSearch.addEventListener("input", () => {
  updateVisibleProducts();
});

/* Generate routine based only on selected products */
generateRoutineBtn.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    appendChatMessage("assistant", "Please select at least one product first.");
    return;
  }

  generateRoutineBtn.disabled = true;
  chatWindow.innerHTML = "";
  appendChatMessage("assistant", "Generating your routine...");

  try {
    const routineResult = await generateRoutineFromSelectedProducts();
    chatWindow.innerHTML = "";
    appendRoutineStepOrderCard();
    appendChatMessage("assistant", routineResult.text);
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
  } finally {
    generateRoutineBtn.disabled = false;
  }
});

/* Chat form submission handler for follow-up questions */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  if (conversationMessages.length === 0) {
    appendChatMessage(
      "assistant",
      "Generate a routine first, then ask follow-up questions.",
    );
    return;
  }

  appendChatMessage("user", question);
  conversationMessages.push({ role: "user", content: question });
  userInput.value = "";

  try {
    const payload = buildSelectedProductsPayload();
    const result = await requestAssistantReply(
      conversationMessages,
      payload.products,
    );
    const reply = result.text;
    conversationMessages.push({ role: "assistant", content: reply });
    appendChatMessage("assistant", reply);
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
  }
});

/* Show initial state for the Selected Products section */
renderSelectedProducts();
restoreSelectedProducts();

/* Load all products once and keep them in memory for fast filtering */
async function initializeProducts() {
  try {
    allProducts = await loadProducts();
  } catch {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Could not load products. Please refresh the page.
      </div>
    `;
  }
}

initializeProducts();
