# AYONIZA: PhonePe Pay Now + Order Tracking setup

## A. Teen chhote badlav (aapki existing files mein)

### 1) index.html: payment step (id="checkoutPaymentStep") ke andar
`payment-info-box` wala poora div hata dein (UPI QR, copy, "Pay with UPI App", sab).
Button ka text badal dein:
    <button type="button" class="btn primary checkout-submit" id="placeOrderBtn">Pay Now</button>
Footer mein "Track your Order" ka href badal dein: href="my-orders.html" (aur target/rel hata dein).

### 2) auth.js: sabse upar imports ke saath ye add karein
    import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
Phir `const auth = getAuth(app);` ke neeche:
    const fns = getFunctions(app, "asia-south1");
    window.ayonizaCreateOrder = async (items, address) => {
      const res = await httpsCallable(fns, "createOrder")({ items, address });
      return res.data;
    };
Navbar mein "My Orders" link chahiye to setAuthLink ke paas ek <a href="my-orders.html"> add kar sakte hain.

### 3) script.js: poora `placeOrderBtn?.addEventListener('click', () => { ... });` block is se replace karein
    placeOrderBtn?.addEventListener('click', async () => {
      const info = JSON.parse(checkoutForm.dataset.pendingInfo || '{}');
      const items = checkoutItems.map(i => ({ id: i.id, qty: i.qty }));
      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = 'Starting payment…';
      try {
        const res = await window.ayonizaCreateOrder(items, info);
        if (checkoutItems === cart || checkoutItems.__fromCart) sessionStorage.setItem('clearCartOnPaid', res.orderId);
        window.location.href = res.redirectUrl;
      } catch (err) {
        alert(err.message || 'Payment could not be started. Please try again.');
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = 'Pay Now';
      }
    });
Cart tabhi khaali hoga jab payment successful verify ho jaye.

## B. Firebase deploy (computer par, ek baar)
1. Firebase console: Blaze plan on karein, Firestore Database banayein (production mode).
2. `npm i -g firebase-tools` -> `firebase login` -> project folder mein `firebase init` (Firestore + Functions chunein, existing files overwrite NA karein).
3. `functions/.env.example` ko `functions/.env` naam se save karke apni values bharein.
4. `firestore.rules` mein admin email badlein.
5. Secrets (terminal mein, ye prompt par paste hote hain, kisi file mein nahi):
       firebase functions:secrets:set PHONEPE_CLIENT_SECRET
       firebase functions:secrets:set PHONEPE_WEBHOOK_CRED      (format: username:password, jo aap PhonePe webhook mein rakhenge)
6. `firebase deploy --only functions,firestore:rules`
7. Firebase Auth > Settings > Authorized domains mein aapka github.io domain hona chahiye.
8. Admin ke liye apne admin email se account banayein/Google login karein (email verified hona zaroori hai), phir /admin.html kholen.

## C. PhonePe dashboard
- Abhi Test Mode ON rakhein, PHONEPE_ENV=sandbox.
- Settings > Webhook: URL = deploy ke baad firebase jo `phonepeWebhook` ka URL de, username/password wahi jo PHONEPE_WEBHOOK_CRED mein dale.
- KYC approve + live credentials aane par: .env mein PHONEPE_ENV=production, naya client id/secret, secret dobara set, redeploy.

## D. Discount rule (functions/index.js ke upar)
Server total = cart value, phir Buy 2 = 10% / Buy 3+ = 15% off, phir prepaid extra 10% (dono stack hote hain). Agar aap stack nahi karna chahte to `PREPAID_EXTRA_PERCENT` aur total ka formula badal dein.
Naya product add karein to `PRODUCTS` list mein bhi daalna zaroori hai, warna order reject hoga.
