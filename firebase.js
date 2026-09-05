import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCHj8PokRBJZQwRACuLrRv_aWL27W2QoFY",
    authDomain: "review-app-e8420.firebaseapp.com",
    projectId: "review-app-e8420",
    storageBucket: "review-app-e8420.firebasestorage.app",
    messagingSenderId: "32382675007",
    appId: "1:32382675007:web:8c423b50dd1bfd568b708a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const authStatus = document.getElementById("authStatus");
const appMain = document.querySelector(".main");

loginBtn.addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error(error);
        authStatus.textContent = "ログイン失敗";
    }
});

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginBtn.hidden = true;
        logoutBtn.hidden = false;
        authStatus.textContent = "ログイン中: " + (user.email || "不明");
        appMain.classList.remove("locked");
    } else {
        loginBtn.hidden = false;
        logoutBtn.hidden = true;
        authStatus.textContent = "ログインしてください";
        appMain.classList.add("locked");
    }
});