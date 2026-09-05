import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDocs,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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
const cloudDb = getFirestore(app);

const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const authStatus = document.getElementById("authStatus");
const appMain = document.querySelector(".main");

const CLOUD_GENRES = ["映画", "アニメ", "ドラマ", "ゲーム"];
const MAX_BATCH_WRITES = 400;

function normalizeGenre(value) {
    return CLOUD_GENRES.includes(value) ? value : "映画";
}

function toCloudItem(item, fallbackGenre) {
    const genre = normalizeGenre(item.genre || fallbackGenre);
    const syncId = item.syncId || (self.crypto && self.crypto.randomUUID
        ? self.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    return {
        syncId,
        genre,
        name: String(item.name || ""),
        memo: String(item.memo || ""),
        date: String(item.date || ""),
        value: typeof item.value === "number" ? item.value : 0,
        detail: item.detail || null
    };
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function replaceUserData(uid, dataObj) {
    const itemsRef = collection(cloudDb, "users", uid, "items");
    const remoteSnap = await getDocs(itemsRef);
    const remoteIds = new Set(remoteSnap.docs.map(d => d.id));

    const localItems = [];
    for (const genre of CLOUD_GENRES) {
        const arr = Array.isArray(dataObj[genre]) ? dataObj[genre] : [];
        for (const item of arr) {
            const cloudItem = toCloudItem(item, genre);
            localItems.push(cloudItem);
        }
    }

    const localIds = new Set(localItems.map(item => item.syncId));
    const deleteIds = [...remoteIds].filter(id => !localIds.has(id));

    const setBatches = chunkArray(localItems, MAX_BATCH_WRITES);
    for (const group of setBatches) {
        const batch = writeBatch(cloudDb);
        for (const item of group) {
            const ref = doc(cloudDb, "users", uid, "items", item.syncId);
            batch.set(ref, {
                ...item,
                updatedAt: serverTimestamp()
            });
        }
        await batch.commit();
    }

    const deleteBatches = chunkArray(deleteIds, MAX_BATCH_WRITES);
    for (const group of deleteBatches) {
        const batch = writeBatch(cloudDb);
        for (const id of group) {
            const ref = doc(cloudDb, "users", uid, "items", id);
            batch.delete(ref);
        }
        await batch.commit();
    }
}

async function pullUserData(uid) {
    const itemsRef = collection(cloudDb, "users", uid, "items");
    const snap = await getDocs(itemsRef);
    const data = {
        "映画": [],
        "アニメ": [],
        "ドラマ": [],
        "ゲーム": []
    };

    snap.forEach((docSnap) => {
        const value = docSnap.data() || {};
        const genre = normalizeGenre(value.genre);
        const item = {
            syncId: docSnap.id,
            genre,
            name: String(value.name || ""),
            memo: String(value.memo || ""),
            date: String(value.date || ""),
            value: typeof value.value === "number" ? value.value : 0,
            detail: value.detail || null
        };
        data[genre].push(item);
    });

    return data;
}

function dispatchAuthEvent(user) {
    window.dispatchEvent(new CustomEvent("firebase-auth-changed", {
        detail: {
            uid: user ? user.uid : null,
            email: user ? user.email : null
        }
    }));
}

window.firebaseSync = {
    getCurrentUserUid: () => (auth.currentUser ? auth.currentUser.uid : null),
    replaceUserData,
    pullUserData
};

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
        dispatchAuthEvent(user);
    } else {
        loginBtn.hidden = false;
        logoutBtn.hidden = true;
        authStatus.textContent = "ログインしてください";
        appMain.classList.add("locked");
        dispatchAuthEvent(null);
    }
});