import {
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  firebaseConfig
} from "./firebase-config.js";


const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const firebaseAuth =
  getAuth(firebaseApp);

const firestore =
  getFirestore(firebaseApp);

let loggedInUser = null;

onAuthStateChanged(
  firebaseAuth,
  (user) => {
    loggedInUser = user;
  }
);

document.addEventListener('DOMContentLoaded', () => {
  const WHATSAPP_NUMBER = '919203703177';
  const isCategoryPage = document.body.classList.contains('category-page');

  const CATEGORY_LABELS = {
    all: 'All Jewellery',
    earrings: 'Earrings',
    bracelets: 'Bracelets',
    sets: 'Jewellery Sets',
    kamarbandh: 'Kamarbandh',
    necklaces: 'Necklaces',
    hathphool: 'Hathphool',
    'hair-accessories': 'Hair Accessories',
    anklets: 'Anklets',
    rings: 'Rings'
  };

  function formatRupees(amount) {
    return '₹' + amount.toLocaleString('en-IN');
  }

  /* ---------- Reusable: apply discount badge to one card ---------- */
  function applyDiscountBadge(card) {
    if (card.dataset.badgeDone) return;
    card.dataset.badgeDone = '1';

    const discount = Number(card.dataset.discount || 0);
    if (!discount) return;

    const priceEl = card.querySelector('.product-price');
    const image = card.querySelector('.product-image');
    if (!priceEl || !image) return;

    const currentPrice = Number(priceEl.dataset.price || priceEl.textContent.replace(/[^\d]/g, ''));
    const originalPrice = Math.round(currentPrice / (1 - discount / 100));

    const badge = document.createElement('span');
    badge.className = 'discount-badge';
    badge.textContent = `${discount}% OFF`;
    image.appendChild(badge);

    const group = document.createElement('span');
    group.className = 'price-group';
    const originalSpan = document.createElement('span');
    originalSpan.className = 'price-original';
    originalSpan.textContent = '₹' + originalPrice.toLocaleString('en-IN');

    priceEl.replaceWith(group);
    group.appendChild(originalSpan);
    group.appendChild(priceEl);
  }

  /* ---------- Reusable: wire Add to Cart / Buy Now buttons ---------- */
  function wireAddButton(btn) {
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: btn.dataset.price,
        image: btn.dataset.image
      });
    });
  }

  function wireBuyButton(btn) {
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      openCheckout([{
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: Number(btn.dataset.price),
        image: btn.dataset.image,
        qty: 1
      }]);
    });
  }

  function wireProductCard(card) {
    applyDiscountBadge(card);
    wireAddButton(card.querySelector('.add-cart-btn'));
    wireBuyButton(card.querySelector('.buy-now-btn'));
  }

  /* ---------- Mobile nav ---------- */
  const menuToggle = document.getElementById('menuToggle');
  const primaryNav = document.getElementById('primaryNav');
  if (menuToggle && primaryNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen);
    });
    primaryNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        primaryNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- Homepage: category tiles navigate to category.html ---------- */
  document.querySelectorAll('.category-tile[data-category]').forEach(tile => {
    tile.addEventListener('click', () => {
      window.location.href = 'category.html?cat=' + encodeURIComponent(tile.dataset.category);
    });
  });

  /* ---------- Cart state ---------- */
  const CART_KEY = 'ayonizaCart';

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(i => i && i.id && i.name && Number(i.price) >= 0 && Number(i.qty) > 0)
        .map(i => ({
          id: String(i.id),
          name: String(i.name),
          price: Number(i.price),
          image: String(i.image || ''),
          qty: Math.floor(Number(i.qty))
        }));
    } catch {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* storage blocked/full (e.g. private mode): cart still works for this visit */
    }
  }

  let cart = loadCart();

  const cartCountEl = document.getElementById('cartCount');
  const cartItemsEl = document.getElementById('cartItems');
  const cartEmptyEl = document.getElementById('cartEmpty');
  const cartTotalEl = document.getElementById('cartTotal');
  const cartDrawer = document.getElementById('cartDrawer');
  const cartOverlay = document.getElementById('cartOverlay');
  const openCartBtn = document.getElementById('openCartBtn');
  const closeCartBtn = document.getElementById('closeCartBtn');
  const continueShoppingBtn = document.getElementById('continueShoppingBtn');
  const checkoutBtn = document.getElementById('checkoutBtn');

  function openCart() {
    cartDrawer?.classList.add('open');
    cartOverlay?.classList.add('active');
    cartDrawer?.setAttribute('aria-hidden', 'false');
  }

  function closeCart() {
    cartDrawer?.classList.remove('open');
    cartOverlay?.classList.remove('active');
    cartDrawer?.setAttribute('aria-hidden', 'true');
  }

  function renderCart() {
    saveCart();
    if (!cartItemsEl) return;
    cartItemsEl.querySelectorAll('.cart-item').forEach(el => el.remove());

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

    if (cartCountEl) cartCountEl.textContent = totalQty;
    if (cartTotalEl) cartTotalEl.textContent = formatRupees(totalPrice);
    if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;

    if (cart.length === 0) {
      if (cartEmptyEl) cartEmptyEl.hidden = false;
      return;
    }
    if (cartEmptyEl) cartEmptyEl.hidden = true;

    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <img src="${item.image}" alt="${item.name}">
        <div>
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-price">${formatRupees(item.price)}</p>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="decrease" data-id="${item.id}" aria-label="Decrease quantity">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" data-action="increase" data-id="${item.id}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="remove-item" data-action="remove" data-id="${item.id}">Remove</button>
      `;
      cartItemsEl.appendChild(row);
    });
  }

  function addToCart({ id, name, price, image }) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ id, name, price: Number(price), image, qty: 1 });
    }
    renderCart();
    openCart();
  }

  function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(i => i.id !== id);
    }
    renderCart();
  }

  function removeItem(id) {
    cart = cart.filter(i => i.id !== id);
    renderCart();
  }

  cartItemsEl?.addEventListener('click', (e) => {
    const target = e.target.closest('button[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === 'increase') changeQty(id, 1);
    if (action === 'decrease') changeQty(id, -1);
    if (action === 'remove') removeItem(id);
  });

  /* Keep cart in sync if it changes in another tab */
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) {
      cart = loadCart();
      renderCart();
    }
  });

  openCartBtn?.addEventListener('click', openCart);
  closeCartBtn?.addEventListener('click', closeCart);
  continueShoppingBtn?.addEventListener('click', closeCart);
  cartOverlay?.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCart();
  });

  /* ---------- Checkout modal: 3 steps — Address / Confirm / Payment ---------- */
  const WA_NUMBER = WHATSAPP_NUMBER;
  const STORAGE_KEY = 'ayonizaCustomerInfo';

  const checkoutOverlay = document.getElementById('checkoutOverlay');
  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutClose = document.getElementById('checkoutClose');
  const checkoutBack = document.getElementById('checkoutBack');
  const checkoutTitle = document.getElementById('checkoutTitle');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutConfirmStep = document.getElementById('checkoutConfirmStep');
  const checkoutPaymentStep = document.getElementById('checkoutPaymentStep');
  const orderSummaryEl = document.getElementById('orderSummary');
  const orderTotalEl = document.getElementById('orderTotal');
  const confirmOrderSummaryEl = document.getElementById('confirmOrderSummary');
  const confirmOrderTotalEl = document.getElementById('confirmOrderTotal');
  const confirmNameEl = document.getElementById('confirmName');
  const confirmAddressLineEl = document.getElementById('confirmAddressLine');
  const confirmPhoneLineEl = document.getElementById('confirmPhoneLine');
  const changeAddressBtn = document.getElementById('changeAddressBtn');
  const confirmContinueBtn = document.getElementById('confirmContinueBtn');
  const placeOrderBtn = document.getElementById('placeOrderBtn');
  const saveInfoCheckbox = document.getElementById('saveInfo');
  const stepItems = document.querySelectorAll('#checkoutSteps .step-item');

  let checkoutItems = [];
  let currentStep = 1;

  function loadSavedInfo() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function prefillForm() {
    if (!checkoutForm) return;
    const saved = loadSavedInfo();
    if (!saved) return;
    checkoutForm.custName.value = saved.name || '';
    checkoutForm.custMobile.value = saved.mobile || '';
    checkoutForm.custAddress.value = saved.address || '';
    checkoutForm.custLandmark.value = saved.landmark || '';
    checkoutForm.custCity.value = saved.city || '';
    checkoutForm.custState.value = saved.state || '';
    checkoutForm.custPin.value = saved.pin || '';
    checkoutForm.custCountry.value = saved.country || 'India';
    if (saveInfoCheckbox) saveInfoCheckbox.checked = true;
  }

  const STEP_TITLES = { 1: 'Address', 2: 'Confirm Details', 3: 'Payment' };

  function goToStep(n) {
    currentStep = n;
    if (checkoutForm) checkoutForm.hidden = n !== 1;
    if (checkoutConfirmStep) checkoutConfirmStep.hidden = n !== 2;
    if (checkoutPaymentStep) checkoutPaymentStep.hidden = n !== 3;
    if (checkoutBack) checkoutBack.hidden = n === 1;
    if (checkoutTitle) checkoutTitle.textContent = STEP_TITLES[n] || '';

    stepItems.forEach(item => {
      const stepNum = Number(item.dataset.step);
      item.classList.remove('active', 'done');
      if (stepNum < n) item.classList.add('done');
      else if (stepNum === n) item.classList.add('active');
    });

    checkoutModal?.scrollTo?.({ top: 0 });
  }

  function openCheckout(items) {
    if (!items || items.length === 0 || !checkoutForm) return;
    checkoutItems = items;
    prefillForm();
    goToStep(1);
    closeCart();
    checkoutOverlay.classList.add('active');
    checkoutModal.classList.add('open');
    checkoutModal.setAttribute('aria-hidden', 'false');
  }

  function closeCheckout() {
    checkoutOverlay?.classList.remove('active');
    checkoutModal?.classList.remove('open');
    checkoutModal?.setAttribute('aria-hidden', 'true');
  }

  const UPI_ID = '9589790094-2@ybl';
  const upiCopyBtn = document.getElementById('upiCopyBtn');
  const upiPayLink = document.getElementById('upiPayLink');

  upiCopyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
    } catch {
      const temp = document.createElement('textarea');
      temp.value = UPI_ID;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
    upiCopyBtn.textContent = 'Copied!';
    upiCopyBtn.classList.add('copied');
    setTimeout(() => {
      upiCopyBtn.textContent = 'Copy';
      upiCopyBtn.classList.remove('copied');
    }, 1800);
  });

  function renderSummaryInto(container, totalEl) {
    if (!container) return 0;
    container.innerHTML = '';
    let total = 0;
    checkoutItems.forEach(item => {
      const lineTotal = item.price * item.qty;
      total += lineTotal;
      const row = document.createElement('div');
      row.className = 'order-summary-row';
      row.innerHTML = `<span>${item.name} x${item.qty}</span><span>${formatRupees(lineTotal)}</span>`;
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
        pn: 'AYONIZA',
        am: String(total),
        cu: 'INR',
        tn: 'AYONIZA order'
      });
      upiPayLink.href = `upi://pay?${upiParams.toString()}`;
    }
    return total;
  }

  /* Step 1 -> Step 2 */
  checkoutForm?.addEventListener('submit', (e) => {
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    checkoutForm.dataset.pendingInfo = JSON.stringify(info);

    if (confirmNameEl) confirmNameEl.textContent = info.name;
    if (confirmAddressLineEl) {
      confirmAddressLineEl.textContent = info.address + (info.landmark ? ' (' + info.landmark + ')' : '') + ', ' + info.city + ', ' + info.state + ' - ' + info.pin + ', ' + info.country;
    }
    if (confirmPhoneLineEl) confirmPhoneLineEl.textContent = info.mobile;
    renderSummaryInto(confirmOrderSummaryEl, confirmOrderTotalEl);

    goToStep(2);
  });

  /* Step 2 -> Step 1 (edit address) */
  changeAddressBtn?.addEventListener('click', () => goToStep(1));

  /* Step 2 -> Step 3 */
  confirmContinueBtn?.addEventListener('click', () => {
    renderOrderSummary();
    goToStep(3);
  });

  /* Back button: step-aware */
  checkoutBack?.addEventListener('click', () => {
    if (currentStep === 3) goToStep(2);
    else if (currentStep === 2) goToStep(1);
  });

  checkoutClose?.addEventListener('click', closeCheckout);
  checkoutOverlay?.addEventListener('click', closeCheckout);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCheckout();
  });

  placeOrderBtn?.addEventListener('click', () => {
    const info = JSON.parse(checkoutForm.dataset.pendingInfo || '{}');
    const total = checkoutItems.reduce((sum, item) => sum + item.price * item.qty, 0);

    const itemLines = checkoutItems.map(item =>
      `${item.name} x${item.qty} - ${formatRupees(item.price * item.qty)}`
    );

    const message = [
      'Hello AYONIZA, I would like to place an order:',
      '',
      ...itemLines,
      '',
      `Total: ${formatRupees(total)}`,
      '',
      'Delivery details:',
      `Name: ${info.name}`,
      `Mobile: ${info.mobile}`,
      `Address: ${info.address}${info.landmark ? ', Landmark: ' + info.landmark : ''}`,
      `City: ${info.city}`,
      `State: ${info.state}`,
      `PIN Code: ${info.pin}`,
      `Country: ${info.country}`
    ].join('\n');

    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');

    if (checkoutItems === cart || checkoutItems.__fromCart) {
      cart = [];
      renderCart();
    }

    closeCheckout();
  });

  checkoutBtn?.addEventListener('click', () => {
    if (cart.length === 0) return;
    const items = cart.map(i => ({ ...i }));
    items.__fromCart = true;
    openCheckout(items);
  });

  /* Wire any product cards already present in THIS page's own HTML
     (covers index.html's hidden data-source cards, and any static listing) */
  document.querySelectorAll('.product-card').forEach(wireProductCard);

  /* ---------- Category page: pull matching products from index.html ---------- */
  if (isCategoryPage) {
    const grid = document.getElementById('productsGrid');
    const noResults = document.getElementById('noResults');
    const titleEl = document.getElementById('selectedCategoryTitle');
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat') || 'all';

    let allCards = [];
    let currentSearch = (params.get('q') || '').toLowerCase();

    if (titleEl) titleEl.textContent = CATEGORY_LABELS[cat] || cat;

    function renderList() {
      if (!grid) return;
      grid.innerHTML = '';
      let shown = 0;
      allCards.forEach(original => {
        const categoryMatch = cat === 'all' || original.dataset.category === cat;
        const name = original.querySelector('h3')?.textContent.toLowerCase() || '';
        const desc = original.querySelector('.product-description')?.textContent.toLowerCase() || '';
        const searchMatch = !currentSearch || name.includes(currentSearch) || desc.includes(currentSearch);
        if (categoryMatch && searchMatch) {
          const clone = original.cloneNode(true);
          grid.appendChild(clone);
          wireProductCard(clone);
          shown++;
        }
      });
      if (noResults) noResults.hidden = shown !== 0;
    }

    fetch('index.html')
      .then(r => r.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        allCards = Array.from(doc.querySelectorAll('.product-card'));
        renderList();
      })
      .catch(() => {
        if (grid) grid.innerHTML = '<p class="no-results">Products load nahi ho paaye. Page refresh karke dekhein.</p>';
      });

    const searchInputCP = document.getElementById('searchInput');
    if (searchInputCP) {
      searchInputCP.value = params.get('q') || '';
      searchInputCP.addEventListener('input', () => {
        currentSearch = searchInputCP.value.trim().toLowerCase();
        renderList();
      });
    }
  }

  /* ---------- Search bar open/close ---------- */
  const openSearchBtn = document.getElementById('openSearchBtn');
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');

  openSearchBtn?.addEventListener('click', () => {
    searchBar?.classList.toggle('open');
    if (searchBar?.classList.contains('open')) searchInput?.focus();
  });

  if (!isCategoryPage) {
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        window.location.href = 'category.html?cat=all&q=' + encodeURIComponent(searchInput.value.trim());
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchBar?.classList.contains('open')) {
      searchBar.classList.remove('open');
    }
  });

  /* ---------- Hero banner slider: auto-rotate images ---------- */
  const heroSlider = document.getElementById('heroBannerSlider');
  if (heroSlider) {
    const heroSlides = heroSlider.querySelectorAll('.hero-banner-slide');
    if (heroSlides.length > 1) {
      let heroCurrent = 0;
      let heroTimer = null;
      const HERO_INTERVAL_MS = 4000;

      const showHeroSlide = (n) => {
        heroSlides[heroCurrent].classList.remove('active');
        heroCurrent = (n + heroSlides.length) % heroSlides.length;
        heroSlides[heroCurrent].classList.add('active');
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
      /* pause while the tab is in the background */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopHero(); else startHero();
      });
    }
  }

  renderCart();
});
