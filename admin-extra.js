import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMIN_UIDS = ["t8lcx1r7jdSXowv4EPgxJA8FXKn1", "ZWCoYQo4EwN6T58bYcxbw27KN4D3"];
const $ = (id) => document.getElementById(id);
let ordersCache = [], usersCache = [], offersCache = [];
const rupee = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n || 0));
const safe = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText = (v) => { try { if (!v) return "—"; const d = typeof v?.toDate === "function" ? v.toDate() : new Date(typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN"); } catch { return "—"; } };
function setMsg(id, msg, bad=false) { const el=$(id); if(!el)return; el.textContent=msg; el.hidden=false; el.style.color=bad?"#b42318":"#176b35"; }
function showTable(id, headers, rows) { const el=$(id); if(!el)return; el.innerHTML = `<div class="extra-table-wrap"><table class="extra-table"><thead><tr>${headers.map(h=>`<th>${safe(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">No records found.</td></tr>`}</tbody></table></div>`; }
async function loadExtraData() {
  const [os, us, fs] = await Promise.all([getDocs(collection(db,"orders")), getDocs(collection(db,"users")), getDocs(collection(db,"offers"))]);
  ordersCache = os.docs.map(d=>({id:d.id,...d.data()}));
  usersCache = us.docs.map(d=>({id:d.id,...d.data()}));
  offersCache = fs.docs.map(d=>({id:d.id,...d.data()}));
  renderReports(); renderPayments(); renderCustomers(); renderOffers();
}
function renderReports() {
  const paid = ordersCache.filter(o=>String(o.paymentStatus||"").toUpperCase()==="PAID" || String(o.paymentStatus||"").toUpperCase()==="SUCCESS" || String(o.paymentStatus||"").toUpperCase()==="VERIFIED");
  const revenue = paid.reduce((s,o)=>s+Number(o.total ?? o.amount ?? 0),0);
  const delivered = ordersCache.filter(o=>String(o.orderStatus||"").toUpperCase()==="DELIVERED").length;
  const pending = ordersCache.filter(o=>! ["PAID","SUCCESS","VERIFIED"].includes(String(o.paymentStatus||"").toUpperCase())).length;
  $("extraRevenue").textContent=rupee(revenue); $("extraOrders").textContent=ordersCache.length; $("extraDelivered").textContent=delivered; $("extraUnpaid").textContent=pending;
  const month = new Date(); const thisMonth = ordersCache.filter(o=>{ const raw=o.createdAt||o.created_at||o.orderDate; if(!raw)return false; const d=typeof raw?.toDate==="function"?raw.toDate():new Date(typeof raw==="number"?(raw<1e12?raw*1000:raw):raw); return !Number.isNaN(d.getTime())&&d.getMonth()===month.getMonth()&&d.getFullYear()===month.getFullYear(); });
  $("extraMonthOrders").textContent=thisMonth.length;
  $("extraMonthRevenue").textContent=rupee(thisMonth.filter(o=>["PAID","SUCCESS","VERIFIED"].includes(String(o.paymentStatus||"").toUpperCase())).reduce((s,o)=>s+Number(o.total??o.amount??0),0));
}
function renderPayments() {
  const rows=ordersCache.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).map(o=>`<tr><td>${safe(o.id)}</td><td>${safe(o.customerName||o.name||o.email||o.userId||"—")}</td><td>${rupee(o.total??o.amount)}</td><td>${safe(o.paymentProvider||o.paymentMethod||"—")}</td><td><span class="extra-status">${safe(o.paymentStatus||"UNKNOWN")}</span></td><td>${safe(o.razorpayPaymentId||o.paymentId||o.transactionId||"—")}</td><td>${safe(dateText(o.createdAt||o.created_at))}</td></tr>`);
  showTable("paymentsTable",["Order ID","Customer","Amount","Provider","Payment Status","Payment Reference","Created"],rows);
}
function renderCustomers() {
  const q=($("customerSearch")?.value||"").toLowerCase();
  const filtered=usersCache.filter(u=>[u.fullName,u.name,u.email,u.phone,u.uid,u.id].some(v=>String(v||"").toLowerCase().includes(q)));
  showTable("customersTable",["Name","Email","Phone","UID","Profile Updated"],filtered.map(u=>`<tr><td>${safe(u.fullName||u.name||"—")}</td><td>${safe(u.email||"—")}</td><td>${safe(u.phone||"—")}</td><td>${safe(u.uid||u.id)}</td><td>${safe(dateText(u.updatedAt||u.createdAt))}</td></tr>`));
  $("customerCount").textContent=filtered.length;
}
function renderOffers() {
  showTable("offersTable",["Code","Type","Value","Minimum Order","Active","Actions"],offersCache.map(o=>`<tr><td>${safe(o.code||o.id)}</td><td>${safe(o.type||"percent")}</td><td>${safe(o.value??0)}${String(o.type||"percent")==="percent"?"%":" ₹"}</td><td>${rupee(o.minimumOrder||0)}</td><td>${o.active===false?"Inactive":"Active"}</td><td><button class="extra-btn danger" data-delete-offer="${safe(o.id)}">Delete</button></td></tr>`));
  document.querySelectorAll("[data-delete-offer]").forEach(btn=>btn.addEventListener("click",async()=>{const id=btn.dataset.deleteOffer;if(!confirm(`Delete offer ${id}?`))return;try{await deleteDoc(doc(db,"offers",id));await loadExtraData();setMsg("offerMessage","Offer deleted.");}catch(e){setMsg("offerMessage",e.message,true);}}));
}
$("customerSearch")?.addEventListener("input",renderCustomers);
$("refreshAdminData")?.addEventListener("click",async()=>{try{await loadExtraData();setMsg("extraMessage","Dashboard data refreshed.");}catch(e){setMsg("extraMessage","Refresh failed: "+e.message,true);}});
$("offerForm")?.addEventListener("submit",async(e)=>{e.preventDefault();const code=$("offerCode").value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"");const type=$("offerType").value;const value=Number($("offerValue").value);const minimumOrder=Number($("offerMinimum").value||0);const active=$("offerActive").checked;if(!code||!Number.isFinite(value)||value<=0||(type==="percent"&&value>100)||minimumOrder<0){setMsg("offerMessage","Enter a valid code, value and minimum order.",true);return;}try{await setDoc(doc(db,"offers",code),{code,type,value,minimumOrder,active,updatedAt:serverTimestamp(),createdBy:auth.currentUser.uid},{merge:true});e.target.reset();$("offerActive").checked=true;await loadExtraData();setMsg("offerMessage","Offer saved in Firestore. Website checkout must also read and validate this offer before applying it.");}catch(err){setMsg("offerMessage","Could not save offer: "+err.message,true);}});
onAuthStateChanged(auth,async(user)=>{if(!user){window.location.href="login.html";return;}if(!ADMIN_UIDS.includes(user.uid)){alert("Access denied: admin only.");window.location.href="index.html";return;}try{await loadExtraData();}catch(e){console.error(e);setMsg("extraMessage","Some admin data could not load. Check Firestore Rules and collection names: "+e.message,true);}});
