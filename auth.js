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


/* =====================================================
   FIREBASE INITIALIZATION
===================================================== */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


/* =====================================================
   CURRENT USER
===================================================== */

const authLink = document.getElementById("authLink");
const authLinkMobile = document.getElementById("authLinkMobile");

let currentUser = null;
let authReady = false;


/* =====================================================
   FIRESTORE USER PROFILE
===================================================== */

async function createOrUpdateUserProfile(user) {

  if (!user) return;

  try {

    const userRef = doc(db, "users", user.uid);

    const snapshot = await getDoc(userRef);


    /* ---------------------------------------------
       NEW USER
    --------------------------------------------- */

    if (!snapshot.exists()) {

      await setDoc(userRef, {

        uid: user.uid,

        fullName: user.displayName || "",

        email: user.email || "",

        phone: "",

        address: "",

        city: "",

        state: "",

        pincode: "",

        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp()

      });

      console.log("New customer profile created.");

    }


    /* ---------------------------------------------
       EXISTING USER
    --------------------------------------------- */

    else {

      await setDoc(
        userRef,
        {
          email: user.email || "",
          updatedAt: serverTimestamp()
        },
        {
          merge: true
        }
      );

      console.log("Customer profile updated.");

    }

  } catch (error) {

    console.error(
      "Firestore profile error:",
      error
    );

  }

}


/* =====================================================
   NAVBAR LOGIN / LOGOUT
===================================================== */

function setAuthLink(el, user) {

  if (!el) return;


  if (user) {

    const name =
      (
        user.displayName ||
        user.email.split("@")[0]
      )
      .split(" ")[0];


    el.textContent =
      "Logout (" + name + ")";


    el.href = "#";


    el.onclick = async (e) => {

      e.preventDefault();

      try {

        await signOut(auth);

        window.location.href =
          "index.html";

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

      }

    };

  }


  else {

    el.textContent = "Login";

    el.href = "login.html";

    el.onclick = null;

  }

}


/* =====================================================
   AUTH STATE
===================================================== */

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser = user;

    authReady = true;


    setAuthLink(
      authLink,
      user
    );


    setAuthLink(
      authLinkMobile,
      user
    );


    if (user) {

      await createOrUpdateUserProfile(
        user
      );

    }

  }
);


/* =====================================================
   LOGIN PAGE
===================================================== */

const form =
  document.getElementById("authForm");


if (form) {

  const msg =
    document.getElementById("authMsg");

  const nameField =
    document.getElementById("nameField");

  const submitBtn =
    document.getElementById("submitBtn");

  const tabs =
    document.querySelectorAll(".tab");


  let mode = "login";


  /* ---------------------------------------------
     MESSAGE
  --------------------------------------------- */

  const show = (
    text,
    ok = false
  ) => {

    msg.textContent = text;

    msg.className =
      "msg " +
      (ok ? "ok" : "err");

  };


  /* ---------------------------------------------
     FRIENDLY ERROR MESSAGES
  --------------------------------------------- */

  const friendly = (code) => ({

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/missing-password":
      "Please enter your password.",

    "auth/weak-password":
      "Password must be at least 6 characters.",

    "auth/email-already-in-use":
      "This email already has an account. Try logging in.",

    "auth/invalid-credential":
      "Email or password is incorrect.",

    "auth/user-not-found":
      "No account found with this email.",

    "auth/wrong-password":
      "Email or password is incorrect.",

    "auth/too-many-requests":
      "Too many attempts. Please wait a few minutes and try again.",

    "auth/popup-closed-by-user":
      "Google sign-in was closed before finishing.",

    "auth/unauthorized-domain":
      "This website's domain is not authorized in Firebase.",

    "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      "API key in firebase-config.js is wrong."

  }[code] ||
    "Something went wrong (" +
    code +
    "). Please try again."
  );


  /* ---------------------------------------------
     LOGIN / SIGNUP TABS
  --------------------------------------------- */

  tabs.forEach(
    (t) => {

      t.addEventListener(
        "click",
        () => {

          mode =
            t.dataset.mode;


          tabs.forEach(
            (x) => {

              x.classList.toggle(
                "active",
                x === t
              );

            }
          );


          nameField.hidden =
            mode !== "signup";


          submitBtn.textContent =
            mode === "signup"
              ? "Create account"
              : "Log in";


          msg.textContent = "";

        }
      );

    }
  );


  /* ---------------------------------------------
     OPEN SIGNUP MODE
  --------------------------------------------- */

  if (
    new URLSearchParams(
      window.location.search
    ).get("mode") === "signup"
  ) {

    const signupTab =
      [...tabs].find(
        (t) =>
          t.dataset.mode === "signup"
      );


    if (signupTab) {

      signupTab.click();

    }

  }


  /* ---------------------------------------------
     GO HOME
  --------------------------------------------- */

  const goHome = () => {

    window.location.href =
      "index.html";

  };


  /* ---------------------------------------------
     EMAIL LOGIN / SIGNUP
  --------------------------------------------- */

  form.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();


      const email =
        form.email.value.trim();


      const password =
        form.password.value;


      submitBtn.disabled = true;


      try {


        /* =====================================
           SIGN UP
        ===================================== */

        if (mode === "signup") {

          const name =
            form.fullname.value.trim();


          /* CREATE AUTH ACCOUNT */

          const cred =
            await createUserWithEmailAndPassword(
              auth,
              email,
              password
            );


          /* SAVE DISPLAY NAME */

          if (name) {

            await updateProfile(
              cred.user,
              {
                displayName: name
              }
            );

          }


          /* CREATE FIRESTORE PROFILE */

          await createOrUpdateUserProfile(
            cred.user
          );


          show(
            "Account created successfully!",
            true
          );


          setTimeout(
            goHome,
            700
          );

        }


        /* =====================================
           LOGIN
        ===================================== */

        else {

          const cred =
            await signInWithEmailAndPassword(
              auth,
              email,
              password
            );


          /* MAKE SURE FIRESTORE PROFILE EXISTS */

          await createOrUpdateUserProfile(
            cred.user
          );


          goHome();

        }

      }


      catch (err) {

        console.error(err);

        show(
          friendly(err.code)
        );

      }


      finally {

        submitBtn.disabled = false;

      }

    }
  );


  /* =====================================================
     GOOGLE LOGIN
  ===================================================== */

  document
    .getElementById("googleBtn")
    .addEventListener(
      "click",
      async () => {

        try {

          const provider =
            new GoogleAuthProvider();


          const result =
            await signInWithPopup(
              auth,
              provider
            );


          /* CREATE / UPDATE PROFILE */

          await createOrUpdateUserProfile(
            result.user
          );


          goHome();

        }


        catch (err) {

          console.error(err);

          show(
            friendly(err.code)
          );

        }

      }
    );


  /* =====================================================
     FORGOT PASSWORD
  ===================================================== */

  document
    .getElementById("forgotBtn")
    .addEventListener(
      "click",
      async () => {

        const email =
          form.email.value.trim();


        if (!email) {

          return show(
            "Enter your email above first, then tap Forgot password."
          );

        }


        try {

          await sendPasswordResetEmail(
            auth,
            email
          );


          show(
            "Password reset link sent to " +
            email +
            ". Check your inbox and spam folder.",
            true
          );

        }


        catch (err) {

          show(
            friendly(err.code)
          );

        }

      }
    );

}


/* =====================================================
   PURCHASE REQUIRES LOGIN
===================================================== */

const PROTECTED =
  ".add-cart-btn, .product-button, #checkoutBtn";


function showLoginToast(text) {

  const old =
    document.getElementById(
      "loginToast"
    );


  if (old) old.remove();


  const t =
    document.createElement(
      "div"
    );


  t.id = "loginToast";


  t.textContent = text;


  t.style.cssText =
    "position:fixed;" +
    "left:50%;" +
    "bottom:28px;" +
    "transform:translateX(-50%);" +
    "background:#3a2530;" +
    "color:#fff;" +
    "padding:12px 20px;" +
    "border-radius:8px;" +
    "font-size:15px;" +
    "z-index:99999;" +
    "max-width:90%;" +
    "text-align:center;";


  document.body.appendChild(t);

}


document.addEventListener(
  "click",
  (e) => {

    const target =
      e.target.closest(
        PROTECTED
      );


    if (!target) return;


    if (
      authReady &&
      currentUser
    ) {

      return;

    }


    e.preventDefault();

    e.stopImmediatePropagation();


    if (!authReady) return;


    showLoginToast(
      "Cart mein add karne ke liye pehle account banayein ya login karein."
    );


    setTimeout(
      () => {

        window.location.href =
          "login.html?mode=signup";

      },
      1200
    );

  },
  true
);


/* =====================================================
   PRODUCT CARD → PRODUCT PAGE
===================================================== */

(function () {

  const st =
    document.createElement(
      "style"
    );


  st.textContent =
    ".product-card{cursor:pointer}";


  document.head.appendChild(st);


  document.addEventListener(
    "click",
    (e) => {

      const card =
        e.target.closest(
          ".product-card"
        );


      if (!card) return;


      if (
        e.target.closest(
          "button, a"
        )
      ) {

        return;

      }


      const btn =
        card.querySelector(
          ".add-cart-btn"
        );


      if (!btn) return;


      const text =
        (sel) => {

          const el =
            card.querySelector(
              sel
            );

          return el
            ? el.textContent.trim()
            : "";

        };


      const params =
        new URLSearchParams({

          id:
            btn.dataset.id || "",

          name:
            btn.dataset.name || "",

          price:
            btn.dataset.price || "",

          img:
            btn.dataset.image || "",

          cat:
            text(".product-category"),

          desc:
            text(".product-description"),

          ptxt:
            text(".product-price")

        });


      window.location.href =
        "product.html?" +
        params.toString();

    }
  );

})();
