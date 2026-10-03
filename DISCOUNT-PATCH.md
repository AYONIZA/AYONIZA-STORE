# Cart + Checkout mein discount lines (script.js + index.html)

Rules server jaise hi hain: Buy 2 = 10%, Buy 3+ = 15%, phir prepaid extra 10%.
(Agar functions/index.js mein rule badlo, to yahan bhi badalna.)

## 1) script.js: `formatRupees` function ke theek neeche ye add karein
    function getPricing(items) {
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const qty = items.reduce((s, i) => s + i.qty, 0);
      const bundlePct = qty >= 3 ? 15 : qty === 2 ? 10 : 0;
      const total = Math.round(subtotal * (1 - bundlePct / 100) * 0.9);
      const bundleAmt = Math.round(subtotal * bundlePct / 100);
      const prepaidAmt = subtotal - bundleAmt - total;
      return { subtotal, qty, bundlePct, bundleAmt, prepaidAmt, total };
    }
    function breakdownHTML(items, rowClass) {
      const p = getPricing(items);
      let h = `<div class="${rowClass}"><span>Subtotal</span><span>${formatRupees(p.subtotal)}</span></div>`;
      if (p.bundleAmt > 0) h += `<div class="${rowClass}"><span>Bundle discount (${p.bundlePct}% off)</span><span>-${formatRupees(p.bundleAmt)}</span></div>`;
      h += `<div class="${rowClass}"><span>Prepaid discount (10% off)</span><span>-${formatRupees(p.prepaidAmt)}</span></div>`;
      h += `<div class="${rowClass}"><span>Shipping</span><span>Free</span></div>`;
      return h;
    }

## 2) index.html: cart-footer mein
`<div class="cart-total-row"><span>Subtotal</span><strong id="cartTotal">₹0</strong></div>` ko is se replace karein:
    <div id="cartBreakdown"></div>
    <div class="cart-total-row"><span>Total</span><strong id="cartTotal">₹0</strong></div>

## 3) script.js: cart ke elements ke saath
    const cartBreakdownEl = document.getElementById('cartBreakdown');
`renderCart()` mein, `const totalPrice = ...` wali line ke baad:
    const pricing = getPricing(cart);
aur `cartTotalEl.textContent = formatRupees(totalPrice);` ko is se replace karein:
    if (cartTotalEl) cartTotalEl.textContent = formatRupees(pricing.total);
    if (cartBreakdownEl) cartBreakdownEl.innerHTML = cart.length ? breakdownHTML(cart, 'cart-total-row') : '';

## 4) script.js: `renderSummaryInto` poora function is se replace karein
    function renderSummaryInto(container, totalEl) {
      if (!container) return 0;
      container.innerHTML = '';
      checkoutItems.forEach(item => {
        const row = document.createElement('div');
        row.className = 'order-summary-row';
        row.innerHTML = `<span>${item.name} x${item.qty}</span><span>${formatRupees(item.price * item.qty)}</span>`;
        container.appendChild(row);
      });
      const extra = document.createElement('div');
      extra.innerHTML = breakdownHTML(checkoutItems, 'order-summary-row');
      container.appendChild(extra);
      const p = getPricing(checkoutItems);
      if (totalEl) totalEl.textContent = formatRupees(p.total);
      return p.total;
    }
Isse "Confirm" aur "Payment" dono steps mein discount lines aur sahi total dikhega.
