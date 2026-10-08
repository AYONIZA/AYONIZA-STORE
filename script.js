import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// =====================================================
// FIREBASE
// Firestore bhaari hai, isliye sirf zarurat par load hota hai.
// =====================================================

const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(app);

let fsPromise;
const fs = () =>
  (fsPromise ||= import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    .then((m) => ({ m, db: m.getFirestore(app) })));

let currentUser = null;
const authReady = new Promise((resolve) =>
  onAuthStateChanged(auth, (u) => { currentUser = u; resolve(u); })
);

async function getUser() {
  await Promise.race([authReady, new Promise((r) => setTimeout(r, 4000))]);
  return currentUser || auth.currentUser;
}

async function requireUser(message) {
  const u = await getUser();
  if (!u) {
    alert(message);
    window.location.href = "login.html";
  }
  return u;
}

// =====================================================
// APP
// =====================================================

function initApp() {

  const $ = (id) => document.getElementById(id);
  const isCategoryPage = document.body.classList.contains("category-page");

  const LABELS = {
    all: "All Jewellery", earrings: "Earrings", bracelets: "Bracelets",
    sets: "Jewellery Sets", kamarbandh: "Kamarbandh", necklaces: "Necklaces",
    hathphool: "Hathphool", "hair-accessories": "Hair Accessories",
    anklets: "Anklets", rings: "Rings"
  };

  const CART_KEY = "ayonizaCart";
  const BUY_NOW_KEY = "ayonizaBuyNow";
  const OPEN_CART_FLAG = "ayonizaOpenCart";
  const CUSTOMER_INFO_KEY = "ayonizaCustomerInfo";
  const PENDING_PAYMENT_KEY = "ayonizaPendingPayment";
  const PRODUCTS_KEY = "ayonizaProductsV1";
  const PHONEPE_WORKER_URL = "https://ayoniza-payment.ayoniza-support.workers.dev";
  const PAYMENT_RESULT_URL = "https://ayoniza.shop/payment-result.html";

  const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const plural = (n) => `${n} piece${n === 1 ? "" : "s"}`;
  const idle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn) : setTimeout(fn, 1500));

  const esc = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // ===================================================
  // CARD DECORATION (discount + stock labels)
  // ===================================================

  function decorate(card) {

    const discount = Number(card.dataset.discount || 0);
    const priceEl = card.querySelector(".product-price");
    const imageEl = card.querySelector(".product-image");

    if (discount && priceEl && imageEl && !priceEl.closest(".price-group")) {

      const price = Number(priceEl.dataset.price || priceEl.textContent.replace(/[^\d.]/g, ""));

      if (price) {
        const badge = document.createElement("span");
        badge.className = "discount-badge";
        badge.textContent = `${discount}% OFF`;
        imageEl.appendChild(badge);

        const group = document.createElement("span");
        group.className = "price-group";

        const original = document.createElement("span");
        original.className = "price-original";
        original.textContent = rupees(Math.round(price / (1 - discount / 100)));

        priceEl.replaceWith(group);
        group.append(original, priceEl);
      }
    }

    const stock = card.dataset.stock === undefined ? NaN : Number(card.dataset.stock);
    const info = card.querySelector(".product-info");

    if (Number.isFinite(stock) && stock <= 5 && info) {

      const badge = document.createElement("div");
      badge.className = "low-stock-badge";

      if (stock <= 0) {
        badge.classList.add("out-of-stock");
        badge.textContent = "Out of Stock";
        card.classList.add("out-of-stock");
        card.querySelectorAll(".add-cart-btn, .buy-now-btn").forEach((b) => (b.disabled = true));
      } else {
        badge.textContent = stock === 1 ? "Only 1 piece remaining" : `Only ${stock} pieces remaining`;
      }

      const desc = info.querySelector(".product-description");
      desc ? desc.insertAdjacentElement("afterend", badge) : info.prepend(badge);
    }
  }

  // ===================================================
  // STOCK (cache + ek saath parallel checks)
  // ===================================================

  const stockCache = new Map();

  async function getStock(id, fresh = false) {

    id = String(id || "");
    if (!id) return null;
    if (!fresh && stockCache.has(id)) return stockCache.get(id);

    try {
      const { m, db } = await fs();
      const snap = await m.getDoc(m.doc(db, "products", id));
      const n = snap.exists() ? Number(snap.data()?.stock) : NaN;

      if (Number.isFinite(n)) {
        stockCache.set(id, n);
        return n;
      }
    } catch (error) {
      console.error("Stock read error:", error);
    }

    return stockCache.has(id) ? stockCache.get(id) : null;
  }

  async function validateStock(items) {

    const stocks = await Promise.all(items.map((i) => getStock(i.id, true)));

    for (let k = 0; k < items.length; k++) {
      const s = stocks[k];
      if (!Number.isFinite(s)) continue;
      if (s <= 0) return { ok: false, message: `${items[k].name} is out of stock.` };
      if (items[k].qty > s) return { ok: false, message: `Only ${plural(s)} of ${items[k].name} available.` };
    }

    return { ok: true };
  }

  // ===================================================
  // CART
  // ===================================================

  function loadCart() {
    try {
      const data = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      if (!Array.isArray(data)) return [];

      return data
        .filter((i) => i?.id && i?.name && Number(i.price) >= 0 && Number(i.qty) > 0)
        .map((i) => ({
          id: String(i.id), name: String(i.name), price: Number(i.price),
          image: String(i.image || ""), qty: Math.floor(Number(i.qty))
        }));
    } catch {
      return [];
    }
  }

  let cart = loadCart();

  const cartCountEl = $("cartCount");
  const cartItemsEl = $("cartItems");
  const cartEmptyEl = $("cartEmpty");
  const cartTotalEl = $("cartTotal");
  const cartDrawer = $("cartDrawer");
  const cartOverlay = $("cartOverlay");
  const checkoutBtn = $("checkoutBtn");

  function openCart() {
    cartDrawer?.classList.add("open");
    cartOverlay?.classList.add("active");
    cartDrawer?.setAttribute("aria-hidden", "false");
  }

  function closeCart() {
    cartDrawer?.classList.remove("open");
    cartOverlay?.classList.remove("active");
    cartDrawer?.setAttribute("aria-hidden", "true");
  }

  function renderCart() {

    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}

    if (cartCountEl) cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);
    if (cartTotalEl) cartTotalEl.textContent = rupees(cart.reduce((s, i) => s + i.qty * i.price, 0));
    if (checkoutBtn) checkoutBtn.disabled = !cart.length;
    if (!cartItemsEl) return;

    cartItemsEl.querySelectorAll(".cart-item").forEach((el) => el.remove());
    if (cartEmptyEl) cartEmptyEl.hidden = cart.length > 0;

    const frag = document.createDocumentFragment();

    cart.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <img src="${esc(item.image)}" alt="${esc(item.name)}">
        <div>
          <p class="cart-item-name">${esc(item.name)}</p>
          <p class="cart-item-price">${rupees(item.price)}</p>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="decrease" data-id="${esc(item.id)}">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" data-action="increase" data-id="${esc(item.id)}">+</button>
          </div>
        </div>
        <button class="remove-item" data-action="remove" data-id="${esc(item.id)}">Remove</button>`;
      frag.appendChild(row);
    });

    cartItemsEl.appendChild(frag);
  }

  function removeItem(id) {
    cart = cart.filter((i) => i.id !== id);
    renderCart();
  }

  async function changeQty(id, delta) {

    const item = cart.find((i) => i.id === id);
    if (!item) return;

    if (delta > 0) {
      const stock = await getStock(id);

      if (Number.isFinite(stock)) {
        if (stock <= 0) { alert(`${item.name} is out of stock.`); return removeItem(id); }
        if (item.qty >= stock) return alert(`Only ${plural(stock)} available.`);
      }
    }

    item.qty += delta;
    item.qty <= 0 ? removeItem(id) : renderCart();
  }

  function addToCart({ id, name, price, image }) {

    const existing = cart.find((i) => i.id === String(id));

    existing
      ? existing.qty++
      : cart.push({ id: String(id), name: String(name || ""), price: Number(price) || 0, image: String(image || ""), qty: 1 });

    renderCart();
    openCart();
  }

  cartItemsEl?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    const { action, id } = b.dataset;

    if (action === "increase") changeQty(id, 1);
    else if (action === "decrease") changeQty(id, -1);
    else if (action === "remove") removeItem(id);
  });

  $("openCartBtn")?.addEventListener("click", openCart);
  $("closeCartBtn")?.addEventListener("click", closeCart);
  $("continueShoppingBtn")?.addEventListener("click", closeCart);
  cartOverlay?.addEventListener("click", closeCart);

  // doosre tab me ya Back button se wapas aane par cart sync
  const syncCart = () => { cart = loadCart(); renderCart(); };
  window.addEventListener("storage", (e) => e.key === CART_KEY && syncCart());
  window.addEventListener("pageshow", (e) => e.persisted && syncCart());

  // ===================================================
  // CHECKOUT
  // ===================================================

  const checkoutOverlay = $("checkoutOverlay");
  const checkoutModal = $("checkoutModal");
  const checkoutBack = $("checkoutBack");
  const checkoutTitle = $("checkoutTitle");
  const checkoutForm = $("checkoutForm");
  const confirmStep = $("checkoutConfirmStep");
  const paymentStep = $("checkoutPaymentStep");
  const saveInfoCheckbox = $("saveInfo");
  const placeOrderBtn = $("placeOrderBtn");
  const stepItems = document.querySelectorAll("#checkoutSteps .step-item");

  const STEP_TITLES = { 1: "Address", 2: "Confirm Details", 3: "Payment" };
  const FIELDS = {
    custName: "name", custMobile: "mobile", custAddress: "address", custLandmark: "landmark",
    custCity: "city", custState: "state", custPin: "pin", custCountry: "country"
  };

  let checkoutItems = [];
  let checkoutSource = "cart";
  let currentStep = 1;

  function fillForm(data, onlyEmpty) {
    if (!checkoutForm || !data) return;

    for (const [field, key] of Object.entries(FIELDS)) {
      const el = checkoutForm[field];
      if (el && data[key] && !(onlyEmpty && el.value && field !== "custCountry")) el.value = data[key];
    }

    if (saveInfoCheckbox) saveInfoCheckbox.checked = true;
  }

  function loadSavedInfo() {
    try { return JSON.parse(localStorage.getItem(CUSTOMER_INFO_KEY) || "null"); } catch { return null; }
  }

  async function loadProfile(user) {
    try {
      const { m, db } = await fs();
      const snap = await m.getDoc(m.doc(db, "users", user.uid));
      if (!snap.exists()) return null;

      const d = snap.data();
      return {
        name: d.fullName || user.displayName || "", mobile: d.phone || "", address: d.address || "",
        landmark: d.landmark || "", city: d.city || "", state: d.state || "",
        pin: d.pincode || "", country: d.country || "India"
      };
    } catch (error) {
      console.error("Customer profile read error:", error);
      return null;
    }
  }

  function goToStep(n) {

    currentStep = n;

    [checkoutForm, confirmStep, paymentStep].forEach((el, i) => el && (el.hidden = i + 1 !== n));
    if (checkoutBack) checkoutBack.hidden = n === 1;
    if (checkoutTitle) checkoutTitle.textContent = STEP_TITLES[n] || "";

    stepItems.forEach((item) => {
      const s = Number(item.dataset.step);
      item.classList.toggle("done", s < n);
      item.classList.toggle("active", s === n);
    });

    checkoutModal?.scrollTo?.({ top: 0 });
  }

  async function openCheckout(items, source) {

    if (!items?.length || !checkoutForm) return;

    const user = await requireUser("Please login before checkout.");
    if (!user) return;

    const normalized = items.map((i) => ({
      id: String(i.id || ""), name: String(i.name || ""), price: Number(i.price) || 0,
      image: String(i.image || ""), qty: Number(i.qty) || 1
    }));

    const check = await validateStock(normalized);
    if (!check.ok) return alert(check.message);

    checkoutItems = normalized;
    checkoutSource = source;

    // pehle local data se form bharo aur modal turant kholo,
    // Firebase profile peeche se aakar khali fields bhar dega
    fillForm(loadSavedInfo(), false);
    loadProfile(user).then((p) => fillForm(p, true));

    goToStep(1);
    closeCart();

    checkoutOverlay?.classList.add("active");
    checkoutModal?.classList.add("open");
    checkoutModal?.setAttribute("aria-hidden", "false");
  }

  function closeCheckout() {
    checkoutOverlay?.classList.remove("active");
    checkoutModal?.classList.remove("open");
    checkoutModal?.setAttribute("aria-hidden", "true");
  }

  function renderSummary(container, totalEl) {

    if (!container) return;

    let total = 0;
    const frag = document.createDocumentFragment();

    checkoutItems.forEach((item) => {
      const line = Number(item.price) * Number(item.qty);
      total += line;

      const row = document.createElement("div");
      row.className = "order-summary-row";
      row.innerHTML = `<span>${esc(item.name)} x${item.qty}</span><span>${rupees(line)}</span>`;
      frag.appendChild(row);
    });

    container.replaceChildren(frag);
    if (totalEl) totalEl.textContent = rupees(total);
  }

  // STEP 1 -> 2
  checkoutForm?.addEventListener("submit", (e) => {

    e.preventDefault();

    if (!checkoutForm.checkValidity()) return checkoutForm.reportValidity();

    const info = {};
    for (const [field, key] of Object.entries(FIELDS)) info[key] = checkoutForm[field].value.trim();

    saveInfoCheckbox?.checked
      ? localStorage.setItem(CUSTOMER_INFO_KEY, JSON.stringify(info))
      : localStorage.removeItem(CUSTOMER_INFO_KEY);

    checkoutForm.dataset.pendingInfo = JSON.stringify(info);

    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };

    set("confirmName", info.name);
    set("confirmPhoneLine", info.mobile);
    set("confirmAddressLine",
      `${info.address}${info.landmark ? ` (${info.landmark})` : ""}, ${info.city}, ${info.state} - ${info.pin}, ${info.country}`);

    renderSummary($("confirmOrderSummary"), $("confirmOrderTotal"));
    goToStep(2);
  });

  $("changeAddressBtn")?.addEventListener("click", () => goToStep(1));

  $("confirmContinueBtn")?.addEventListener("click", () => {
    renderSummary($("orderSummary"), $("orderTotal"));
    goToStep(3);
  });

  checkoutBack?.addEventListener("click", () => goToStep(Math.max(1, currentStep - 1)));
  $("checkoutClose")?.addEventListener("click", closeCheckout);
  checkoutOverlay?.addEventListener("click", (e) => e.target === checkoutOverlay && closeCheckout());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeCart(); closeCheckout(); }
  });

  checkoutBtn?.addEventListener("click", async () => {
    if (cart.length) await openCheckout(cart, "cart");
  });

  // ===================================================
  // STEP 3 : PAY NOW (PhonePe)
  // Yahan koi order document nahi banta. Order payment verify hone ke
  // baad payment-result.html banata hai.
  // ===================================================

  placeOrderBtn?.addEventListener("click", async () => {

    const user = await requireUser("Please login before payment.");
    if (!user) return;

    if (!checkoutItems.length) return alert("Your cart is empty.");

    let info = {};

    try {
      info = JSON.parse(checkoutForm?.dataset.pendingInfo || "{}");
    } catch {
      return alert("Customer details could not be read.");
    }

    if (!info.name || !info.mobile || !info.address || !info.city || !info.state || !info.pin) {
      alert("Please complete your delivery address first.");
      return goToStep(1);
    }

    const check = await validateStock(checkoutItems);
    if (!check.ok) return alert(check.message);

    const total = checkoutItems.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
    if (!Number.isFinite(total) || total <= 0) return alert("Invalid order amount.");

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Opening PhonePe...";

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const merchantOrderId = `AYZ${datePart}${Math.floor(1000 + Math.random() * 9000)}`;

    try {

      if (saveInfoCheckbox?.checked) {
        try {
          const { m, db } = await fs();
          await m.setDoc(m.doc(db, "users", user.uid), {
            uid: user.uid, fullName: info.name, email: user.email || "", phone: info.mobile,
            address: info.address, landmark: info.landmark || "", city: info.city, state: info.state,
            pincode: info.pin, country: info.country || "India", updatedAt: m.serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Customer profile save error:", error);
        }
      }

      const paymentDraft = {
        merchantOrderId,
        userId: user.uid,
        customerName: info.name,
        email: user.email || "",
        phone: info.mobile,
        address: info.address,
        landmark: info.landmark || "",
        city: info.city,
        state: info.state,
        pincode: info.pin,
        country: info.country || "India",
        items: checkoutItems.map((i) => ({
          productId: i.id || "", productName: i.name || "",
          price: Number(i.price) || 0, quantity: Number(i.qty) || 1, image: i.image || "",
          lineTotal: (Number(i.price) || 0) * (Number(i.qty) || 1)
        })),
        total,
        gstIncluded: true,
        paymentMethod: "PHONEPE",
        paymentProvider: "PHONEPE",
        checkoutSource,
        createdAt: Date.now()
      };

      localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(paymentDraft));

      const response = await fetch(`${PHONEPE_WORKER_URL}/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantOrderId,
          amount: total,
          redirectUrl: `${PAYMENT_RESULT_URL}?orderId=${encodeURIComponent(merchantOrderId)}`
        })
      });

      let data = {};
      try { data = await response.json(); } catch (e) { console.error("PhonePe response parse error:", e); }

      if (!response.ok) throw new Error(data?.error || data?.message || "PhonePe payment could not be created.");
      if (!data?.success) throw new Error("PhonePe payment creation failed.");
      if (!data?.redirectUrl) throw new Error("PhonePe payment URL was not received.");

      paymentDraft.phonePeOrderId = data.phonePeOrderId || "";
      localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(paymentDraft));

      window.location.href = data.redirectUrl;

    } catch (error) {

      console.error("PhonePe payment initialization error:", error);
      localStorage.removeItem(PENDING_PAYMENT_KEY);
      alert("Payment could not be started.\n\n" + (error?.message || "Please try again."));

    } finally {

      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = "Pay Now";

    }
  });

  // ===================================================
  // PRODUCT BUTTONS (ek hi listener, sab cards + product.html ke liye)
  // ===================================================

  document.addEventListener("click", async (e) => {

    const btn = e.target.closest(".add-cart-btn, .buy-now-btn");
    if (!btn || btn.disabled) return;

    const isBuy = btn.classList.contains("buy-now-btn");

    const user = await requireUser(isBuy ? "Please login before buying." : "Please login before adding products to cart.");
    if (!user) return;

    const { id, name = "Product", price, image = "" } = btn.dataset;
    const stock = await getStock(id);

    if (Number.isFinite(stock)) {
      if (stock <= 0) return alert(`${name} is out of stock.`);

      if (!isBuy) {
        const inCart = cart.find((i) => i.id === id)?.qty || 0;
        if (inCart >= stock) return alert(`Only ${plural(stock)} available.`);
      }
    }

    const item = { id, name, price: Number(price) || 0, image, qty: 1 };

    if (!isBuy) return addToCart(item);

    // product.html par checkout modal nahi hota: index.html par seedha checkout khulega
    if (!checkoutForm) {
      localStorage.setItem(BUY_NOW_KEY, JSON.stringify(item));
      window.location.href = "index.html";
      return;
    }

    openCheckout([item], "buynow");
  });

  // ===================================================
  // PRODUCTS (Firestore, ek hi query + local cache)
  // ===================================================

  function createCard(p) {

    const id = String(p.productId || p.firebaseId || "");
    const price = Number(p.price || 0);
    const name = p.name || "Product";
    const image = p.image || "";
    const cat = String(p.category || "");

    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.category = cat;
    card.dataset.discount = String(Number(p.discount || 0));
    card.dataset.stock = String(Number(p.stock ?? 0));

    const data = `data-id="${esc(id)}" data-name="${esc(name)}" data-price="${price}" data-image="${esc(image)}"`;

    card.innerHTML = `
      <div class="product-image"><img src="${esc(image)}" alt="${esc(name)}" decoding="async"></div>
      <div class="product-info">
        <p class="product-category">${esc(LABELS[cat] || cat || "Jewellery")}</p>
        <h3>${esc(p.name || "Unnamed Product")}</h3>
        <p class="product-description">${esc(p.description || "")}</p>
        <div class="product-bottom">
          <span class="product-price" data-price="${price}">${rupees(price)}</span>
          <div class="product-actions">
            <button class="add-cart-btn" ${data}>Add to Cart</button>
            <button class="product-button buy-now-btn" ${data}>Buy Now</button>
          </div>
        </div>
      </div>`;

    return card;
  }

  async function fetchProducts() {

    const { m, db } = await fs();
    const snap = await m.getDocs(m.collection(db, "products"));

    const list = snap.docs
      .map((d) => ({ firebaseId: d.id, ...d.data() }))
      .filter((p) => p.listed !== false);

    list.forEach((p) => {
      const s = Number(p.stock);
      if (Number.isFinite(s)) stockCache.set(String(p.productId || p.firebaseId), s);
    });

    try { localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list)); } catch {}

    return list;
  }

  function readProductsCache() {
    try { return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "null"); } catch { return null; }
  }

  // ===================================================
  // CATEGORY PAGE
  // ===================================================

  const searchBar = $("searchBar");
  const searchInput = $("searchInput");

  $("openSearchBtn")?.addEventListener("click", () => {
    searchBar?.classList.toggle("open");
    if (searchBar?.classList.contains("open")) searchInput?.focus();
  });

  if (isCategoryPage) {

    const grid = $("productsGrid");
    const noResults = $("noResults");
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("cat") || "all";

    let cards = [];
    let query = (params.get("q") || "").toLowerCase();

    const titleEl = $("selectedCategoryTitle");
    if (titleEl) titleEl.textContent = LABELS[cat] || cat;

    function render() {

      if (!grid) return;

      const frag = document.createDocumentFragment();
      let shown = 0;

      cards.forEach((card) => {

        if (cat !== "all" && card.dataset.category !== cat) return;

        const text = (
          (card.querySelector("h3")?.textContent || "") + " " +
          (card.querySelector(".product-description")?.textContent || "")
        ).toLowerCase();

        if (query && !text.includes(query)) return;

        const clone = card.cloneNode(true);
        decorate(clone);

        // pehli 6 images turant, baaki lazy
        clone.querySelectorAll("img").forEach((img) => {
          img.loading = shown < 6 ? "eager" : "lazy";
          img.decoding = "async";
        });

        frag.appendChild(clone);
        shown++;
      });

      grid.replaceChildren(frag);
      if (noResults) noResults.hidden = shown !== 0;
    }

    const showList = (list) => { cards = list.map(createCard); render(); };

    async function loadStaticCards() {
      const html = await (await fetch("index.html")).text();
      cards = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll(".product-card")];
      render();
    }

    (async () => {

      const cached = readProductsCache();

      if (cached?.length) showList(cached);
      else if (grid) grid.innerHTML = '<p class="no-results">Loading products...</p>';

      try {

        const list = await fetchProducts();

        if (!list.length) await loadStaticCards();
        else if (JSON.stringify(list) !== JSON.stringify(cached)) showList(list);

      } catch (error) {

        console.error("Category product load error:", error);

        if (!cached?.length) {
          try {
            await loadStaticCards();
          } catch {
            if (grid) grid.innerHTML = '<p class="no-results">Products load nahi ho paaye.</p>';
          }
        }
      }

    })();

    if (searchInput) {
      searchInput.value = params.get("q") || "";
      searchInput.addEventListener("input", () => {
        query = searchInput.value.trim().toLowerCase();
        render();
      });
    }

  } else {

    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        window.location.href = "category.html?cat=all&q=" + encodeURIComponent(searchInput.value.trim());
      }
    });

    // Khali time me products + Firebase pehle se load kar lo,
    // taaki category kholte hi turant dikhe
    idle(() => { fetchProducts().catch(() => {}); });
  }

  // non-anchor category tiles
  document.addEventListener("click", (e) => {
    const tile = e.target.closest(".category-tile[data-category]");
    if (tile && tile.tagName !== "A") {
      window.location.href = "category.html?cat=" + encodeURIComponent(tile.dataset.category);
    }
  });

  // ===================================================
  // MOBILE MENU
  // ===================================================

  const menuToggle = $("menuToggle");
  const primaryNav = $("primaryNav");

  menuToggle?.addEventListener("click", () => {
    const open = primaryNav?.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(!!open));
  });

  primaryNav?.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      primaryNav.classList.remove("open");
      menuToggle?.setAttribute("aria-expanded", "false");
    })
  );

  // ===================================================
  // HERO SLIDER
  // ===================================================

  const slides = $("heroBannerSlider")?.querySelectorAll(".hero-banner-slide");

  if (slides?.length > 1) {
    let current = 0;

    setInterval(() => {
      if (document.hidden) return;
      slides[current].classList.remove("active");
      current = (current + 1) % slides.length;
      slides[current].classList.add("active");
    }, 4000);
  }

  // ===================================================
  // INIT
  // ===================================================

  renderCart();

  let pendingBuyNow = null;
  try { pendingBuyNow = JSON.parse(localStorage.getItem(BUY_NOW_KEY) || "null"); } catch {}
  localStorage.removeItem(BUY_NOW_KEY);

  if (pendingBuyNow?.id && checkoutForm) {

    openCheckout([pendingBuyNow], "buynow");

  } else if (localStorage.getItem(OPEN_CART_FLAG) === "1") {

    localStorage.removeItem(OPEN_CART_FLAG);
    if (cart.length) openCart();

  }
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initApp)
  : initApp();
