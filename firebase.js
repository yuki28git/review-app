import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDocs,
    writeBatch,
    serverTimestamp,
    onSnapshot,
    setDoc,
    deleteDoc
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
    const genre = normalizeGenre((item && item.genre) || fallbackGenre);
    const syncId =
        (item && item.syncId) ||
        (self.crypto && self.crypto.randomUUID
            ? self.crypto.randomUUID()
            : Date.now() + "_" + Math.random().toString(36).slice(2, 10));

    return {
        syncId: String(syncId),
        genre: genre,
        name: String((item && item.name) || ""),
        memo: String((item && item.memo) || ""),
        date: String((item && item.date) || ""),
        value: typeof (item && item.value) === "number" ? item.value : 0,
        detail: (item && item.detail) || null
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
    const remoteIds = new Set(remoteSnap.docs.map(function (d) { return d.id; }));

    const localItems = [];
    for (const genre of CLOUD_GENRES) {
        const arr = Array.isArray(dataObj && dataObj[genre]) ? dataObj[genre] : [];
        for (const item of arr) {
            localItems.push(toCloudItem(item, genre));
        }
    }

    const localIds = new Set(localItems.map(function (item) { return item.syncId; }));
    const deleteIds = Array.from(remoteIds).filter(function (id) { return !localIds.has(id); });

    const setBatches = chunkArray(localItems, MAX_BATCH_WRITES);
    for (const group of setBatches) {
        const batch = writeBatch(cloudDb);
        for (const item of group) {
            const ref = doc(cloudDb, "users", uid, "items", item.syncId);
            batch.set(ref, {
                syncId: item.syncId,
                genre: item.genre,
                name: item.name,
                memo: item.memo,
                date: item.date,
                value: item.value,
                detail: item.detail,
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

    snap.forEach(function (docSnap) {
        const value = docSnap.data() || {};
        const genre = normalizeGenre(value.genre);
        data[genre].push({
            syncId: docSnap.id,
            genre: genre,
            name: String(value.name || ""),
            memo: String(value.memo || ""),
            date: String(value.date || ""),
            value: typeof value.value === "number" ? value.value : 0,
            detail: value.detail || null
        });
    });

    return data;
}

function startItemsListener(uid, onData, onError) {
    const itemsRef = collection(cloudDb, "users", uid, "items");

    return onSnapshot(
        itemsRef,
        function (snap) {
            const data = {
                "映画": [],
                "アニメ": [],
                "ドラマ": [],
                "ゲーム": []
            };

            snap.forEach(function (docSnap) {
                const value = docSnap.data() || {};
                const genre = normalizeGenre(value.genre);
                data[genre].push({
                    syncId: docSnap.id,
                    genre: genre,
                    name: String(value.name || ""),
                    memo: String(value.memo || ""),
                    date: String(value.date || ""),
                    value: typeof value.value === "number" ? value.value : 0,
                    detail: value.detail || null
                });
            });

            if (typeof onData === "function") onData(data);
        },
        function (err) {
            if (typeof onError === "function") onError(err);
        }
    );
}

async function upsertItem(uid, item) {
    const cloudItem = toCloudItem(item, item && item.genre ? item.genre : "映画");
    const ref = doc(cloudDb, "users", uid, "items", cloudItem.syncId);

    await setDoc(
        ref,
        {
            syncId: cloudItem.syncId,
            genre: cloudItem.genre,
            name: cloudItem.name,
            memo: cloudItem.memo,
            date: cloudItem.date,
            value: cloudItem.value,
            detail: cloudItem.detail,
            updatedAt: serverTimestamp()
        },
        { merge: true }
    );
}

async function deleteItem(uid, syncId) {
    const ref = doc(cloudDb, "users", uid, "items", String(syncId));
    await deleteDoc(ref);
}

function dispatchAuthEvent(user) {
    window.dispatchEvent(
        new CustomEvent("firebase-auth-changed", {
            detail: {
                uid: user ? user.uid : null,
                email: user ? user.email : null
            }
        })
    );
}

window.firebaseSync = {
    getCurrentUserUid: function () {
        return auth.currentUser ? auth.currentUser.uid : null;
    },
    replaceUserData: replaceUserData,
    pullUserData: pullUserData,
    startItemsListener: startItemsListener,
    upsertItem: upsertItem,
    deleteItem: deleteItem
};

if (loginBtn) {
    loginBtn.addEventListener("click", async function () {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Popup login failed. Try redirect.", error);
            const fallbackCodes = [
                "auth/popup-blocked",
                "auth/popup-closed-by-user",
                "auth/cancelled-popup-request",
                "auth/operation-not-supported-in-this-environment"
            ];

            if (fallbackCodes.includes(error && error.code)) {
                await signInWithRedirect(auth, provider);
                return;
            }

            if (authStatus) authStatus.textContent = "ログイン失敗";
        }
    });
}

getRedirectResult(auth).catch(function (error) {
    console.error("Redirect login result error:", error);
});

if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
        await signOut(auth);
    });
}

onAuthStateChanged(auth, function (user) {
    if (user) {
        if (loginBtn) loginBtn.hidden = true;
        if (logoutBtn) logoutBtn.hidden = false;
        if (authStatus) authStatus.textContent = "ログイン中: " + (user.email || "不明");
        if (appMain) appMain.classList.remove("locked");
        dispatchAuthEvent(user);
    } else {
        if (loginBtn) loginBtn.hidden = false;
        if (logoutBtn) logoutBtn.hidden = true;
        if (authStatus) authStatus.textContent = "ログインしてください";
        if (appMain) appMain.classList.add("locked");
        dispatchAuthEvent(null);
    }
});