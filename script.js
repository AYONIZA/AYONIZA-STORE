document.addEventListener('DOMContentLoaded', () => {
  const WHATSAPP_NUMBER = '919203703177';

  /* ---------- Discount badges ---------- */
  document.querySelectorAll('.product-card').forEach(card => {
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
  });

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

  /* ---------- Category filter ---------- */
  const categoryButtons = document.querySelectorAll('.category-btn');
  const productCards = document.querySelectorAll('.product-card');
  const noResults = document.getElementById('noResults');

  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const category = btn.dataset.category;
      let visibleCount = 0;

      productCards.forEach(card => {
        const match = category === 'all' || card.dataset.category === category;
        card.classList.toggle('is-hidden', !match);
        if (match) visibleCount++;
      });

      if (noResults) noResults.hidden = visibleCount !== 0;
    });
  });

  /* ---------- Cart state ---------- */
  let cart = [];

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

  function formatRupees(amount) {
    return '₹' + amount.toLocaleString('en-IN');
  }

  function openCart() {
    cartDrawer.classList.add('open');
    cartOverlay.classList.add('active');
    cartDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeCart() {
    cartDrawer.classList.remove('open');
    cartOverlay.classList.remove('active');
    cartDrawer.setAttribute('aria-hidden', 'true');
  }

  function renderCart() {
    // Clear existing item rows (keep the empty-state paragraph as a template)
    cartItemsEl.querySelectorAll('.cart-item').forEach(el => el.remove());

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

    cartCountEl.textContent = totalQty;
    cartTotalEl.textContent = formatRupees(totalPrice);
    checkoutBtn.disabled = cart.length === 0;

    if (cart.length === 0) {
      cartEmptyEl.hidden = false;
      return;
    }
    cartEmptyEl.hidden = true;

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

  /* Add to cart buttons */
  document.querySelectorAll('.add-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: btn.dataset.price,
        image: btn.dataset.image
      });
    });
  });

  /* Cart item qty / remove (event delegation) */
  cartItemsEl.addEventListener('click', (e) => {
    const target = e.target.closest('button[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === 'increase') changeQty(id, 1);
    if (action === 'decrease') changeQty(id, -1);
    if (action === 'remove') removeItem(id);
  });

  /* Drawer open/close */
  openCartBtn?.addEventListener('click', openCart);
  closeCartBtn?.addEventListener('click', closeCart);
  continueShoppingBtn?.addEventListener('click', closeCart);
  cartOverlay?.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCart();
  });

  /* ---------- Checkout modal (delivery details + payment step) ---------- */
  const WA_NUMBER = WHATSAPP_NUMBER;
  const STORAGE_KEY = 'ayonizaCustomerInfo';

  const checkoutOverlay = document.getElementById('checkoutOverlay');
  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutClose = document.getElementById('checkoutClose');
  const checkoutBack = document.getElementById('checkoutBack');
  const checkoutTitle = document.getElementById('checkoutTitle');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutPaymentStep = document.getElementById('checkoutPaymentStep');
  const orderSummaryEl = document.getElementById('orderSummary');
  const orderTotalEl = document.getElementById('orderTotal');
  const placeOrderBtn = document.getElementById('placeOrderBtn');
  const saveInfoCheckbox = document.getElementById('saveInfo');

  let checkoutItems = []; // items being purchased in this checkout flow

  function loadSavedInfo() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function prefillForm() {
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
    saveInfoCheckbox.checked = true;
  }

  function openCheckout(items) {
    if (!items || items.length === 0) return;
    checkoutItems = items;
    checkoutForm.hidden = false;
    checkoutPaymentStep.hidden = true;
    checkoutBack.hidden = true;
    checkoutTitle.textContent = 'Delivery Details';
    prefillForm();
    closeCart();
    checkoutOverlay.classList.add('active');
    checkoutModal.classList.add('open');
    checkoutModal.setAttribute('aria-hidden', 'false');
  }

  function closeCheckout() {
    checkoutOverlay.classList.remove('active');
    checkoutModal.classList.remove('open');
    checkoutModal.setAttribute('aria-hidden', 'true');
  }

  const UPI_ID = '9589790094-2@ybl';
  const upiCopyBtn = document.getElementById('upiCopyBtn');
  const upiPayLink = document.getElementById('upiPayLink');

  upiCopyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
    } catch {
      // Fallback for browsers without clipboard API access
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

  function renderOrderSummary() {
    orderSummaryEl.innerHTML = '';
    let total = 0;
    checkoutItems.forEach(item => {
      const lineTotal = item.price * item.qty;
      total += lineTotal;
      const row = document.createElement('div');
      row.className = 'order-summary-row';
      row.innerHTML = `<span>${item.name} x${item.qty}</span><span>${formatRupees(lineTotal)}</span>`;
      orderSummaryEl.appendChild(row);
    });
    orderTotalEl.textContent = formatRupees(total);

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

  checkoutForm.addEventListener('submit', (e) => {
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

    if (saveInfoCheckbox.checked) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    checkoutForm.dataset.pendingInfo = JSON.stringify(info);

    checkoutForm.hidden = true;
    checkoutPaymentStep.hidden = false;
    checkoutBack.hidden = false;
    checkoutTitle.textContent = 'Payment';
    renderOrderSummary();
  });

  checkoutBack.addEventListener('click', () => {
    checkoutPaymentStep.hidden = true;
    checkoutForm.hidden = false;
    checkoutBack.hidden = true;
    checkoutTitle.textContent = 'Delivery Details';
  });

  checkoutClose.addEventListener('click', closeCheckout);
  checkoutOverlay.addEventListener('click', closeCheckout);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCheckout();
  });

  placeOrderBtn.addEventListener('click', () => {
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

    // If this checkout came from the cart, clear it after placing the order
    if (checkoutItems === cart || checkoutItems.__fromCart) {
      cart = [];
      renderCart();
    }

    closeCheckout();
  });

  /* Cart drawer's "Proceed to Checkout" opens the delivery-details form with the full cart */
  checkoutBtn?.addEventListener('click', () => {
    if (cart.length === 0) return;
    const items = cart.map(i => ({ ...i }));
    items.__fromCart = true;
    openCheckout(items);
  });

  /* Each product's "Buy Now" opens checkout directly with just that one item */
  document.querySelectorAll('.buy-now-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openCheckout([{
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: Number(btn.dataset.price),
        image: btn.dataset.image,
        qty: 1
      }]);
    });
  });

  renderCart();
});
