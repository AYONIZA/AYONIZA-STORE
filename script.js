document.addEventListener('DOMContentLoaded', () => {
  const WHATSAPP_NUMBER = '919203703177';

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

  /* Checkout via WhatsApp */
  checkoutBtn?.addEventListener('click', () => {
    if (cart.length === 0) return;

    const lines = cart.map(item =>
      `${item.name} x${item.qty} - ${formatRupees(item.price * item.qty)}`
    );
    const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

    const message = [
      'Hello AYONIZA, I would like to order:',
      '',
      ...lines,
      '',
      `Total: ${formatRupees(total)}`
    ].join('\n');

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');
  });

  renderCart();
});
