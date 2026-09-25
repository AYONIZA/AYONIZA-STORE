const CART_KEY = "ayonizaCart";

let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function money(value) {
  return "₹" + Number(value).toLocaleString("en-IN");
}

function totalItems() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function totalPrice() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCart() {
  cartCount.textContent = totalItems();
  cartTotal.textContent = money(totalPrice());

  if (cart.length === 0) {
    cartItems.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">🛍️</div>
        <h4>Your cart is empty</h4>
        <p>Add your favourite AYONIZA pieces to your cart.</p>
      </div>
    `;
    return;
  }

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}">
      <div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${money(item.price)}</div>
        <div class="quantity-controls">
          <button class="quantity-btn" type="button" data-minus="${item.id}">−</button>
          <span class="quantity-value">${item.quantity}</span>
          <button class="quantity-btn" type="button" data-plus="${item.id}">+</button>
        </div>
      </div>
      <button class="remove-item" type="button" data-remove="${item.id}">Remove</button>
    </div>
  `).join("");

  cartItems.querySelectorAll("[data-minus]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.dataset.minus, -1));
  });

  cartItems.querySelectorAll("[data-plus]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.dataset.plus, 1));
  });

  cartItems.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => removeItem(btn.dataset.remove));
  });
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({...product, quantity: 1});
  }
  saveCart();
  renderCart();
  openCart();
}

function changeQty(id, amount) {
  const item = cart.find(item => item.id === id);
  if (!item) return;
  item.quantity += amount;
  if (item.quantity <= 0) {
    cart = cart.filter(item => item.id !== id);
  }
  saveCart();
  renderCart();
}

function removeItem(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  renderCart();
}

function openCart() {
  cartDrawer.classList.add("open");
  cartOverlay.classList.add("show");
  document.body.classList.add("cart-open");
}

function closeCart() {
  cartDrawer.classList.remove("open");
  cartOverlay.classList.remove("show");
  document.body.classList.remove("cart-open");
}

document.querySelectorAll(".add-cart-btn").forEach(button => {
  button.addEventListener("click", () => {
    addToCart({
      id: button.dataset.id,
      name: button.dataset.name,
      price: Number(button.dataset.price),
      image: button.dataset.image
    });
  });
});

document.querySelectorAll(".category-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".category-btn").forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    const category = button.dataset.category;

    document.querySelectorAll(".product-card").forEach(card => {
      card.style.display =
        category === "all" || card.dataset.category === category ? "" : "none";
    });
  });
});

document.getElementById("openCartBtn").addEventListener("click", openCart);
document.getElementById("closeCartBtn").addEventListener("click", closeCart);
document.getElementById("continueShoppingBtn").addEventListener("click", closeCart);
cartOverlay.addEventListener("click", closeCart);

document.getElementById("checkoutBtn").addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  const lines = cart.map((item, i) =>
    `${i + 1}. ${item.name} x ${item.quantity} = ${money(item.price * item.quantity)}`
  );

  const message =
    `Hello AYONIZA,%0A%0AI would like to place an order:%0A%0A` +
    `${lines.join("%0A")}%0A%0A` +
    `Total: ${money(totalPrice())}%0A%0APlease share the next steps for delivery.`;

  window.open(`https://wa.me/919203703177?text=${message}`, "_blank");
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeCart();
});

renderCart();
