import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// =====================================================
// FIREBASE
// =====================================================

const firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);

let loggedInUser = null;
onAuthStateChanged(firebaseAuth, (user) => { loggedInUser = user; });

// =====================================================
// HELPERS
// =====================================================

// Prevents HTML injection when names/images are inserted via innerHTML
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// localStorage can throw (private mode, blocked storage) - never crash because of it
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
};

function parseJSON(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function formatRupees(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN");
}

// =====================================================
// MAIN
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

  const $ = (id) => document.getElementById(id);
  const isCategoryPage = document.body.classList.contains("category-page");

  const CATEGORY_LABELS = {
    all: "All Jewellery",
    earrings: "Earrings",
    bracelets: "Bracelets",
    sets: "Jewellery Sets",
    kamarbandh: "Kamarbandh",
    necklaces: "Necklaces",
    hathphool: "Hathphool",
    "hair-accessories": "Hair Accessories",
    anklets: "Anklets",
    rings: "Rings"
  };

  // ===================================================
  // DISCOUNT BADGE
  // ===================================================

  function applyDiscountBadge(card) {
    if (!card || card.dataset.badgeDone) return;
    card.dataset.badgeDone = "1";

    const discount = Number(card.dataset.discount || 0);
    if (!discount) return;

    const priceEl = card.querySelector(".product-price");
    const image = card.querySelector(".product-image");
    if (!priceEl || !image) return;

    const currentPrice = Number(
      priceEl.dataset.price || priceEl.textContent.replace(/[^\d]/g, "")
    );
    const originalPrice = Math.round(currentPrice / (1 - discount / 100));

    const badge = document.createElement("span");
    badge.className = "discount-badge";
    badge.textContent = `${discount}% OFF`;
    image.appendChild(badge);

    const group = document.createElement("span");
    group.className = "price-group";

    const originalSpan = document.createElement("span");
    originalSpan.className = "price-original";
    originalSpan.textContent = formatRupees(originalPrice);

    priceEl.replaceWith(group);
    group.appendChild(originalSpan);
    group.appendChild(priceEl);
  }

  // ===================================================
  // PRODUCT BUTTONS
  // ===================================================

  function wireOnce(btn, handler) {
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", handler);
  }

  function wireAddButton(btn) {
    wireOnce(btn, () => addToCart({
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: btn.dataset.price,
      image: btn.dataset.image
    }));
  }

  function wireBuyButton(btn) {
    wireOnce(btn, () => openCheckout([{
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: Number(btn.dataset.price),
      image: btn.dataset.image,
      qty: 1
    }]));
  }

  function wireProductCard(card) {
    applyDiscountBadge(card);
    wireAddButton(card.querySelector(".add-cart-btn"));
    wireBuyButton(card.querySelector(".buy-now-btn"));
  }

  // ===================================================
  // MOBILE NAV
  // ===================================================

  const menuToggle = $("menuToggle");
  const primaryNav = $("primaryNav");

  if (menuToggle && primaryNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = primaryNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    primaryNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        primaryNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ===================================================
  // HOMEPAGE CATEGORY TILES
  // ===================================================

  document.querySelectorAll(".category-tile[data-category]").forEach((tile) => {
    tile.addEventListener("click", () => {
      window.location.href = "category.html?cat=" + encodeURIComponent(tile.dataset.category);
    });
  });

  // ===================================================
  // CART
  // ===================================================

  const CART_KEY = "ayonizaCart";

  function loadCart() {
    const parsed = parseJSON(store.get(CART_KEY), []);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) =>
        item && item.id && item.name &&
        Number(item.price) >= 0 && Number(item.qty) > 0
      )
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        price: Number(item.price),
        image: String(item.image || ""),
        qty: Math.floor(Number(item.qty))
      }));
  }

  function saveCart() {
    store.set(CART_KEY, JSON.stringify(cart));
  }

  let cart = loadCart();

  const cartCountEl = $("cartCount");
  const cartItemsEl = $("cartItems");
  const cartEmptyEl = $("cartEmpty");
  const cartTotalEl = $("cartTotal");
  const cartDrawer = $("cartDrawer");
  const cartOverlay = $("cartOverlay");
  const openCartBtn = $("openCartBtn");
  const closeCartBtn = $("closeCartBtn");
  const continueShoppingBtn = $("continueShoppingBtn");
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
    saveCart();
    if (!cartItemsEl) return;

    cartItemsEl.querySelectorAll(".cart-item").forEach((el) => el.remove());

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

    if (cartCountEl) cartCountEl.textContent = totalQty;
    if (cartTotalEl) cartTotalEl.textContent = formatRupees(totalPrice);
    if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;

    if (cartEmptyEl) cartEmptyEl.hidden = cart.length !== 0;
    if (cart.length === 0) return;

    cart.forEach((item) => {
      const id = escapeHTML(item.id);
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
        <div>
          <p class="cart-item-name">${escapeHTML(item.name)}</p>
          <p class="cart-item-price">${formatRupees(item.price)}</p>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="decrease" data-id="${id}" aria-label="Decrease quantity">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" data-action="increase" data-id="${id}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="remove-item" data-action="remove" data-id="${id}">Remove</button>
      `;
      cartItemsEl.appendChild(row);
    });
  }

  function addToCart({ id, name, price, image }) {
    const existing = cart.find((item) => item.id === id);

    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ id, name, price: Number(price), image, qty: 1 });
    }

    renderCart();
    openCart();
  }

  function changeQty(id, delta) {
    const item = cart.find((i) => i.id === id);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter((i) => i.id !== id);

    renderCart();
  }

  function removeItem(id) {
    cart = cart.filter((i) => i.id !== id);
    renderCart();
  }

  cartItemsEl?.addEventListener("click", (e) => {
    const target = e.target.closest("button[data-action]");
    if (!target) return;

    const { action, id } = target.dataset;
    if (action === "increase") changeQty(id, 1);
    if (action === "decrease") changeQty(id, -1);
    if (action === "remove") removeItem(id);
  });

  // Keep cart in sync across tabs
  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) {
      cart = loadCart();
      renderCart();
    }
  });

  openCartBtn?.addEventListener("click", openCart);
  closeCartBtn?.addEventListener("click", closeCart);
  continueShoppingBtn?.addEventListener("click", closeCart);
  cartOverlay?.addEventListener("click", closeCart);

  // ===================================================
  // CHECKOUT ELEMENTS
  // ===================================================

  const STORAGE_KEY = "ayonizaCustomerInfo";

  const checkoutOverlay = $("checkoutOverlay");
  const checkoutModal = $("checkoutModal");
  const checkoutClose = $("checkoutClose");
  const checkoutBack = $("checkoutBack");
  const checkoutTitle = $("checkoutTitle");
  const checkoutForm = $("checkoutForm");
  const checkoutConfirmStep = $("checkoutConfirmStep");
  const checkoutPaymentStep = $("checkoutPaymentStep");
  const orderSummaryEl = $("orderSummary");
  const orderTotalEl = $("orderTotal");
  const confirmOrderSummaryEl = $("confirmOrderSummary");
  const confirmOrderTotalEl = $("confirmOrderTotal");
  const confirmNameEl = $("confirmName");
  const confirmAddressLineEl = $("confirmAddressLine");
  const confirmPhoneLineEl = $("confirmPhoneLine");
  const changeAddressBtn = $("changeAddressBtn");
  const confirmContinueBtn = $("confirmContinueBtn");
  const placeOrderBtn = $("placeOrderBtn");
  const saveInfoCheckbox = $("saveInfo");
  const stepItems = document.querySelectorAll("#checkoutSteps .step-item");

  const placeOrderLabel = placeOrderBtn?.textContent.trim() || "Place Order";

  let checkoutItems = [];
  let currentStep = 1;
  let isPlacingOrder = false;

  function loadSavedInfo() {
    return parseJSON(store.get(STORAGE_KEY), null);
  }

  // ===================================================
  // FIREBASE PROFILE -> CHECKOUT FORM
  // ===================================================

  async function prefillForm() {
    if (!checkoutForm) return;

    let saved = loadSavedInfo();

    if (loggedInUser) {
      try {
        const snapshot = await getDoc(doc(firestore, "users", loggedInUser.uid));

        if (snapshot.exists()) {
          const data = snapshot.data();

          saved = {
            name: data.fullName || saved?.name || loggedInUser.displayName || "",
            mobile: data.phone || saved?.mobile || "",
            address: data.address || saved?.address || "",
            landmark: data.landmark || saved?.landmark || "",
            city: data.city || saved?.city || "",
            state: data.state || saved?.state || "",
            pin: data.pincode || saved?.pin || "",
            country: data.country || saved?.country || "India"
          };
        }
      } catch (error) {
        console.error("Could not load customer profile:", error);
      }
    }

    if (!saved) return;

    checkoutForm.custName.value = saved.name || "";
    checkoutForm.custMobile.value = saved.mobile || "";
    checkoutForm.custAddress.value = saved.address || "";
    checkoutForm.custLandmark.value = saved.landmark || "";
    checkoutForm.custCity.value = saved.city || "";
    checkoutForm.custState.value = saved.state || "";
    checkoutForm.custPin.value = saved.pin || "";
    checkoutForm.custCountry.value = saved.country || "India";

    if (saveInfoCheckbox) saveInfoCheckbox.checked = true;
  }

  // ===================================================
  // CHECKOUT STEPS
  // ===================================================

  const STEP_TITLES = { 1: "Address", 2: "Confirm Details", 3: "Payment" };

  function goToStep(n) {
    currentStep = n;

    if (checkoutForm) checkoutForm.hidden = n !== 1;
    if (checkoutConfirmStep) checkoutConfirmStep.hidden = n !== 2;
    if (checkoutPaymentStep) checkoutPaymentStep.hidden = n !== 3;
    if (checkoutBack) checkoutBack.hidden = n === 1;
    if (checkoutTitle) checkoutTitle.textContent = STEP_TITLES[n] || "";

    stepItems.forEach((item) => {
      const stepNum = Number(item.dataset.step);
      item.classList.remove("active", "done");

      if (stepNum < n) item.classList.add("done");
      else if (stepNum === n) item.classList.add("active");
    });

    checkoutModal?.scrollTo?.({ top: 0 });
  }

  async function openCheckout(items) {
    if (!items || items.length === 0 || !checkoutForm) return;

    checkoutItems = items;
    await prefillForm();
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

  // ===================================================
  // UPI
  // ===================================================

  const UPI_ID = "9589790094-2@ybl";
  const upiCopyBtn = $("upiCopyBtn");
  const upiPayLink = $("upiPayLink");

  upiCopyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
    } catch {
      const temp = document.createElement("textarea");
      temp.value = UPI_ID;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }

    upiCopyBtn.textContent = "Copied!";
    upiCopyBtn.classList.add("copied");

    setTimeout(() => {
      upiCopyBtn.textContent = "Copy";
      upiCopyBtn.classList.remove("copied");
    }, 1800);
  });

  // ===================================================
  // ORDER SUMMARY
  // ===================================================

  function renderSummaryInto(container, totalEl) {
    if (!container) return 0;

    container.innerHTML = "";
    let total = 0;

    checkoutItems.forEach((item) => {
      const lineTotal = item.price * item.qty;
      total += lineTotal;

      const row = document.createElement("div");
      row.className = "order-summary-row";
      row.innerHTML = `
        <span>${escapeHTML(item.name)} x${item.qty}</span>
        <span>${formatRupees(lineTotal)}</span>
      `;
      container.appendChild(row);
    });

    if (totalEl) totalEl.textContent = formatRupees(total);
    return total;
  }

  function renderOrderSummary() {
    const total = renderSummaryInto(orderSummaryEl, orderTotalEl);

    if (upiPayLink) {
      const upiParams = new URLSearchParams({
        pa: UPI_ID,
        pn: "AYONIZA",
        am: String(total),
        cu: "INR",
        tn: "AYONIZA order"
      });
      upiPayLink.href = `upi://pay?${upiParams.toString()}`;
    }

    return total;
  }

  // ===================================================
  // STEP 1 -> STEP 2
  // ===================================================

  checkoutForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!checkoutForm.checkValidity()) {
      checkoutForm.reportValidity();
      return;
    }

    const info = {
      name: checkoutForm.custName.value.trim(),
      mobile: checkoutForm.custMobile.value.trim(),
      address: checkoutForm.custAddress.value.trim(),
      landmark: checkoutForm.custLandmark.value.trim(),
      city: checkoutForm.custCity.value.trim(),
      state: checkoutForm.custState.value.trim(),
      pin: checkoutForm.custPin.value.trim(),
      country: checkoutForm.custCountry.value.trim()
    };

    if (saveInfoCheckbox?.checked) {
      store.set(STORAGE_KEY, JSON.stringify(info));
    } else {
      store.remove(STORAGE_KEY);
    }

    checkoutForm.dataset.pendingInfo = JSON.stringify(info);

    if (confirmNameEl) confirmNameEl.textContent = info.name;

    if (confirmAddressLineEl) {
      confirmAddressLineEl.textContent =
        info.address +
        (info.landmark ? " (" + info.landmark + ")" : "") +
        ", " + info.city +
        ", " + info.state +
        " - " + info.pin +
        ", " + info.country;
    }

    if (confirmPhoneLineEl) confirmPhoneLineEl.textContent = info.mobile;

    renderSummaryInto(confirmOrderSummaryEl, confirmOrderTotalEl);
    goToStep(2);
  });

  changeAddressBtn?.addEventListener("click", () => goToStep(1));

  confirmContinueBtn?.addEventListener("click", () => {
    renderOrderSummary();
    goToStep(3);
  });

  checkoutBack?.addEventListener("click", () => {
    if (currentStep === 3) goToStep(2);
    else if (currentStep === 2) goToStep(1);
  });

  checkoutClose?.addEventListener("click", closeCheckout);
  checkoutOverlay?.addEventListener("click", closeCheckout);

  // ===================================================
  // PLACE ORDER -> FIRESTORE
  // ===================================================

  function generateOrderNumber() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `AYZ${datePart}${randomPart}`;
  }

  placeOrderBtn?.addEventListener("click", async () => {
    if (isPlacingOrder) return;

    const user = loggedInUser || firebaseAuth.currentUser;

    // User must be logged in
    if (!user) {
      alert("Please login before placing your order.");
      window.location.href = "login.html?mode=signup";
      return;
    }

    if (!checkoutItems.length) {
      alert("Your cart is empty.");
      return;
    }

    const info = parseJSON(checkoutForm.dataset.pendingInfo, {});

    const total = checkoutItems.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty),
      0
    );

    isPlacingOrder = true;
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Placing Order...";

    try {
      // Save customer profile
      if (saveInfoCheckbox?.checked) {
        try {
          await setDoc(
            doc(firestore, "users", user.uid),
            {
              uid: user.uid,
              fullName: info.name || "",
              email: user.email || "",
              phone: info.mobile || "",
              address: info.address || "",
              landmark: info.landmark || "",
              city: info.city || "",
              state: info.state || "",
              pincode: info.pin || "",
              country: info.country || "India",
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
        } catch (profileError) {
          console.error("Profile update error:", profileError);
        }
      }

      const orderNumber = generateOrderNumber();

      const orderItems = checkoutItems.map((item) => ({
        productId: item.id,
        productName: item.name,
        price: Number(item.price),
        quantity: Number(item.qty),
        image: item.image || "",
        lineTotal: Number(item.price) * Number(item.qty)
      }));

      const orderData = {
        orderId: orderNumber,
        userId: user.uid,

        // Customer
        customerName: info.name || "",
        email: user.email || "",
        phone: info.mobile || "",

        // Address
        address: info.address || "",
        landmark: info.landmark || "",
        city: info.city || "",
        state: info.state || "",
        pincode: info.pin || "",
        country: info.country || "India",

        // Items & price
        items: orderItems,
        subtotal: total,
        total: total,
        gstIncluded: true,

        // Payment
        paymentMethod: "UPI",
        paymentStatus: "PENDING_VERIFICATION",

        // Order & shipping
        orderStatus: "NEW",
        courier: "",
        trackingNumber: "",

        // Time
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(firestore, "orders"), orderData);

      cart = [];
      renderCart();

      alert(
        `Order placed successfully!\n\n` +
        `Order ID: ${orderNumber}\n\n` +
        `Payment status: Pending verification`
      );

      closeCheckout();
    } catch (error) {
      console.error("Order creation error:", error);
      alert("We could not place your order right now. Please try again.");
    } finally {
      isPlacingOrder = false;
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = placeOrderLabel;
    }
  });

  // ===================================================
  // CART -> CHECKOUT
  // ===================================================

  checkoutBtn?.addEventListener("click", () => {
    if (cart.length === 0) return;
    openCheckout(cart.map((item) => ({ ...item })));
  });

  // ===================================================
  // PRODUCT CARDS
  // ===================================================

  document.querySelectorAll(".product-card").forEach(wireProductCard);

  // ===================================================
  // CATEGORY PAGE
  // ===================================================

  if (isCategoryPage) {
    const grid = $("productsGrid");
    const noResults = $("noResults");
    const titleEl = $("selectedCategoryTitle");
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("cat") || "all";

    let allCards = [];
    let currentSearch = (params.get("q") || "").toLowerCase();

    if (titleEl) titleEl.textContent = CATEGORY_LABELS[cat] || cat;

    function renderList() {
      if (!grid) return;

      grid.innerHTML = "";
      let shown = 0;

      allCards.forEach((original) => {
        const categoryMatch = cat === "all" || original.dataset.category === cat;

        const name = (original.querySelector("h3")?.textContent || "").toLowerCase();
        const desc = (original.querySelector(".product-description")?.textContent || "").toLowerCase();

        const searchMatch =
          !currentSearch ||
          name.includes(currentSearch) ||
          desc.includes(currentSearch);

        if (categoryMatch && searchMatch) {
          const clone = original.cloneNode(true);
          grid.appendChild(clone);
          wireProductCard(clone);
          shown++;
        }
      });

      if (noResults) noResults.hidden = shown !== 0;
    }

    fetch("index.html")
      .then((response) => response.text())
      .then((html) => {
        const parsedPage = new DOMParser().parseFromString(html, "text/html");
        allCards = Array.from(parsedPage.querySelectorAll(".product-card"));
        renderList();
      })
      .catch(() => {
        if (grid) {
          grid.innerHTML =
            '<p class="no-results">' +
            "Products load nahi ho paaye. " +
            "Page refresh karke dekhein." +
            "</p>";
        }
      });

    const searchInputCP = $("searchInput");

    if (searchInputCP) {
      searchInputCP.value = params.get("q") || "";

      searchInputCP.addEventListener("input", () => {
        currentSearch = searchInputCP.value.trim().toLowerCase();
        renderList();
      });
    }
  }

  // ===================================================
  // SEARCH
  // ===================================================

  const openSearchBtn = $("openSearchBtn");
  const searchBar = $("searchBar");
  const searchInput = $("searchInput");

  openSearchBtn?.addEventListener("click", () => {
    searchBar?.classList.toggle("open");
    if (searchBar?.classList.contains("open")) searchInput?.focus();
  });

  if (!isCategoryPage) {
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        window.location.href =
          "category.html?cat=all&q=" + encodeURIComponent(searchInput.value.trim());
      }
    });
  }

  // ===================================================
  // ESCAPE KEY (single handler for cart, checkout, search)
  // ===================================================

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    closeCart();
    closeCheckout();
    searchBar?.classList.remove("open");
  });

  // ===================================================
  // HERO SLIDER
  // ===================================================

  const heroSlider = $("heroBannerSlider");

  if (heroSlider) {
    const heroSlides = heroSlider.querySelectorAll(".hero-banner-slide");

    if (heroSlides.length > 1) {
      let heroCurrent = 0;
      let heroTimer = null;
      const HERO_INTERVAL_MS = 4000;

      const showHeroSlide = (n) => {
        heroSlides[heroCurrent].classList.remove("active");
        heroCurrent = (n + heroSlides.length) % heroSlides.length;
        heroSlides[heroCurrent].classList.add("active");
      };

      const startHero = () => {
        if (heroTimer) return;
        heroTimer = setInterval(() => showHeroSlide(heroCurrent + 1), HERO_INTERVAL_MS);
      };

      const stopHero = () => {
        clearInterval(heroTimer);
        heroTimer = null;
      };

      startHero();

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopHero();
        else startHero();
      });
    }
  }

  // ===================================================
  // INITIAL CART
  // ===================================================

  renderCart();
});
