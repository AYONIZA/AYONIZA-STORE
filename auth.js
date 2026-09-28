import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ---------- Navbar: Login / Logout ----------
const authLink = document.getElementById("authLink");
onAuthStateChanged(auth, (user) => {
  if (!authLink) return;
  if (user) {
    const name = (user.displayName || user.email.split("@")[0]).split(" ")[0];
    authLink.textContent = "Logout (" + name + ")";
    authLink.href = "#";
    authLink.onclick = async (e) => {
      e.preventDefault();
      await signOut(auth);
    };
  } else {
    authLink.textContent = "Login";
    authLink.href = "login.html";
    authLink.onclick = null;
  }
});

// ---------- Login page ----------
const form = document.getElementById("authForm");
if (form) {
  const msg = document.getElementById("authMsg");
  const nameField = document.getElementById("nameField");
  const submitBtn = document.getElementById("submitBtn");
  const tabs = document.querySelectorAll(".tab");
  let mode = "login";

  const show = (text, ok = false) => {
    msg.textContent = text;
    msg.className = "msg " + (ok ? "ok" : "err");
  };

  const friendly = (code) => ({
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/email-already-in-use": "This email already has an account. Try logging in.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/unauthorized-domain": "This website's domain is not authorized in Firebase.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "API key in firebase-config.js is wrong."
  }[code] || "Something went wrong (" + code + "). Please try again.");

  tabs.forEach((t) => t.addEventListener("click", () => {
    mode = t.dataset.mode;
    tabs.forEach((x) => x.classList.toggle("active", x === t));
    nameField.hidden = mode !== "signup";
    submitBtn.textContent = mode === "signup" ? "Create account" : "Log in";
    msg.textContent = "";
  }));

  const goHome = () => { window.location.href = "index.html"; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    submitBtn.disabled = true;
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const name = form.fullname.value.trim();
        if (name) await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      goHome();
    } catch (err) {
      show(friendly(err.code));
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("googleBtn").addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      goHome();
    } catch (err) {
      show(friendly(err.code));
    }
  });

  document.getElementById("forgotBtn").addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) return show("Enter your email above first, then tap Forgot password.");
    try {
      await sendPasswordResetEmail(auth, email);
      show("Password reset link sent to " + email + ". Check your inbox and spam folder.", true);
    } catch (err) {
      show(friendly(err.code));
    }
  });
}
