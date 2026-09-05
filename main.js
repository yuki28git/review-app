let cloudUnsubscribe = null;
const BACKUP_VERSION = 1;

const GENRE_OPTIONS = {
  "映画": [
    "アクション", "アドベンチャー", "SF（サイエンスフィクション）", "ファンタジー",
    "ホラー", "サスペンス / ミステリー", "ドラマ（ヒューマンドラマ、社会派）",
    "コメディ", "ロマンス / 恋愛", "ミュージカル", "戦争", "ヒストリー / 伝記",
    "アニメ映画", "ドキュメンタリー"
  ],
  "アニメ": [
    "バトル / アクション", "冒険 / ファンタジー", "ロボット / メカ", "SF / 近未来",
    "日常 / コメディ", "恋愛 / 学園", "スポーツ", "ホラー / サスペンス", "歴史 / 戦記",
    "ミュージカル / 音楽", "異世界", "短編 / オムニバス"
  ],
  "ドラマ": [
    "国内ドラマ", "恋愛 / 青春", "医療 / 弁護士 / 刑事", "社会派 / ヒューマン",
    "時代劇 / 歴史", "コメディ / ホームドラマ", "海外ドラマ", "サスペンス / クライム",
    "SF / ファンタジー", "アクション", "コメディ / シットコム", "恋愛 / ヒューマン", "ドキュメンタリー系"
  ],
  "ゲーム": [
    "RPG（ロールプレイング）", "アクション / アクションRPG", "アドベンチャー",
    "シューティング（FPS / TPS）", "シミュレーション（経営・育成・歴史）", "スポーツ",
    "レース", "パズル", "音楽 / リズム", "ホラー", "ファイティング（格闘）", "オンライン（MMORPG、バトロワ）", "カジュアル / パーティー"
  ]
};

const DATE_LABELS = {
  "映画": "公開日",
  "アニメ": "放送日",
  "ドラマ": "放送日",
  "ゲーム": "発売日"
};

const DATE_BTN_LABELS = {
  "映画": "公開日（年）を選択",
  "アニメ": "放送日（年）を選択",
  "ドラマ": "放送日（年）を選択",
  "ゲーム": "発売日（年）を選択"
};

const VOICE_LABELS = {
  "映画": "俳優・女優",
  "ドラマ": "俳優・女優",
  "アニメ": "声優",
  "ゲーム": "声優"
};

const genres = Object.keys(GENRE_OPTIONS);

let sortConfig = { col: null, order: "asc" };
let currentGenre = "映画";
let dynamicSubGenres = [];
let dynamicCastNames = [];
let dynamicYears = [];

let filterState = {
  subGenre: [],
  year: [],
  voice: [],
  keyword: "",
  scoreMin: 0,
  scoreMax: 100
};

let cloudData = {
  "映画": [],
  "アニメ": [],
  "ドラマ": [],
  "ゲーム": []
};

let itemIndex = new Map();

function emptyCloudData() {
  return { "映画": [], "アニメ": [], "ドラマ": [], "ゲーム": [] };
}

function createSyncId() {
  if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
  return String(Date.now()) + "_" + Math.random().toString(36).slice(2, 10);
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showBackupMessage(msg) {
  const el = document.getElementById("backupMessage");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(function () { el.style.opacity = 0; }, 4000);
}

function normalizeDetail(item, genre) {
  const d = item && item.detail ? item.detail : {};
  let rating = typeof item.value === "number" ? item.value : (typeof d.rating === "number" ? d.rating : 0);
  if (rating < 0 || Number.isNaN(rating)) rating = 0;
  if (rating > 100) rating = 100;

  return {
    review: typeof d.review === "string" ? d.review : "",
    image: typeof d.image === "string" ? d.image : "",
    summary: typeof d.summary === "string" ? d.summary : "",
    genre: d.genre || genre,
    casts: Array.isArray(d.casts) ? d.casts.map(function (c) {
      return {
        actor: (c && typeof c.actor === "string") ? c.actor : "",
        character: (c && typeof c.character === "string") ? c.character : ""
      };
    }) : [],
    rating: rating,
    subGenre: (typeof d.subGenre === "string" && d.subGenre !== "") ? d.subGenre : (item.memo || ""),
    date: (typeof d.date === "string" && d.date !== "") ? d.date : (item.date || "")
  };
}

function normalizeItem(raw, fallbackGenre) {
  const genre = genres.includes(raw && raw.genre) ? raw.genre : fallbackGenre;
  const detail = normalizeDetail(raw || {}, genre);
  let value = typeof raw.value === "number" ? raw.value : detail.rating;
  if (value < 0 || Number.isNaN(value)) value = 0;
  if (value > 100) value = 100;
  return {
    syncId: (raw && raw.syncId) ? String(raw.syncId) : createSyncId(),
    genre: genre,
    name: (raw && typeof raw.name === "string") ? raw.name : "",
    memo: (raw && typeof raw.memo === "string" ? raw.memo : detail.subGenre),
    date: (raw && typeof raw.date === "string" ? raw.date : detail.date),
    value: value,
    detail: detail
  };
}

function normalizeDataObject(dataObj) {
  const out = emptyCloudData();
  for (let i = 0; i < genres.length; i++) {
    const g = genres[i];
    const arr = Array.isArray(dataObj && dataObj[g]) ? dataObj[g] : [];
    out[g] = arr.map(function (x) { return normalizeItem(x, g); });
  }
  return out;
}

function cloneItem(item) {
  return JSON.parse(JSON.stringify(item));
}

function getGenreItems(genre) {
  const arr = cloudData[genre] || [];
  return arr.map(cloneItem);
}

function rebuildIndex() {
  itemIndex = new Map();
  for (let i = 0; i < genres.length; i++) {
    const g = genres[i];
    const arr = cloudData[g] || [];
    for (let j = 0; j < arr.length; j++) {
      itemIndex.set(arr[j].syncId, arr[j]);
    }
  }
}

function applyLocalUpsert(item) {
  const g = item.genre;
  if (!cloudData[g]) cloudData[g] = [];
  const idx = cloudData[g].findIndex(function (x) { return x.syncId === item.syncId; });
  if (idx === -1) {
    cloudData[g].push(cloneItem(item));
  } else {
    cloudData[g][idx] = cloneItem(item);
  }
  rebuildIndex();
}

function applyLocalDelete(syncId) {
  for (let i = 0; i < genres.length; i++) {
    const g = genres[i];
    cloudData[g] = (cloudData[g] || []).filter(function (x) { return x.syncId !== syncId; });
  }
  rebuildIndex();
}

async function saveItemToCloud(item) {
  const uid = window.firebaseSync && window.firebaseSync.getCurrentUserUid ? window.firebaseSync.getCurrentUserUid() : null;
  if (!uid) throw new Error("not logged in");
  if (!window.firebaseSync || typeof window.firebaseSync.upsertItem !== "function") {
    throw new Error("firebaseSync.upsertItem missing");
  }
  await window.firebaseSync.upsertItem(uid, item);
}

async function deleteItemFromCloud(syncId) {
  const uid = window.firebaseSync && window.firebaseSync.getCurrentUserUid ? window.firebaseSync.getCurrentUserUid() : null;
  if (!uid) throw new Error("not logged in");
  if (!window.firebaseSync || typeof window.firebaseSync.deleteItem !== "function") {
    throw new Error("firebaseSync.deleteItem missing");
  }
  await window.firebaseSync.deleteItem(uid, syncId);
}

function updateDateLabel(genre) {
  document.getElementById("dateLabel").textContent = DATE_LABELS[genre];
  document.getElementById("yearBtn").textContent = DATE_BTN_LABELS[genre];
}

function updateDateColumnHeader(genre) {
  document.getElementById("dateColumnHeader").textContent = DATE_LABELS[genre];
}

function updateCastLabel(genre) {
  const label = VOICE_LABELS[genre];
  document.getElementById("voiceLabel").textContent = label;
  document.getElementById("voiceBtn").textContent = label + "を選択";
}

function updateDynamicSubGenres(genre) {
  const set = new Set();
  const items = getGenreItems(genre);
  items.forEach(function (item) {
    const sub = item.memo || (item.detail && item.detail.subGenre) || "";
    if (sub) set.add(sub);
  });
  dynamicSubGenres = Array.from(set);
  makeMenu("subGenreMenu", dynamicSubGenres, filterState.subGenre, "ジャンル");
}

function updateDynamicCastNames(genre) {
  const set = new Set();
  const items = getGenreItems(genre);
  items.forEach(function (item) {
    if (item.detail && Array.isArray(item.detail.casts)) {
      item.detail.casts.forEach(function (cast) {
        if (cast.actor) set.add(cast.actor);
      });
    }
  });
  dynamicCastNames = Array.from(set);
  makeMenu("voiceMenu", dynamicCastNames, filterState.voice, VOICE_LABELS[currentGenre]);
}

function updateDynamicYears(genre) {
  const set = new Set();
  const items = getGenreItems(genre);
  items.forEach(function (item) {
    const dateStr = (item.detail && item.detail.date) ? item.detail.date : (item.date || "");
    if (dateStr) {
      const y = dateStr.split("-")[0];
      if (y) set.add(y);
    }
  });
  dynamicYears = Array.from(set).sort(function (a, b) { return b.localeCompare(a); });
  makeMenu("yearMenu", dynamicYears, filterState.year, DATE_BTN_LABELS[currentGenre]);
}

function filterItems(items) {
  let filtered = items;
  const keyword = filterState.keyword.trim().toLowerCase();

  if (keyword.length > 0) {
    filtered = filtered.filter(function (item) {
      let found = false;
      if (item.name && item.name.toLowerCase().includes(keyword)) found = true;
      if (item.detail) {
        if (item.detail.summary && item.detail.summary.toLowerCase().includes(keyword)) found = true;
        if (item.detail.review && item.detail.review.toLowerCase().includes(keyword)) found = true;
        if (Array.isArray(item.detail.casts)) {
          for (let i = 0; i < item.detail.casts.length; i++) {
            const cast = item.detail.casts[i];
            if ((cast.actor && cast.actor.toLowerCase().includes(keyword)) ||
              (cast.character && cast.character.toLowerCase().includes(keyword))) {
              found = true;
              break;
            }
          }
        }
      }
      return found;
    });
  }

  if (filterState.subGenre.length > 0) {
    filtered = filtered.filter(function (item) {
      const memo = item.memo || (item.detail && item.detail.subGenre) || "";
      return filterState.subGenre.includes(memo);
    });
  }

  if (filterState.voice.length > 0) {
    filtered = filtered.filter(function (item) {
      if (item.detail && Array.isArray(item.detail.casts)) {
        for (let i = 0; i < item.detail.casts.length; i++) {
          const cast = item.detail.casts[i];
          if (cast.actor && filterState.voice.includes(cast.actor)) return true;
        }
      }
      return false;
    });
  }

  if (filterState.year.length > 0) {
    filtered = filtered.filter(function (item) {
      const dateStr = (item.detail && item.detail.date) ? item.detail.date : (item.date || "");
      if (!dateStr) return false;
      const y = dateStr.split("-")[0];
      return filterState.year.includes(y);
    });
  }

  filtered = filtered.filter(function (item) {
    let score = typeof item.value === "number" ? item.value :
      (item.detail && typeof item.detail.rating === "number" ? item.detail.rating : 0);
    if (score > 100) score = 100;
    if (score < 0 || Number.isNaN(score)) score = 0;
    return score >= filterState.scoreMin && score <= filterState.scoreMax;
  });

  return filtered;
}

function refreshGenreView(genre) {
  loadData(genre);
  updateDynamicSubGenres(genre);
  updateDynamicCastNames(genre);
  updateDynamicYears(genre);
  updateDateLabel(genre);
  updateCastLabel(genre);
  updateDateColumnHeader(genre);
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;
}

function loadData(genre) {
  currentGenre = genre;
  updateDateColumnHeader(genre);
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";

  let items = getGenreItems(genre).map(function (item) {
    return normalizeItem(item, genre);
  });

  if (sortConfig.col) {
    items = items.slice().sort(function (a, b) {
      let av;
      let bv;
      switch (sortConfig.col) {
        case "date":
          av = (a.detail && a.detail.date) ? a.detail.date : (a.date || "");
          bv = (b.detail && b.detail.date) ? b.detail.date : (b.date || "");
          break;
        case "memo":
          av = a.memo || (a.detail && a.detail.subGenre) || "";
          bv = b.memo || (b.detail && b.detail.subGenre) || "";
          break;
        default:
          av = a[sortConfig.col];
          bv = b[sortConfig.col];
          break;
      }
      if (av < bv) return sortConfig.order === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.order === "asc" ? 1 : -1;
      return 0;
    });
  }

  const toShow = filterItems(items);

  toShow.forEach(function (item) {
    const subGenre = item.memo || (item.detail && item.detail.subGenre) || "";
    const dateStr = (item.detail && item.detail.date) ? item.detail.date : "";
    let scoreValue = typeof item.value === "number" ? item.value :
      (item.detail && item.detail.rating ? item.detail.rating : 0);
    if (scoreValue > 100) scoreValue = 100;

    const tr = document.createElement("tr");
    tr.dataset.id = item.syncId;
    tr.tabIndex = 0;
    tr.classList.add("selectable-row");
    tr.innerHTML =
      "<td class=\"nameCell\"><span class=\"name-link\" style=\"color:#1976d2; text-decoration:underline; cursor:pointer;\">" + escapeHTML(item.name) + "</span></td>" +
      "<td class=\"memoCell\">" + escapeHTML(subGenre) + "</td>" +
      "<td class=\"dateCell\">" + escapeHTML(dateStr) + "</td>" +
      "<td class=\"valueCell\">" + escapeHTML(String(scoreValue)) + "</td>" +
      "<td class=\"operation\">" +
      "<button class=\"editBtn\" data-id=\"" + escapeHTML(item.syncId) + "\" type=\"button\">編集</button>" +
      "<button class=\"deleteBtn\" data-id=\"" + escapeHTML(item.syncId) + "\" type=\"button\">削除</button>" +
      "</td>";
    tbody.appendChild(tr);
  });

  document.querySelectorAll("th[data-col]").forEach(function (th) {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.col === sortConfig.col) {
      th.classList.add(sortConfig.order === "asc" ? "sort-asc" : "sort-desc");
    }
  });

  bindRowClick();
  updateDynamicSubGenres(currentGenre);
  updateDynamicCastNames(currentGenre);
  updateDynamicYears(currentGenre);
  updateDateLabel(currentGenre);
  updateCastLabel(currentGenre);
}

function makeMenu(menuId, items, selectedArr, label) {
  const menu = document.getElementById(menuId);
  menu.innerHTML = "";
  items.forEach(function (item) {
    const div = document.createElement("div");
    div.className = "menu-item";
    const checked = selectedArr.includes(item);
    div.innerHTML = "<span class=\"checkmark" + (checked ? " checked" : "") + "\"></span>" + escapeHTML(item);
    div.tabIndex = 0;
    div.setAttribute("data-value", item);
    div.onclick = function () {
      const isChecked = selectedArr.includes(item);
      if (isChecked) {
        selectedArr.splice(selectedArr.indexOf(item), 1);
      } else {
        selectedArr.push(item);
      }
      makeMenu(menuId, items, selectedArr, label);
      updateLabelBtn(menuId, selectedArr, label);
    };
    div.onkeydown = function (e) {
      if (e.key === " " || e.key === "Enter") div.onclick();
    };
    menu.appendChild(div);
  });
  updateLabelBtn(menuId, selectedArr, label);
}

function updateLabelBtn(menuId, selectedArr, label) {
  let btnId = "";
  if (menuId === "subGenreMenu") btnId = "subGenreBtn";
  else if (menuId === "yearMenu") btnId = "yearBtn";
  else if (menuId === "voiceMenu") btnId = "voiceBtn";
  const btn = document.getElementById(btnId);
  btn.textContent = selectedArr.length === 0 ? (label + "を選択") : selectedArr.join(", ");
}

function closeAllMenus() {
  document.querySelectorAll(".filter-menu").forEach(function (menu) { menu.classList.remove("open"); });
  document.querySelectorAll(".filter-label-btn").forEach(function (btn) { btn.classList.remove("active"); });
}

function setupMenuBtn(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  btn.addEventListener("click", function () {
    closeAllMenus();
    menu.classList.toggle("open");
    btn.classList.toggle("active", menu.classList.contains("open"));
  });
  document.addEventListener("mousedown", function (e) {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove("open");
      btn.classList.remove("active");
    }
  });
}

function initFilterUI(genre) {
  updateDateLabel(genre);
  updateCastLabel(genre);
  updateDateColumnHeader(genre);
  updateDynamicSubGenres(genre);
  updateDynamicCastNames(genre);
  updateDynamicYears(genre);
  filterState.year = [];
  makeMenu("yearMenu", dynamicYears, filterState.year, DATE_BTN_LABELS[genre]);
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;
}

function showDataList() {
  document.getElementById("content").classList.remove("hide-list");
}

function hideDataList() {
  document.getElementById("content").classList.add("hide-list");
}

function hideDetailPanel() {
  document.getElementById("detailPanel").classList.remove("active");
  showDataList();
  document.getElementById("detailContent").innerHTML = "";
}

function bindRowClick() {
  document.querySelectorAll("#dataTable tbody tr.selectable-row").forEach(function (tr) {
    tr.querySelector(".nameCell .name-link")?.addEventListener("click", function (e) {
      if (tr.classList.contains("editing")) return;
      const id = tr.dataset.id;
      const data = itemIndex.get(id);
      if (data) showDetailPanel(cloneItem(data), currentGenre, false);
      e.stopPropagation();
    });

    tr.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        if (tr.classList.contains("editing")) return;
        if (document.activeElement === tr.querySelector(".nameCell .name-link")) {
          const id = tr.dataset.id;
          const data = itemIndex.get(id);
          if (data) showDetailPanel(cloneItem(data), currentGenre, false);
        }
      }
    });
  });
}

async function restoreDatabase(dataObj, options) {
  const opt = options || {};
  const syncAfterRestore = opt.syncAfterRestore !== false;
  const silent = opt.silent === true;

  try {
    const normalized = normalizeDataObject(dataObj);
    cloudData = normalized;
    rebuildIndex();
    refreshGenreView(currentGenre);

    if (syncAfterRestore) {
      const uid = window.firebaseSync && window.firebaseSync.getCurrentUserUid ? window.firebaseSync.getCurrentUserUid() : null;
      if (uid && window.firebaseSync && typeof window.firebaseSync.replaceUserData === "function") {
        await window.firebaseSync.replaceUserData(uid, cloudData);
      }
    }

    if (!silent) showBackupMessage("復元が完了しました。");
    return true;
  } catch (e) {
    console.error("restoreDatabase failed:", e);
    if (!silent) showBackupMessage("復元に失敗しました");
    return false;
  }
}

window.restoreDatabase = restoreDatabase;
window.showBackupMessage = showBackupMessage;

document.getElementById("backupBtn").addEventListener("click", function () {
  const backup = {
    version: BACKUP_VERSION,
    datetime: new Date().toISOString(),
    data: normalizeDataObject(cloudData)
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "db_backup_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
  showBackupMessage("バックアップファイルをダウンロードしました");
});

document.getElementById("restoreBtn").addEventListener("click", function () {
  document.getElementById("restoreFile").click();
});

document.getElementById("restoreFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (ev) {
    try {
      const backup = JSON.parse(ev.target.result);
      if (!backup || !backup.data || typeof backup.data !== "object") {
        showBackupMessage("無効なバックアップファイルです");
        return;
      }
      await restoreDatabase(backup.data, { syncAfterRestore: true, silent: false });
    } catch (ex) {
      showBackupMessage("バックアップファイルの解析に失敗しました");
    }
  };
  reader.readAsText(file);
});

document.getElementById("addRow").addEventListener("click", function () {
  const activeGenre = document.querySelector("#header li.active").dataset.genre;
  const tbody = document.querySelector("#dataTable tbody");
  const options = GENRE_OPTIONS[activeGenre].map(function (opt) {
    return "<option value=\"" + escapeHTML(opt) + "\">" + escapeHTML(opt) + "</option>";
  }).join("");

  const tr = document.createElement("tr");
  tr.innerHTML =
    "<td><input type=\"text\" placeholder=\"名前\"></td>" +
    "<td><select><option value=\"\">選択してください</option>" + options + "</select></td>" +
    "<td><input type=\"date\" placeholder=\"" + escapeHTML(DATE_LABELS[activeGenre]) + "\"></td>" +
    "<td><input type=\"number\" placeholder=\"点数\" min=\"0\" max=\"100\"></td>" +
    "<td class=\"operation\"><button class=\"saveBtn\" data-mode=\"create\" type=\"button\">保存</button><button class=\"cancelBtn\" type=\"button\">キャンセル</button></td>";
  tbody.appendChild(tr);

  const scoreInput = tr.querySelector("input[type=\"number\"]");
  scoreInput.addEventListener("input", function () {
    let v = Number(scoreInput.value);
    if (Number.isNaN(v) || v < 0) v = 0;
    if (v > 100) v = 100;
    scoreInput.value = v;
  });

  tr.querySelector("input,select").focus();
  tr.querySelector(".saveBtn").onclick = tableSaveHandler;
  tr.querySelector(".cancelBtn").onclick = function () { loadData(activeGenre); };
});

async function tableSaveHandler(e) {
  const tr = e.target.closest("tr");
  const activeGenre = document.querySelector("#header li.active").dataset.genre;
  const inputs = tr.querySelectorAll("input,select");

  let score = Number(inputs[3].value);
  if (Number.isNaN(score) || score < 0) score = 0;
  if (score > 100) score = 100;

  const base = {
    name: inputs[0].value.trim(),
    memo: inputs[1].value,
    date: inputs[2].value,
    value: score
  };

  try {
    if (e.target.dataset.mode === "create") {
      const item = normalizeItem({
        syncId: createSyncId(),
        genre: activeGenre,
        name: base.name,
        memo: base.memo,
        date: base.date,
        value: base.value,
        detail: {
          review: "",
          image: "",
          summary: "",
          genre: activeGenre,
          casts: [],
          rating: base.value,
          subGenre: base.memo,
          date: base.date
        }
      }, activeGenre);

      applyLocalUpsert(item);
      await saveItemToCloud(item);
    } else {
      const id = e.target.dataset.id;
      const origin = itemIndex.get(id);
      if (!origin) throw new Error("item not found: " + id);

      const detailObj = normalizeDetail(origin, activeGenre);
      detailObj.subGenre = base.memo;
      detailObj.rating = base.value;
      detailObj.date = base.date;

      const updated = normalizeItem({
        syncId: origin.syncId,
        genre: activeGenre,
        name: base.name,
        memo: base.memo,
        date: base.date,
        value: base.value,
        detail: detailObj
      }, activeGenre);

      applyLocalUpsert(updated);
      await saveItemToCloud(updated);
    }

    refreshGenreView(activeGenre);
  } catch (err) {
    console.error(err);
    showBackupMessage("保存に失敗しました");
  }
}

document.querySelector("#dataTable tbody").addEventListener("click", async function (e) {
  const activeGenre = document.querySelector("#header li.active").dataset.genre;

  if (e.target.classList.contains("editBtn")) {
    const tr = e.target.closest("tr");
    const id = e.target.dataset.id;
    const origin = itemIndex.get(id);
    if (!origin) return;

    const name = origin.name || "";
    const memo = origin.memo || (origin.detail && origin.detail.subGenre) || "";
    const date = (origin.detail && origin.detail.date) ? origin.detail.date : (origin.date || "");
    const value = typeof origin.value === "number" ? origin.value : 0;

    const options = GENRE_OPTIONS[activeGenre].map(function (opt) {
      const selected = (opt === memo) ? " selected" : "";
      return "<option value=\"" + escapeHTML(opt) + "\"" + selected + ">" + escapeHTML(opt) + "</option>";
    }).join("");

    tr.innerHTML =
      "<td><input type=\"text\" value=\"" + escapeHTML(name) + "\"></td>" +
      "<td><select><option value=\"\">選択してください</option>" + options + "</select></td>" +
      "<td><input type=\"date\" value=\"" + escapeHTML(date) + "\"></td>" +
      "<td><input type=\"number\" value=\"" + escapeHTML(String(value)) + "\" min=\"0\" max=\"100\"></td>" +
      "<td class=\"operation\"><button class=\"saveBtn\" data-id=\"" + escapeHTML(id) + "\" type=\"button\">保存</button><button class=\"cancelBtn\" type=\"button\">キャンセル</button></td>";

    tr.classList.add("editing");

    const scoreInput = tr.querySelector("input[type=\"number\"]");
    scoreInput.addEventListener("input", function () {
      let v = Number(scoreInput.value);
      if (Number.isNaN(v) || v < 0) v = 0;
      if (v > 100) v = 100;
      scoreInput.value = v;
    });

    tr.querySelector("input,select").focus();
    tr.querySelector(".saveBtn").onclick = tableSaveHandler;
    tr.querySelector(".cancelBtn").onclick = function () { loadData(activeGenre); };
  }

  if (e.target.classList.contains("deleteBtn")) {
    const id = e.target.dataset.id;
    try {
      applyLocalDelete(id);
      await deleteItemFromCloud(id);
      refreshGenreView(activeGenre);
    } catch (err) {
      console.error(err);
      showBackupMessage("削除に失敗しました");
    }
  }

  if (e.target.classList.contains("name-link")) {
    const tr = e.target.closest("tr");
    const id = tr.dataset.id;
    const data = itemIndex.get(id);
    if (data) showDetailPanel(cloneItem(data), activeGenre, false);
  }
});

document.querySelector("#dataTable tbody").addEventListener("keydown", function (e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
    if (e.key === "Enter") {
      const tr = e.target.closest("tr");
      const saveBtn = tr.querySelector(".saveBtn");
      if (saveBtn) saveBtn.click();
    } else if (e.key === "Escape") {
      const tr = e.target.closest("tr");
      const cancelBtn = tr.querySelector(".cancelBtn");
      if (cancelBtn) cancelBtn.click();
    }
  }
});

document.querySelectorAll("#dataTable th[data-col]").forEach(function (th) {
  th.addEventListener("click", function () {
    if (sortConfig.col === th.dataset.col) {
      sortConfig.order = sortConfig.order === "asc" ? "desc" : "asc";
    } else {
      sortConfig.col = th.dataset.col;
      sortConfig.order = "asc";
    }
    loadData(currentGenre);
  });
});

document.querySelectorAll("#header li").forEach(function (li) {
  li.addEventListener("click", function () {
    document.querySelectorAll("#header li").forEach(function (l) { l.classList.remove("active"); });
    li.classList.add("active");
    currentGenre = li.dataset.genre;
    filterState.year = [];
    initFilterUI(currentGenre);
    loadData(currentGenre);
    hideDetailPanel();
    showDataList();
  });
});

document.getElementById("applyFilterBtn").addEventListener("click", function () {
  filterState.keyword = document.getElementById("keywordInput").value.trim();

  let min = Number(document.getElementById("scoreMinInput").value);
  let max = Number(document.getElementById("scoreMaxInput").value);
  if (Number.isNaN(min) || min < 0) min = 0;
  if (min > 100) min = 100;
  if (Number.isNaN(max) || max > 100) max = 100;
  if (max < 0) max = 0;

  filterState.scoreMin = min;
  filterState.scoreMax = max;
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;

  loadData(currentGenre);
});

document.getElementById("resetFilterBtn").addEventListener("click", function () {
  filterState = {
    subGenre: [],
    year: [],
    voice: [],
    keyword: "",
    scoreMin: 0,
    scoreMax: 100
  };
  document.getElementById("keywordInput").value = "";
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;
  initFilterUI(currentGenre);
  loadData(currentGenre);
});

document.getElementById("keywordInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    filterState.keyword = document.getElementById("keywordInput").value.trim();
    loadData(currentGenre);
  }
});

document.getElementById("scoreMinInput").addEventListener("input", function () {
  let min = Number(this.value);
  if (Number.isNaN(min) || min < 0) min = 0;
  if (min > 100) min = 100;
  this.value = min;
  filterState.scoreMin = min;
});

document.getElementById("scoreMaxInput").addEventListener("input", function () {
  let max = Number(this.value);
  if (Number.isNaN(max) || max > 100) max = 100;
  if (max < 0) max = 0;
  this.value = max;
  filterState.scoreMax = max;
});

setupMenuBtn("subGenreBtn", "subGenreMenu");
setupMenuBtn("yearBtn", "yearMenu");
setupMenuBtn("voiceBtn", "voiceMenu");

function showDetailPanel(data, genre, editMode) {
  const detailPanel = document.getElementById("detailPanel");
  const detailContent = document.getElementById("detailContent");
  detailPanel.classList.add("active");
  hideDataList();

  const normalized = normalizeItem(data, genre);
  const detail = normalized.detail;
  const dateLabel = DATE_LABELS[genre];
  const dateValue = detail.date || normalized.date || "";

  let imgHtml = "";
  if (detail.image) imgHtml = "<img src=\"" + detail.image + "\" alt=\"作品画像\">";

  const castLabel = (["映画", "ドラマ"].includes(detail.genre || genre)) ? "俳優・女優一覧" : "声優一覧";

  if (!editMode) {
    let castHtml = "<table class=\"cast-list-table\"><thead><tr><th>名前</th><th>キャラクター名</th></tr></thead><tbody>";
    (Array.isArray(detail.casts) ? detail.casts : []).forEach(function (cast) {
      castHtml += "<tr><td>" + escapeHTML(cast.actor || "") + "</td><td>" + escapeHTML(cast.character || "") + "</td></tr>";
    });
    castHtml += "</tbody></table>";

    detailContent.innerHTML =
      "<div class=\"detail-header-bar\">" +
      "<button class=\"backBtn\" id=\"backBtn\" type=\"button\">← 戻る</button>" +
      "<button class=\"editDetailBtn\" id=\"editDetailBtn\" type=\"button\">編集</button>" +
      "</div>" +
      "<h3 class=\"detail-header-title\">" + escapeHTML(normalized.name) + "</h3>" +
      "<div class=\"detail-flex\">" +
      "<div class=\"detail-image\">" + imgHtml + "</div>" +
      "<div class=\"detail-summary-container\">" +
      "<div class=\"detail-summary-label\">ジャンル</div>" +
      "<div class=\"detail-summary-value\">" + escapeHTML(detail.subGenre || normalized.memo || "") + "</div>" +
      "<div class=\"detail-summary-label\">評価</div>" +
      "<div class=\"detail-summary-value\">" + escapeHTML(String(typeof detail.rating === "number" ? detail.rating : "")) + "</div>" +
      "<div class=\"detail-summary-label\">" + escapeHTML(dateLabel) + "</div>" +
      "<div class=\"detail-summary-value\">" + escapeHTML(dateValue) + "</div>" +
      "<div class=\"detail-summary-label\">あらすじ</div>" +
      "<div class=\"detail-summary-value\">" + escapeHTML(detail.summary || "") + "</div>" +
      "</div></div>" +
      "<div class=\"meta\"><span class=\"detail-summary-label\">" + castLabel + "</span></div>" +
      castHtml +
      "<div class=\"meta\"><span class=\"detail-summary-label\">感想</span></div>" +
      "<div style=\"font-size:1.08em; margin-bottom:20px;\">" + escapeHTML(detail.review || "（未記入）") + "</div>";

    document.getElementById("editDetailBtn").onclick = function () { showDetailPanel(normalized, genre, true); };
    document.getElementById("backBtn").onclick = hideDetailPanel;
    return;
  }

  let castRows = "";
  (Array.isArray(detail.casts) ? detail.casts : []).forEach(function (cast, idx) {
    castRows +=
      "<tr>" +
      "<td><input type=\"text\" class=\"actorInput\" value=\"" + escapeHTML(cast.actor || "") + "\" placeholder=\"俳優/声優名\"></td>" +
      "<td><input type=\"text\" class=\"characterInput\" value=\"" + escapeHTML(cast.character || "") + "\" placeholder=\"キャラクター名\"></td>" +
      "<td><button type=\"button\" class=\"remove-cast-btn\" data-idx=\"" + idx + "\">削除</button></td>" +
      "</tr>";
  });

  const genreOptions = GENRE_OPTIONS[genre].map(function (opt) {
    const selected = (opt === detail.subGenre) ? " selected" : "";
    return "<option value=\"" + escapeHTML(opt) + "\"" + selected + ">" + escapeHTML(opt) + "</option>";
  }).join("");

  detailContent.innerHTML =
    "<div class=\"detail-header-bar\">" +
    "<button class=\"backBtn\" id=\"backBtn\" type=\"button\">← 戻る</button>" +
    "<button class=\"editDetailBtn\" id=\"editDetailBtn\" type=\"button\" style=\"visibility:hidden;\">編集</button>" +
    "</div>" +
    "<h3 class=\"detail-header-title\">" + escapeHTML(normalized.name) + "</h3>" +
    "<form id=\"detailEditForm\" autocomplete=\"off\">" +
    "<div class=\"filter-group\" style=\"max-width:300px;margin-bottom:14px;\">" +
    "<label class=\"detail-summary-label\">ジャンル</label>" +
    "<select id=\"subGenreEditSelect\"><option value=\"\">選択してください</option>" + genreOptions + "</select>" +
    "</div>" +
    "<div class=\"filter-group\" style=\"max-width:300px;margin-bottom:14px;\">" +
    "<label class=\"detail-summary-label\">" + escapeHTML(dateLabel) + "</label>" +
    "<input id=\"detailDate\" type=\"date\" value=\"" + escapeHTML(dateValue) + "\">" +
    "</div>" +
    "<div class=\"detail-flex\">" +
    "<div class=\"detail-image\"><label>画像アップロード（jpg/png）</label><input type=\"file\" accept=\"image/*\" id=\"detailImgInput\"><br>" + imgHtml + "</div>" +
    "<div class=\"detail-summary-container\">" +
    "<div class=\"detail-summary-label\">評価</div>" +
    "<input id=\"detailRating\" type=\"number\" min=\"0\" max=\"100\" value=\"" + escapeHTML(String(typeof detail.rating === "number" ? detail.rating : "")) + "\" style=\"width:60px; font-size:1em; padding:2px 6px; border-radius:5px; border:1px solid #b3c4e6; margin-bottom:10px;\">" +
    "<div class=\"detail-summary-label\">あらすじ</div>" +
    "<textarea id=\"detailSummary\" maxlength=\"200\" style=\"width:100%;min-height:60px;\">" + escapeHTML(detail.summary || "") + "</textarea>" +
    "</div></div>" +
    "<label class=\"detail-summary-label\" style=\"margin-top:10px;\">" + castLabel + "</label>" +
    "<table class=\"cast-list-table\" id=\"editCastTable\"><thead><tr><th>名前</th><th>キャラクター名</th><th>操作</th></tr></thead><tbody>" + castRows + "</tbody></table>" +
    "<button type=\"button\" class=\"add-cast-btn\" id=\"addCastBtn\">+追加</button>" +
    "<label class=\"detail-summary-label\" style=\"margin-top:10px;\">感想</label>" +
    "<textarea id=\"detailReview\" maxlength=\"300\">" + escapeHTML(detail.review || "") + "</textarea>" +
    "<div style=\"margin-top:18px;\"><button type=\"submit\" class=\"saveDetailBtn\">保存</button><button type=\"button\" class=\"cancelDetailBtn\">キャンセル</button></div>" +
    "</form>";

  document.getElementById("backBtn").onclick = function () {
    showDetailPanel(normalized, genre, false);
  };

  const form = document.getElementById("detailEditForm");
  const imgInput = document.getElementById("detailImgInput");
  let imageData = detail.image || "";
  let casts = Array.isArray(detail.casts) ? detail.casts.map(cloneItem) : [];

  imgInput.addEventListener("change", function () {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      imageData = ev.target.result;
      form.querySelector(".detail-image img")?.remove();
      const img = document.createElement("img");
      img.src = imageData;
      img.alt = "作品画像";
      img.style.marginBottom = "10px";
      img.style.maxWidth = "240px";
      img.style.display = "block";
      img.style.borderRadius = "8px";
      img.style.boxShadow = "0 2px 8px rgba(60,60,60,0.15)";
      imgInput.insertAdjacentElement("afterend", img);
    };
    reader.readAsDataURL(file);
  });

  form.querySelector("#addCastBtn").addEventListener("click", function () {
    casts.push({ actor: "", character: "" });
    renderCastRows();
  });

  function renderCastRows() {
    const tbody = document.querySelector("#editCastTable tbody");
    tbody.innerHTML = "";
    casts.forEach(function (cast, idx) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td><input type=\"text\" class=\"actorInput\" value=\"" + escapeHTML(cast.actor || "") + "\" placeholder=\"俳優/声優名\"></td>" +
        "<td><input type=\"text\" class=\"characterInput\" value=\"" + escapeHTML(cast.character || "") + "\" placeholder=\"キャラクター名\"></td>" +
        "<td><button type=\"button\" class=\"remove-cast-btn\" data-idx=\"" + idx + "\">削除</button></td>";
      tbody.appendChild(tr);

      tr.querySelector(".remove-cast-btn").addEventListener("click", function () {
        casts.splice(idx, 1);
        renderCastRows();
      });

      tr.querySelector(".actorInput").addEventListener("input", function () {
        casts[idx].actor = this.value;
      });

      tr.querySelector(".characterInput").addEventListener("input", function () {
        casts[idx].character = this.value;
      });
    });
  }

  renderCastRows();

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    try {
      const summary = document.getElementById("detailSummary").value.trim();
      const review = document.getElementById("detailReview").value.trim();
      const subGenre = document.getElementById("subGenreEditSelect").value;
      const ratingInput = document.getElementById("detailRating");
      let ratingVal = ratingInput ? Number(ratingInput.value) : 0;
      if (Number.isNaN(ratingVal) || ratingVal < 0) ratingVal = 0;
      if (ratingVal > 100) ratingVal = 100;
      const date = document.getElementById("detailDate").value;

      const rows = document.querySelectorAll("#editCastTable tbody tr");
      const newCasts = [];
      rows.forEach(function (row) {
        const actor = row.querySelector(".actorInput").value.trim();
        const character = row.querySelector(".characterInput").value.trim();
        if (actor || character) newCasts.push({ actor: actor, character: character });
      });

      const latest = itemIndex.get(normalized.syncId) || normalized;
      const updated = normalizeItem({
        syncId: latest.syncId,
        genre: genre,
        name: latest.name,
        memo: subGenre,
        date: date,
        value: ratingVal,
        detail: {
          summary: summary,
          review: review,
          image: imageData,
          genre: genre,
          casts: newCasts,
          rating: ratingVal,
          subGenre: subGenre,
          date: date
        }
      }, genre);

      applyLocalUpsert(updated);
      await saveItemToCloud(updated);

      showDetailPanel(cloneItem(updated), genre, false);
      loadData(genre);
    } catch (err) {
      console.error(err);
      showBackupMessage("詳細の保存に失敗しました");
    }
  });

  form.querySelector(".cancelDetailBtn").addEventListener("click", function () {
    showDetailPanel(normalized, genre, false);
  });
}

hideDetailPanel();
initFilterUI(currentGenre);
loadData(currentGenre);

window.addEventListener("firebase-auth-changed", function (ev) {
  const uid = ev && ev.detail ? ev.detail.uid : null;

  if (!uid) {
    if (typeof cloudUnsubscribe === "function") {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }
    cloudData = emptyCloudData();
    rebuildIndex();
    loadData(currentGenre);
    return;
  }

  if (typeof cloudUnsubscribe === "function") {
    cloudUnsubscribe();
    cloudUnsubscribe = null;
  }

  if (!window.firebaseSync || typeof window.firebaseSync.startItemsListener !== "function") {
    showBackupMessage("firebaseSync.startItemsListener が見つかりません");
    return;
  }

  cloudUnsubscribe = window.firebaseSync.startItemsListener(
    uid,
    function (remoteData) {
      cloudData = normalizeDataObject(remoteData);
      rebuildIndex();
      refreshGenreView(currentGenre);
    },
    function (err) {
      console.error("Realtime cloud listener error:", err);
      showBackupMessage("クラウド購読に失敗しました");
    }
  );
});