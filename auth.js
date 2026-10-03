import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


/* ================= FIREBASE ================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* ================= AUTH STATE ================= */

const DEBUG = true; // testing ke baad false kar dena

let currentUser = null;
let authReady = false;
let signupInProgress = false; // signup ke time listener profile save na kare (race condition fix)


/* ================= SAVE USER TO FIRESTORE ================= */

async function saveUserProfile(user, extra = {}) {
  if (!user) return;

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    const fullName = extra.fullName || user.displayName || "";

    if (!snap.exists()) {
      // CREATE: rules me allowed keys:
      // uid, fullName, email, phone, createdAt, updatedAt
      await setDoc(userRef, {
        uid: user.uid,
        fullName: fullName,
        email: user.email || "",
        phone: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      // UPDATE: rules me sirf fullName, phone, updatedAt badal sakte hain.
      // Naam sirf tab bharte hain jab Firestore me khaali ho.
      const savedName = snap.data().fullName || "";
      const update = { updatedAt: serverTimestamp() };

      if (fullName && !savedName) update.fullName = fullName;

      await setDoc(userRef, update, { merge: true });
    }

    console.log("Firestore profile saved for uid:", user.uid);
  } catch (error) {
    console.error("Firestore profile error:", error.code, error.message);

    // Testing ke time DEBUG = true rakho, error screen pe dikhega.
    // Sab theek hone ke baad DEBUG = false kar dena.
    if (DEBUG) {
      alert("Firestore error: " + (error.code || "") + "\n" + error.message);
    }
  }
}


/* ================= NAVBAR ================= */

const authLink = document.getElementById("authLink");
const authLinkMobile = document.getElementById("authLinkMobile");

function setAuthLink(element, user) {
  if (!element) return;

  if (user) {
    const name = (
      user.displayName ||
      user.email?.split("@")[0] ||
      "Account"
    ).split(" ")[0];

    element.textContent = "Logout (" + name + ")";
    element.href = "#";

    element.onclick = async function (event) {
      event.preventDefault();

      try {
        await signOut(auth);
        window.location.href = "index.html";
      } catch (error) {
        console.error("Logout error:", error);
      }
    };
  } else {
    element.textContent = "Login";
    element.href = "login.html";
    element.onclick = null;
  }
}


/* ================= AUTH LISTENER ================= */

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  authReady = true;

  setAuthLink(authLink, user);
  setAuthLink(authLinkMobile, user);

  // Signup ke beech me skip: signup flow khud naam ke saath save karega
  if (user && !signupInProgress) {
    await saveUserProfile(user);
  }
});


/* ================= LOGIN PAGE ================= */

const form = document.getElementById("authForm");

if (form) {
  const msg = document.getElementById("authMsg");
  const nameField = document.getElementById("nameField");
  const submitBtn = document.getElementById("submitBtn");
  const tabs = document.querySelectorAll(".tab");
  const googleBtn = document.getElementById("googleBtn");
  const forgotBtn = document.getElementById("forgotBtn");

  let mode = "login";

  function showMessage(message, success = false) {
    if (!msg) return;
    msg.textContent = message;
    msg.className = "msg " + (success ? "ok" : "err");
  }

  function friendlyError(code) {
    const errors = {
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/missing-password": "Please enter your password.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/email-already-in-use": "This email already has an account. Please log in.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Email or password is incorrect.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/network-request-failed": "Network problem. Please check your internet connection.",
      "auth/popup-closed-by-user": "Google login was closed.",
      "auth/cancelled-popup-request": "Google login was cancelled.",
      "auth/popup-blocked": "Popup was blocked. Please allow popups and try again.",
      "auth/account-exists-with-different-credential":
        "This email is already registered with a different login method.",
      "auth/unauthorized-domain": "This website is not authorized in Firebase.",
      "auth/operation-not-allowed": "This login method is not enabled.",
      // Pehle yahan galat code tha, sahi code ye hai:
      "auth/invalid-api-key": "Firebase configuration needs to be checked.",
      "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
        "Firebase configuration needs to be checked."
    };

    return errors[code] || "Unable to complete this request. Please try again.";
  }


  /* ================= LOGIN/SIGNUP TABS ================= */

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      mode = tab.dataset.mode;

      tabs.forEach((item) => {
        item.classList.toggle("active", item === tab);
      });

      if (nameField) {
        nameField.hidden = mode !== "signup";
      }

      if (submitBtn) {
        submitBtn.textContent = mode === "signup" ? "Create account" : "Log in";
      }

      if (msg) {
        msg.textContent = "";
        msg.className = "msg";
      }
    });
  });


  /* ================= OPEN SIGNUP ================= */

  const urlMode = new URLSearchParams(window.location.search).get("mode");

  if (urlMode === "signup") {
    const signupTab = [...tabs].find((tab) => tab.dataset.mode === "signup");
    if (signupTab) signupTab.click();
  }


  /* ================= GO HOME ================= */

  function goHome() {
    window.location.href = "index.html";
  }


  /* ================= EMAIL LOGIN/SIGNUP ================= */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email) {
      showMessage("Please enter your email.");
      return;
    }

    if (!password) {
      showMessage("Please enter your password.");
      return;
    }

    // Signup me naam pehle check karo, account banane se pehle
    let fullName = "";

    if (mode === "signup") {
      fullName = (form.fullname?.value || "").trim();

      if (!fullName) {
        showMessage("Please enter your full name.");
        return;
      }
    }

    submitBtn.disabled = true;

    try {
      /* ========== SIGNUP ========== */

      if (mode === "signup") {
        signupInProgress = true;

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const user = credential.user;

        // updateProfile fail bhi ho to Firestore save zaroor chale
        try {
          await updateProfile(user, { displayName: fullName });
        } catch (profileError) {
          console.error("updateProfile error:", profileError);
        }

        await saveUserProfile(user, { fullName });

        // Navbar ka naam update karne ke liye
        setAuthLink(authLink, user);
        setAuthLink(authLinkMobile, user);

        showMessage("Account created successfully!", true);
        setTimeout(goHome, 700);
      }

      /* ========== LOGIN ========== */

      else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await saveUserProfile(credential.user);
        goHome();
      }
    } catch (error) {
      console.error("Authentication error:", error);
      showMessage(friendlyError(error.code));
    } finally {
      signupInProgress = false;
      submitBtn.disabled = false;
    }
  });


  /* ================= GOOGLE LOGIN ================= */

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      googleBtn.disabled = true;

      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);

        await saveUserProfile(result.user);
        goHome();
      } catch (error) {
        console.error("Google login error:", error);
        showMessage(friendlyError(error.code));
      } finally {
        googleBtn.disabled = false;
      }
    });
  }


  /* ================= FORGOT PASSWORD ================= */

  if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
      const email = form.email.value.trim();

      if (!email) {
        showMessage("Enter your email first.");
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email);
        showMessage("Password reset link sent to your email.", true);
      } catch (error) {
        console.error("Password reset error:", error);
        showMessage(friendlyError(error.code));
      }
    });
  }
}


/* ================= PURCHASE LOGIN PROTECTION ================= */

const PROTECTED = ".add-cart-btn, .product-button, #checkoutBtn";

let loginToastTimer = null;
let loginRedirectTimer = null;

function showLoginToast(message) {
  const old = document.getElementById("loginToast");
  if (old) old.remove();

  clearTimeout(loginToastTimer);

  const toast = document.createElement("div");
  toast.id = "loginToast";
  toast.textContent = message;

  toast.style.cssText =
    "position:fixed;" +
    "left:50%;" +
    "bottom:28px;" +
    "transform:translateX(-50%);" +
    "background:#3a2530;" +
    "color:white;" +
    "padding:12px 20px;" +
    "border-radius:8px;" +
    "font-size:15px;" +
    "z-index:99999;" +
    "max-width:90%;" +
    "text-align:center;";

  document.body.appendChild(toast);

  // Toast apne aap hat jaye
  loginToastTimer = setTimeout(() => toast.remove(), 3000);
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target.closest(PROTECTED);
    if (!target) return;

    // Logged in hai to normal chalne do
    if (authReady && currentUser) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // Auth abhi load ho raha hai: pehle click bina message ke ignore hota tha
    if (!authReady) {
      showLoginToast("Please wait a moment and try again.");
      return;
    }

    showLoginToast("Please login or create an account before purchasing.");

    // Baar-baar click pe multiple redirect timers na bane
    if (loginRedirectTimer) return;

    loginRedirectTimer = setTimeout(() => {
      window.location.href = "login.html?mode=signup";
    }, 1200);
  },
  true
);


/* ================= PRODUCT PAGE ================= */

(function () {
  const style = document.createElement("style");
  style.textContent = ".product-card{cursor:pointer}";
  document.head.appendChild(style);

  document.addEventListener("click", (event) => {
    const card = event.target.closest(".product-card");
    if (!card) return;

    if (event.target.closest("button, a")) return;

    const btn = card.querySelector(".add-cart-btn");
    if (!btn) return;

    const getText = (selector) => {
      const element = card.querySelector(selector);
      return element ? element.textContent.trim() : "";
    };

    const params = new URLSearchParams({
      id: btn.dataset.id || "",
      name: btn.dataset.name || "",
      price: btn.dataset.price || "",
      img: btn.dataset.image || "",
      cat: getText(".product-category"),
      desc: getText(".product-description"),
      ptxt: getText(".product-price")
    });

    window.location.href = "product.html?" + params.toString();
  });
})();
