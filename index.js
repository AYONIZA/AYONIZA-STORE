const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const CLIENT_SECRET = defineSecret("PHONEPE_CLIENT_SECRET");
const WEBHOOK_CRED = defineSecret("PHONEPE_WEBHOOK_CRED"); // "username:password" jo PhonePe dashboard mein webhook ke liye set karoge
const CLIENT_ID = defineString("PHONEPE_CLIENT_ID");
const CLIENT_VERSION = defineString("PHONEPE_CLIENT_VERSION", { default: "1" });
const PP_ENV = defineString("PHONEPE_ENV", { default: "sandbox" });
const SITE_URL = defineString("SITE_URL");
const ADMIN_EMAIL = defineString("ADMIN_EMAIL");

const OPTS = { region: "asia-south1", secrets: [CLIENT_SECRET, WEBHOOK_CRED] };

// ---- Server-side price list (browser ke price par bharosa nahi) ----
const PRODUCTS = {
  "pink-bloom-pearl-hoops": { name: "Pink Bloom Pearl Hoops", price: 199 },
  "pink-tulip-bloom-earrings": { name: "Pink Tulip Bloom Earrings", price: 199 },
  "pearl-bow-crystal-studs": { name: "Pearl Bow Crystal Studs", price: 199 },
  "golden-leaf-pearl-earrings": { name: "Golden Leaf Pearl Earrings", price: 199 },
  "chunky-gold-hoop-earrings": { name: "Chunky Gold Hoop Earrings", price: 299 },
  "oxidised-silver-chandbali-jewellery-set": { name: "Oxidised Silver Chandbali Jewellery Set", price: 419 },
  "golden-star-charm-kamarbandh": { name: "Golden Star Charm Kamarbandh", price: 239 },
  "silver-star-charm-kamarbandh": { name: "Silver Star Charm Kamarbandh", price: 249 },
  "golden-heart-pendant-necklace": { name: "Golden Heart Pendant Necklace", price: 249 },
  "pearl-hand-chain-hathphool": { name: "Pearl Hand Chain Hathphool", price: 199 },
  "multi-pearl-hand-chain-hathphool": { name: "Multi Pearl Hand Chain Hathphool", price: 199 },
  "black-bead-hand-chain-hathphool": { name: "Black Bead Hand Chain Hathphool", price: 199 },
  "gold-infinity-hand-bracelet": { name: "Gold Infinity Hand Bracelet", price: 199 }
};
const PREPAID_EXTRA_PERCENT = 10; // "Extra 10% OFF on Prepaid"
function bundlePercent(totalQty) { return totalQty >= 3 ? 15 : totalQty === 2 ? 10 : 0; }

const FLOW = ["PLACED", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

// ---- PhonePe helpers ----
function hosts() {
  return PP_ENV.value() === "production"
    ? { auth: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token", api: "https://api.phonepe.com/apis/pg" }
    : { auth: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token", api: "https://api-preprod.phonepe.com/apis/pg-sandbox" };
}
async function getToken() {
  const res = await fetch(hosts().auth, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID.value(),
      client_version: CLIENT_VERSION.value(),
      client_secret: CLIENT_SECRET.value(),
      grant_type: "client_credentials"
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("PhonePe token error: " + JSON.stringify(data));
  return data.access_token;
}
async function ppFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(hosts().api + path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: "O-Bearer " + token }
  });
  return res.json();
}

// ---- Order helpers ----
function entry(status, note) { return { status, note: note || "", time: admin.firestore.Timestamp.now() }; }

async function settleFromPhonePe(orderId) {
  const ref = db.collection("orders").doc(orderId);
  const st = await ppFetch(`/checkout/v2/order/${orderId}/status`);
  const state = st.state; // COMPLETED | FAILED | PENDING
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== "PENDING_PAYMENT") return;
    if (state === "COMPLETED") {
      tx.update(ref, {
        status: "PLACED", paymentStatus: "PAID",
        history: admin.firestore.FieldValue.arrayUnion(entry("PLACED", "Payment received"))
      });
    } else if (state === "FAILED") {
      tx.update(ref, { status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
    }
  });
  return state || "UNKNOWN";
}

function isAdminReq(request) {
  const t = request.auth && request.auth.token;
  return !!t && t.email === ADMIN_EMAIL.value() && t.email_verified === true;
}

// ---- Cancel + refund (customer aur admin dono yahin se) ----
const CANCELLABLE = ["PLACED", "CONFIRMED", "PACKED"]; // SHIPPED se pehle tak
async function cancelAndRefund(orderId, by) {
  const ref = db.collection("orders").doc(orderId);
  let total = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const o = snap.data();
    if (!CANCELLABLE.includes(o.status) || o.paymentStatus !== "PAID") {
      throw new HttpsError("failed-precondition", "Ye order ab cancel nahi ho sakta (shipped ho chuka hai ya payment pending hai).");
    }
    total = o.total;
    tx.update(ref, {
      status: "CANCELLED", refundStatus: "REFUND_INITIATED",
      history: admin.firestore.FieldValue.arrayUnion(entry("CANCELLED", "Cancelled by " + by))
    });
  });
  try {
    const r = await ppFetch("/payments/v2/refund", {
      method: "POST",
      body: JSON.stringify({ merchantRefundId: "RF-" + orderId, originalMerchantOrderId: orderId, amount: total * 100 })
    });
    if (!r.state) throw new Error(JSON.stringify(r));
    await ref.update({ refundStatus: "REFUND_" + r.state, refundId: r.refundId || "" });
  } catch (e) {
    console.error("Refund failed for " + orderId, e);
    await ref.update({ refundStatus: "REFUND_FAILED" }); // admin PhonePe dashboard se manually refund kar de
  }
}

// ---- 1. Order banao + PhonePe payment shuru karo ----
exports.createOrder = onCall(OPTS, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please login first.");
  const { items, address } = request.data || {};
  if (!Array.isArray(items) || !items.length || items.length > 30) throw new HttpsError("invalid-argument", "Cart is empty.");
  const a = address || {};
  for (const k of ["name", "mobile", "address", "city", "state", "pin"]) {
    if (!a[k] || String(a[k]).length > 200) throw new HttpsError("invalid-argument", "Address incomplete: " + k);
  }
  if (!/^[0-9]{10}$/.test(a.mobile) || !/^[0-9]{6}$/.test(a.pin)) throw new HttpsError("invalid-argument", "Invalid mobile or PIN.");

  let subtotal = 0, totalQty = 0;
  const lines = items.map((i) => {
    const p = PRODUCTS[i.id];
    const qty = Math.floor(Number(i.qty));
    if (!p || !(qty > 0 && qty <= 20)) throw new HttpsError("invalid-argument", "Invalid item.");
    subtotal += p.price * qty; totalQty += qty;
    return { id: i.id, name: p.name, price: p.price, qty };
  });
  const afterBundle = subtotal * (1 - bundlePercent(totalQty) / 100);
  const total = Math.round(afterBundle * (1 - PREPAID_EXTRA_PERCENT / 100));

  const counterRef = db.collection("counters").doc("orders");
  const num = await db.runTransaction(async (tx) => {
    const s = await tx.get(counterRef);
    const n = (s.exists ? s.data().n : 1000) + 1;
    tx.set(counterRef, { n });
    return n;
  });
  const orderId = "AYO-" + num;
  const ref = db.collection("orders").doc(orderId);
  await ref.set({
    orderId, uid: request.auth.uid, email: request.auth.token.email || "",
    items: lines, subtotal, total,
    address: { name: a.name, mobile: a.mobile, address: a.address, landmark: a.landmark || "", city: a.city, state: a.state, pin: a.pin, country: a.country || "India" },
    status: "PENDING_PAYMENT", paymentStatus: "PENDING",
    history: [], shipment: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const resp = await ppFetch("/checkout/v2/pay", {
    method: "POST",
    body: JSON.stringify({
      merchantOrderId: orderId,
      amount: total * 100, // paise
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "AYONIZA order " + orderId,
        merchantUrls: { redirectUrl: `${SITE_URL.value()}/order-details.html?id=${orderId}` }
      }
    })
  });
  if (!resp.redirectUrl) {
    await ref.update({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
    console.error("PhonePe pay error", resp);
    throw new HttpsError("internal", "Payment could not be started. Please try again.");
  }
  return { orderId, total, redirectUrl: resp.redirectUrl };
});

// ---- 2. Customer wapas aaye to payment verify ----
exports.verifyPayment = onCall(OPTS, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please login.");
  const orderId = String((request.data || {}).orderId || "");
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  if (snap.data().uid !== request.auth.uid && !isAdminReq(request)) throw new HttpsError("permission-denied", "Not your order.");
  if (snap.data().status !== "PENDING_PAYMENT") return { status: snap.data().status };
  const state = await settleFromPhonePe(orderId);
  return { state };
});

// ---- 3. PhonePe webhook (backup, agar customer browser band kar de) ----
exports.phonepeWebhook = onRequest(OPTS, async (req, res) => {
  const expected = crypto.createHash("sha256").update(WEBHOOK_CRED.value()).digest("hex");
  const got = String(req.headers.authorization || "").replace(/^SHA256\(?|\)$/gi, "").trim().toLowerCase();
  if (got !== expected) return res.status(401).send("unauthorized");
  const orderId = req.body && req.body.payload && req.body.payload.merchantOrderId;
  if (orderId) {
    try { await settleFromPhonePe(orderId); } catch (e) { console.error(e); } // body par bharosa nahi, status API se dobara check
  }
  res.status(200).send("ok");
});

// ---- Customer: apna order cancel karo ----
exports.cancelOrder = onCall(OPTS, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please login.");
  const orderId = String((request.data || {}).orderId || "");
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists || snap.data().uid !== request.auth.uid) throw new HttpsError("permission-denied", "Not your order.");
  await cancelAndRefund(orderId, "customer");
  return { ok: true };
});

// ---- 4. Admin: status badlo ----
exports.adminUpdateStatus = onCall(OPTS, async (request) => {
  if (!isAdminReq(request)) throw new HttpsError("permission-denied", "Admin only.");
  const { orderId, status, courier, trackingId, expectedDelivery } = request.data || {};
  if (status === "CANCELLED") { await cancelAndRefund(String(orderId), "admin"); return { ok: true }; }
  const ref = db.collection("orders").doc(String(orderId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const cur = snap.data().status;
    const ci = FLOW.indexOf(cur), ni = FLOW.indexOf(status);
    const okForward = ci >= 0 && ni === ci + 1;
    if (!okForward) throw new HttpsError("failed-precondition", `${cur} se ${status} nahi ho sakta.`);
    const upd = { status, history: admin.firestore.FieldValue.arrayUnion(entry(status)) };
    if (status === "SHIPPED") {
      if (!courier || !trackingId) throw new HttpsError("invalid-argument", "Courier aur tracking ID zaroori hai.");
      upd.shipment = { courier: String(courier), trackingId: String(trackingId), expectedDelivery: String(expectedDelivery || "") };
    }
    tx.update(ref, upd);
  });
  return { ok: true };
});
