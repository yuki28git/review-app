
const BACKUP_VERSION = 1;
document.getElementById("backupBtn").addEventListener("click", async function () {
  if (!db) return;
  const genres = Object.keys(GENRE_OPTIONS);
  const backup = { version: BACKUP_VERSION, datetime: new Date().toISOString(), data: {} };
  let pending = genres.length;
  for (const genre of genres) {
    const tx = db.transaction(genre, "readonly");
    const store = tx.objectStore(genre);
    const req = store.getAll();
    req.onsuccess = function (e) {
      backup.data[genre] = e.target.result;
      pending--;
      if (pending === 0) {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `db_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
        showBackupMessage("バックアップファイルをダウンロードしました");
      }
    };
    req.onerror = function () {
      showBackupMessage("バックアップ失敗: " + genre + "の取得エラー");
    };
  }
});

document.getElementById("restoreBtn").addEventListener("click", function () {
  document.getElementById("restoreFile").click();
});
document.getElementById("restoreFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      const backup = JSON.parse(ev.target.result);
      if (!backup || !backup.data || typeof backup.data !== "object") {
        showBackupMessage("無効なバックアップファイルです");
        return;
      }
      restoreDatabase(backup.data);
    } catch (ex) {
      showBackupMessage("バックアップファイルの解析に失敗しました");
    }
  };
  reader.readAsText(file);
});
function restoreDatabase(dataObj) {
  if (!db) {
    showBackupMessage("DBがまだ初期化されていません。ページを再読み込みしてください。");
    return;
  }
  const genres = Object.keys(GENRE_OPTIONS);
  let total = genres.length, finished = 0, error = false;
  for (const genre of genres) {
    const tx = db.transaction(genre, "readwrite");
    const store = tx.objectStore(genre);
    const clearReq = store.clear();
    clearReq.onsuccess = function () {
      const arr = Array.isArray(dataObj[genre]) ? dataObj[genre] : [];
      let pending = arr.length;
      if (pending === 0) checkDone();
      arr.forEach(item => {
        if ("id" in item) delete item.id;
        store.add(item).onsuccess = function () {
          pending--;
          if (pending === 0) checkDone();
        };
      });
    };
    clearReq.onerror = function () {
      if (!error) {
        error = true;
        showBackupMessage("復元中にエラーが発生しました: " + genre);
      }
    };
  }
  function checkDone() {
    finished++;
    if (finished === total && !error) {
      showBackupMessage("復元が完了しました。リストを再表示します。");
      loadData(currentGenre);
      updateDynamicSubGenres(currentGenre);
      updateDynamicCastNames(currentGenre);
      updateDynamicYears(currentGenre);
      updateDateLabel(currentGenre);
      updateCastLabel(currentGenre);
      updateDateColumnHeader(currentGenre);
    }
  }
}
function showBackupMessage(msg) {
  const el = document.getElementById("backupMessage");
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, 4000);
}
function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
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

let db;
let sortConfig = { col: null, order: "asc" };

// フィルター選択状態
let filterState = {
  subGenre: [],
  year: [],
  voice: [],
  keyword: "",
  scoreMin: 0,
  scoreMax: 100
};

let currentGenre = "映画";
let dynamicSubGenres = [];
let dynamicCastNames = [];
let dynamicYears = [];

// --- IndexedDB初期化 ---
const request = indexedDB.open("GenreDatabase", 10);
request.onupgradeneeded = function (e) {
  db = e.target.result;
  genres.forEach(genre => {
    if (!db.objectStoreNames.contains(genre)) {
      db.createObjectStore(genre, { keyPath: "id", autoIncrement: true });
    }
  });
};
request.onsuccess = function (e) {
  db = e.target.result;
  loadData(currentGenre);
  initFilterUI(currentGenre);
  updateDynamicSubGenres(currentGenre);
  updateDynamicCastNames(currentGenre);
  updateDynamicYears(currentGenre);
  updateDateLabel(currentGenre);
  updateCastLabel(currentGenre);
  updateDateColumnHeader(currentGenre);
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;
};
request.onerror = function (e) {
  console.error("IndexedDB open error:", e);
};

// --- ラベル・選択肢の更新 ---
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
  dynamicSubGenres = [];
  const tx = db.transaction(genre, "readonly");
  const store = tx.objectStore(genre);
  const set = new Set();
  store.openCursor().onsuccess = function (e) {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.memo && item.memo !== "") set.add(item.memo);
      if (item.detail && item.detail.subGenre && item.detail.subGenre !== "") set.add(item.detail.subGenre);
      cursor.continue();
    } else {
      dynamicSubGenres = Array.from(set);
      makeMenu("subGenreMenu", dynamicSubGenres, filterState.subGenre, "ジャンル");
    }
  };
}
function updateDynamicCastNames(genre) {
  dynamicCastNames = [];
  const tx = db.transaction(genre, "readonly");
  const store = tx.objectStore(genre);
  const set = new Set();
  store.openCursor().onsuccess = function (e) {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.detail && Array.isArray(item.detail.casts)) {
        item.detail.casts.forEach(cast => {
          if (cast.actor && cast.actor !== "") set.add(cast.actor);
        });
      }
      cursor.continue();
    } else {
      dynamicCastNames = Array.from(set);
      makeMenu("voiceMenu", dynamicCastNames, filterState.voice, VOICE_LABELS[currentGenre]);
    }
  };
}
function updateDynamicYears(genre) {
  dynamicYears = [];
  const tx = db.transaction(genre, "readonly");
  const store = tx.objectStore(genre);
  const set = new Set();
  store.openCursor().onsuccess = function (e) {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      let dateStr = "";
      if (item.detail && item.detail.date) {
        dateStr = item.detail.date;
      } else if (item.date) {
        dateStr = item.date;
      }
      if (dateStr) {
        const y = dateStr.split("-")[0];
        if (y) set.add(y);
      }
      cursor.continue();
    } else {
      dynamicYears = Array.from(set).sort((a, b) => b.localeCompare(a));
      makeMenu("yearMenu", dynamicYears, filterState.year, DATE_BTN_LABELS[currentGenre]);
    }
  };
}

// --- フィルタリング ---
function filterItems(items) {
  let filtered = items;
  const keyword = filterState.keyword.trim().toLowerCase();
  if (keyword.length > 0) {
    filtered = filtered.filter(item => {
      let found = false;
      if (item.name && item.name.toLowerCase().includes(keyword)) found = true;
      if (item.detail) {
        if (item.detail.summary && item.detail.summary.toLowerCase().includes(keyword)) found = true;
        if (item.detail.review && item.detail.review.toLowerCase().includes(keyword)) found = true;
        if (Array.isArray(item.detail.casts)) {
          for (const cast of item.detail.casts) {
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
    filtered = filtered.filter(item => {
      const memo = item.memo || (item.detail && item.detail.subGenre) || "";
      return filterState.subGenre.includes(memo);
    });
  }
  if (filterState.voice.length > 0) {
    filtered = filtered.filter(item => {
      if (item.detail && Array.isArray(item.detail.casts)) {
        for (const cast of item.detail.casts) {
          if (cast.actor && filterState.voice.includes(cast.actor)) {
            return true;
          }
        }
      }
      return false;
    });
  }
  if (filterState.year.length > 0) {
    filtered = filtered.filter(item => {
      let dateStr = "";
      if (item.detail && item.detail.date) {
        dateStr = item.detail.date;
      } else if (item.date) {
        dateStr = item.date;
      }
      if (dateStr) {
        const y = dateStr.split("-")[0];
        return filterState.year.includes(y);
      }
      return false;
    });
  }
  // 点数フィルター
  filtered = filtered.filter(item => {
    let score = typeof item.value === 'number' ? item.value :
      (item.detail && typeof item.detail.rating === 'number' ? item.detail.rating : 0);
    // 最大値は必ず100以下
    if (score > 100) score = 100;
    return score >= filterState.scoreMin && score <= filterState.scoreMax;
  });
  return filtered;
}

// --- データ表示 ---
function loadData(genre) {
  currentGenre = genre;
  updateDateColumnHeader(genre);
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  const tx = db.transaction(genre, "readonly");
  const store = tx.objectStore(genre);
  const items = [];
  store.openCursor().onsuccess = function (e) {
    const cursor = e.target.result;
    if (cursor) {
      if (!cursor.value.detail) {
        cursor.value.detail = {
          review: "",
          image: "",
          summary: "",
          genre: genre,
          casts: [],
          rating: cursor.value.value || 0,
          subGenre: cursor.value.memo || "",
          date: cursor.value.date || ""
        };
      }
      // 点数最大値を100に強制
      if (typeof cursor.value.value === "number" && cursor.value.value > 100) {
        cursor.value.value = 100;
        if (cursor.value.detail) cursor.value.detail.rating = 100;
      }
      items.push(cursor.value);
      cursor.continue();
    } else {
      let toShow = items;
      if (sortConfig.col) {
        toShow = [...toShow].sort((a, b) => {
          let av, bv;
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
      toShow = filterItems(toShow);
      toShow.forEach(({ id, name, memo, value, detail }) => {
        const subGenre = memo || (detail && detail.subGenre) || "";
        const dateStr = (detail && detail.date) ? detail.date : "";
        // 点数最大値を100に強制
        let scoreValue = typeof value === "number" ? value : (detail && detail.rating ? detail.rating : 0);
        if (scoreValue > 100) scoreValue = 100;
        const dateCell = escapeHTML(dateStr);
        const genreCell = escapeHTML(subGenre);
        const valueCell = escapeHTML(String(scoreValue));
        const tr = document.createElement("tr");
        tr.dataset.id = id;
        tr.tabIndex = 0;
        tr.innerHTML = `
              <td class="nameCell"><span class="name-link" style="color:#1976d2; text-decoration:underline; cursor:pointer;">${escapeHTML(name)}</span></td>
              <td class="memoCell">${genreCell}</td>
              <td class="dateCell">${dateCell}</td>
              <td class="valueCell">${valueCell}</td>
              <td class="operation">
                <button class="editBtn" data-id="${id}" type="button">編集</button>
                <button class="deleteBtn" data-id="${id}" type="button">削除</button>
              </td>
            `;
        tr.classList.add("selectable-row");
        tbody.appendChild(tr);
      });
      document.querySelectorAll("th[data-col]").forEach(th => {
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
  };
}

// --- 追加・編集・削除 ---
document.getElementById("addRow").addEventListener("click", () => {
  const activeGenre = document.querySelector("#headder li.active").dataset.genre;
  const tbody = document.querySelector("#dataTable tbody");
  // ここをGENRE_OPTIONSから取る！
  const options = GENRE_OPTIONS[activeGenre].map(opt => `<option value="${escapeHTML(opt)}">${escapeHTML(opt)}</option>`).join("");
  const tr = document.createElement("tr");
  tr.innerHTML = `
        <td><input type="text" placeholder="名前"></td>
        <td>
          <select>
            <option value="">選択してください</option>
            ${options}
          </select>
        </td>
        <td>
          <input type="date" placeholder="${DATE_LABELS[activeGenre]}">
        </td>
        <td><input type="number" placeholder="点数" min="0" max="100"></td>
        <td class="operation">
          <button class="saveBtn" data-mode="create" type="button">保存</button>
          <button class="cancelBtn" type="button">キャンセル</button>
        </td>
      `;
  tbody.appendChild(tr);

  // 点数入力の最大値制限
  const scoreInput = tr.querySelector('input[type="number"]');
  scoreInput.addEventListener("input", function () {
    let v = Number(scoreInput.value);
    if (isNaN(v) || v < 0) v = 0;
    if (v > 100) v = 100;
    scoreInput.value = v;
  });

  tr.querySelector("input,select").focus();
  tr.querySelector(".saveBtn").onclick = tableSaveHandler;
  tr.querySelector(".cancelBtn").onclick = () => loadData(activeGenre);
});

function tableSaveHandler(e) {
  const tr = e.target.closest("tr");
  const activeGenre = document.querySelector("#headder li.active").dataset.genre;
  const inputs = tr.querySelectorAll("input,select");
  let score = Number(inputs[3].value);
  if (isNaN(score) || score < 0) score = 0;
  if (score > 100) score = 100;
  const data = {
    name: inputs[0].value.trim(),
    memo: inputs[1].value,
    date: inputs[2].value,
    value: score
  };
  const tx = db.transaction(activeGenre, "readwrite");
  const store = tx.objectStore(activeGenre);
  if (e.target.dataset.mode === "create") {
    data.detail = {
      review: "",
      image: "",
      summary: "",
      genre: activeGenre,
      casts: [],
      rating: data.value,
      subGenre: data.memo,
      date: data.date
    };
    data.genre = activeGenre;
    store.add(data);
  } else {
    const id = Number(e.target.dataset.id);
    data.id = id;
    store.get(id).onsuccess = function (ev) {
      let detailObj = (ev.target.result && ev.target.result.detail) ? ev.target.result.detail : {
        review: "",
        image: "",
        summary: "",
        genre: activeGenre,
        casts: [],
        rating: 0,
        date: ""
      };
      detailObj.subGenre = data.memo;
      detailObj.rating = data.value;
      detailObj.date = data.date;
      data.detail = detailObj;
      data.genre = activeGenre;
      store.put(data);
    };
  }
  tx.oncomplete = () => {
    loadData(activeGenre);
    updateDynamicSubGenres(activeGenre);
    updateDynamicCastNames(activeGenre);
    updateDynamicYears(activeGenre);
    updateDateLabel(activeGenre);
    updateCastLabel(activeGenre);
    updateDateColumnHeader(activeGenre);
  };
}

document.querySelector("#dataTable tbody").addEventListener("click", function (e) {
  const activeGenre = document.querySelector("#headder li.active").dataset.genre;
  if (e.target.classList.contains("editBtn")) {
    const tr = e.target.closest("tr");
    const id = Number(e.target.dataset.id);
    const name = tr.querySelector(".nameCell").textContent;
    const memo = tr.querySelector(".memoCell").textContent;
    const date = tr.querySelector(".dateCell").textContent;
    const value = tr.querySelector(".valueCell").textContent;
    // ここをGENRE_OPTIONSから取る！
    const options = GENRE_OPTIONS[activeGenre].map(opt =>
      `<option value="${escapeHTML(opt)}"${opt === memo ? ' selected' : ''}>${escapeHTML(opt)}</option>`
    ).join("");
    tr.innerHTML = `
          <td><input type="text" value="${escapeHTML(name)}"></td>
          <td>
            <select>
              <option value="">選択してください</option>
              ${options}
            </select>
          </td>
          <td>
            <input type="date" value="${escapeHTML(date)}">
          </td>
          <td><input type="number" value="${escapeHTML(value)}" min="0" max="100"></td>
          <td class="operation">
            <button class="saveBtn" data-id="${id}" type="button">保存</button>
            <button class="cancelBtn" type="button">キャンセル</button>
          </td>
        `;
    tr.classList.add("editing");

    // 点数入力の最大値制限
    const scoreInput = tr.querySelector('input[type="number"]');
    scoreInput.addEventListener("input", function () {
      let v = Number(scoreInput.value);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 100) v = 100;
      scoreInput.value = v;
    });

    tr.querySelector("input,select").focus();
    tr.querySelector(".saveBtn").onclick = tableSaveHandler;
    tr.querySelector(".cancelBtn").onclick = () => loadData(activeGenre);
  }
  if (e.target.classList.contains("deleteBtn")) {
    const id = Number(e.target.dataset.id);
    const tx = db.transaction(activeGenre, "readwrite");
    tx.objectStore(activeGenre).delete(id);
    tx.oncomplete = () => {
      loadData(activeGenre);
      updateDynamicSubGenres(activeGenre);
      updateDynamicCastNames(activeGenre);
      updateDynamicYears(activeGenre);
      updateDateLabel(activeGenre);
      updateCastLabel(activeGenre);
      updateDateColumnHeader(activeGenre);
    };
  }
  // 作品名クリック: 詳細パネルへ
  if (e.target.classList.contains("name-link")) {
    const tr = e.target.closest("tr");
    const id = Number(tr.dataset.id);
    const tx = db.transaction(activeGenre, "readonly");
    tx.objectStore(activeGenre).get(id).onsuccess = function (ev) {
      const data = ev.target.result;
      showDetailPanel(data, activeGenre, false);
    };
  }
});

document.querySelector("#dataTable tbody").addEventListener("keydown", (e) => {
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

document.querySelectorAll("#dataTable th[data-col]").forEach(th => {
  th.addEventListener("click", () => {
    if (sortConfig.col === th.dataset.col) {
      sortConfig.order = sortConfig.order === "asc" ? "desc" : "asc";
    } else {
      sortConfig.col = th.dataset.col;
      sortConfig.order = "asc";
    }
    const activeGenre = document.querySelector("#headder li.active").dataset.genre;
    loadData(activeGenre);
  });
});
document.querySelectorAll("#headder li").forEach(li => {
  li.addEventListener("click", () => {
    document.querySelectorAll("#headder li").forEach(l => l.classList.remove("active"));
    li.classList.add("active");
    currentGenre = li.dataset.genre;
    filterState.year = [];
    loadData(currentGenre);
    initFilterUI(currentGenre);
    updateDynamicSubGenres(currentGenre);
    updateDynamicCastNames(currentGenre);
    updateDynamicYears(currentGenre);
    updateDateLabel(currentGenre);
    updateCastLabel(currentGenre);
    updateDateColumnHeader(currentGenre);
    document.getElementById("scoreMinInput").value = filterState.scoreMin;
    document.getElementById("scoreMaxInput").value = filterState.scoreMax;
    hideDetailPanel();
    showDataList();
  });
});

function initFilterUI(genre) {
  updateDateLabel(genre);
  updateDynamicSubGenres(genre);
  updateDynamicCastNames(genre);
  updateDynamicYears(genre);
  updateCastLabel(genre);
  updateDateColumnHeader(genre);
  filterState.year = [];
  makeMenu("yearMenu", dynamicYears, filterState.year, DATE_BTN_LABELS[genre]);
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;
}

function makeMenu(menuId, items, selectedArr, label) {
  const menu = document.getElementById(menuId);
  menu.innerHTML = "";
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "menu-item";
    const checked = selectedArr.includes(item);
    div.innerHTML = `<span class="checkmark${checked ? " checked" : ""}"></span>${escapeHTML(item)}`;
    div.tabIndex = 0;
    div.setAttribute("data-value", item);
    div.onclick = function (e) {
      if (checked) {
        selectedArr.splice(selectedArr.indexOf(item), 1);
      } else {
        selectedArr.push(item);
      }
      makeMenu(menuId, items, selectedArr, label);
      updateLabelBtn(menuId, selectedArr, label);
    };
    div.onkeydown = function (e) {
      if (e.key === " " || e.key === "Enter") {
        div.onclick();
      }
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
  if (selectedArr.length === 0) {
    btn.textContent = label + "を選択";
  } else {
    btn.textContent = selectedArr.join(", ");
  }
}

function setupMenuBtn(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  btn.addEventListener("click", function (e) {
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
setupMenuBtn("subGenreBtn", "subGenreMenu");
setupMenuBtn("yearBtn", "yearMenu");
setupMenuBtn("voiceBtn", "voiceMenu");

function closeAllMenus() {
  document.querySelectorAll('.filter-menu').forEach(menu => menu.classList.remove("open"));
  document.querySelectorAll('.filter-label-btn').forEach(btn => btn.classList.remove("active"));
}

document.getElementById("applyFilterBtn").addEventListener("click", () => {
  filterState.keyword = document.getElementById("keywordInput").value.trim();

  let min = Number(document.getElementById("scoreMinInput").value);
  let max = Number(document.getElementById("scoreMaxInput").value);
  if (isNaN(min) || min < 0) min = 0;
  if (min > 100) min = 100;
  if (isNaN(max) || max > 100) max = 100;
  if (max < 0) max = 0;
  filterState.scoreMin = min;
  filterState.scoreMax = max;
  document.getElementById("scoreMinInput").value = filterState.scoreMin;
  document.getElementById("scoreMaxInput").value = filterState.scoreMax;

  loadData(currentGenre);
});
document.getElementById("resetFilterBtn").addEventListener("click", () => {
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
  if (isNaN(min) || min < 0) min = 0;
  if (min > 100) min = 100;
  this.value = min;
  filterState.scoreMin = min;
});
document.getElementById("scoreMaxInput").addEventListener("input", function () {
  let max = Number(this.value);
  if (isNaN(max) || max > 100) max = 100;
  if (max < 0) max = 0;
  this.value = max;
  filterState.scoreMax = max;
});

// --- 表・詳細パネル ---
function bindRowClick() {
  document.querySelectorAll("#dataTable tbody tr.selectable-row").forEach(tr => {
    // 作品名クリック（span.name-link）
    tr.querySelector('.nameCell .name-link')?.addEventListener("click", function (e) {
      if (tr.classList.contains("editing")) return;
      const activeGenre = document.querySelector("#headder li.active").dataset.genre;
      const id = Number(tr.dataset.id);
      const tx = db.transaction(activeGenre, "readonly");
      tx.objectStore(activeGenre).get(id).onsuccess = function (ev) {
        const data = ev.target.result;
        showDetailPanel(data, activeGenre, false);
      };
      e.stopPropagation();
    });
    tr.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        if (tr.classList.contains("editing")) return;
        if (document.activeElement === tr.querySelector('.nameCell .name-link')) {
          const activeGenre = document.querySelector("#headder li.active").dataset.genre;
          const id = Number(tr.dataset.id);
          const tx = db.transaction(activeGenre, "readonly");
          tx.objectStore(activeGenre).get(id).onsuccess = function (ev) {
            const data = ev.target.result;
            showDetailPanel(data, activeGenre, false);
          };
        }
      }
    });
  });
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

// --- showDetailPanel()（前回回答のまま） ---
// ...（ここは省略せず前回のコードをそのまま流用してください）
// hideDetailPanel();

// showDetailPanelの実装（省略なし・変更なし）
function showDetailPanel(data, genre, editMode) {
  const detailPanel = document.getElementById("detailPanel");
  const detailContent = document.getElementById("detailContent");
  detailPanel.classList.add("active");
  hideDataList();
  const detail = data.detail || {
    review: "",
    image: "",
    summary: "",
    genre: genre,
    casts: [],
    rating: data.value || 0,
    subGenre: data.memo || "",
    date: data.date || ""
  };
  const dateLabel = DATE_LABELS[genre];
  const dateValue = detail.date || data.date || "";
  let imgHtml = "";
  if (detail.image) {
    imgHtml = `<img src="${detail.image}" alt="作品画像">`;
  }
  let castLabel = (["映画", "ドラマ"].includes(detail.genre || genre)) ? "俳優・女優一覧" : "声優一覧";
  if (!editMode) {
    let castHtml = `<table class="cast-list-table"><thead><tr><th>名前</th><th>キャラクター名</th></tr></thead><tbody>`;
    (detail.casts && Array.isArray(detail.casts) ? detail.casts : []).forEach(cast => {
      castHtml += `<tr><td>${escapeHTML(cast.actor || "")}</td><td>${escapeHTML(cast.character || "")}</td></tr>`;
    });
    castHtml += `</tbody></table>`;
    detailContent.innerHTML = `
          <div class="detail-header-bar">
            <button class="backBtn" id="backBtn" type="button">← 戻る</button>
            <button class="editDetailBtn" id="editDetailBtn" type="button">編集</button>
          </div>
          <h3 class="detail-header-title">${escapeHTML(data.name)}</h3>
          <div class="detail-flex">
            <div class="detail-image">
              ${imgHtml}
            </div>
            <div class="detail-summary-container">
              <div class="detail-summary-label">ジャンル</div>
              <div class="detail-summary-value">${escapeHTML(detail.subGenre || data.memo || "")}</div>
              <div class="detail-summary-label">評価</div>
              <div class="detail-summary-value">${typeof detail.rating === "number" ? detail.rating : ""}</div>
              <div class="detail-summary-label">${escapeHTML(dateLabel)}</div>
              <div class="detail-summary-value">${escapeHTML(dateValue)}</div>
              <div class="detail-summary-label">あらすじ</div>
              <div class="detail-summary-value">${escapeHTML(detail.summary || "")}</div>
            </div>
          </div>
          <div class="meta"><span class="detail-summary-label">${castLabel}</span></div>
          ${castHtml}
          <div class="meta"><span class="detail-summary-label">感想</span></div>
          <div style="font-size:1.08em; margin-bottom: 20px;">${escapeHTML(detail.review || "（未記入）")}</div>
        `;
    document.getElementById("editDetailBtn").onclick = function () {
      showDetailPanel(data, genre, true);
    };
    document.getElementById("backBtn").onclick = hideDetailPanel;
    return;
  }
  let castRows = "";
  (detail.casts && Array.isArray(detail.casts) ? detail.casts : []).forEach((cast, idx) => {
    castRows += `
          <tr>
            <td><input type="text" class="actorInput" value="${escapeHTML(cast.actor || "")}" placeholder="俳優/声優名"></td>
            <td><input type="text" class="characterInput" value="${escapeHTML(cast.character || "")}" placeholder="キャラクター名"></td>
            <td><button type="button" class="remove-cast-btn" data-idx="${idx}">削除</button></td>
          </tr>
        `;
  });
  const genreOptions = GENRE_OPTIONS[genre].map(opt =>
    `<option value="${escapeHTML(opt)}"${opt === detail.subGenre ? ' selected' : ''}>${escapeHTML(opt)}</option>`
  ).join("");
  detailContent.innerHTML = `
        <div class="detail-header-bar">
          <button class="backBtn" id="backBtn" type="button">← 戻る</button>
          <button class="editDetailBtn" id="editDetailBtn" type="button" style="visibility:hidden;">編集</button>
        </div>
        <h3 class="detail-header-title">${escapeHTML(data.name)}</h3>
        <form id="detailEditForm" autocomplete="off">
          <div class="filter-group" style="max-width:300px;margin-bottom:14px;">
            <label class="detail-summary-label">ジャンル</label>
            <select id="subGenreEditSelect">
              <option value="">選択してください</option>
              ${genreOptions}
            </select>
          </div>
          <div class="filter-group" style="max-width:300px;margin-bottom:14px;">
            <label class="detail-summary-label">${escapeHTML(dateLabel)}</label>
            <input id="detailDate" type="date" value="${escapeHTML(dateValue)}">
          </div>
          <div class="detail-flex">
            <div class="detail-image">
              <label>画像アップロード（jpg/png）</label>
              <input type="file" accept="image/*" id="detailImgInput"><br>
              ${imgHtml}
            </div>
            <div class="detail-summary-container">
              <div class="detail-summary-label">評価</div>
              <input id="detailRating" type="number" min="0" max="100" value="${typeof detail.rating === "number" ? detail.rating : ""}" style="width:60px; font-size:1em; padding: 2px 6px; border-radius:5px; border:1px solid #b3c4e6; margin-bottom: 10px;">
              <div class="detail-summary-label">あらすじ</div>
              <textarea id="detailSummary" maxlength="200" style="width:100%;min-height:60px;">${detail.summary || ""}</textarea>
            </div>
          </div>
          <label class="detail-summary-label" style="margin-top:10px;">${castLabel}</label>
          <table class="cast-list-table" id="editCastTable">
            <thead>
              <tr>
                <th>名前</th><th>キャラクター名</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${castRows}
            </tbody>
          </table>
          <button type="button" class="add-cast-btn" id="addCastBtn">+追加</button>
          <label class="detail-summary-label" style="margin-top:10px;">感想</label>
          <textarea id="detailReview" maxlength="300">${detail.review || ""}</textarea>
          <div style="margin-top:18px;">
            <button type="submit" class="saveDetailBtn">保存</button>
            <button type="button" class="cancelDetailBtn">キャンセル</button>
          </div>
        </form>
      `;
  document.getElementById("backBtn").onclick = function () {
    showDetailPanel(data, genre, false);
  };
  const form = document.getElementById("detailEditForm");
  const imgInput = document.getElementById("detailImgInput");
  let imageData = detail.image || "";
  let rating = typeof detail.rating === "number" ? detail.rating : 0;
  let casts = (detail.casts && Array.isArray(detail.casts)) ? detail.casts.map(c => ({ ...c })) : [];
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
    casts.forEach((cast, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
            <td><input type="text" class="actorInput" value="${escapeHTML(cast.actor || "")}" placeholder="俳優/声優名"></td>
            <td><input type="text" class="characterInput" value="${escapeHTML(cast.character || "")}" placeholder="キャラクター名"></td>
            <td><button type="button" class="remove-cast-btn" data-idx="${idx}">削除</button></td>
          `;
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
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const summary = document.getElementById("detailSummary").value.trim();
    const review = document.getElementById("detailReview").value.trim();
    const subGenre = document.getElementById("subGenreEditSelect").value;
    const ratingInput = document.getElementById("detailRating");
    const ratingVal = ratingInput ? Number(ratingInput.value) : 0;
    const date = document.getElementById("detailDate").value;
    const inputs = document.querySelectorAll("#editCastTable tbody tr");
    casts = [];
    inputs.forEach(tr => {
      const actor = tr.querySelector(".actorInput").value.trim();
      const character = tr.querySelector(".characterInput").value.trim();
      if (actor || character) casts.push({ actor, character });
    });
    const tx = db.transaction(genre, "readwrite");
    const store = tx.objectStore(genre);
    store.get(data.id).onsuccess = function (ev2) {
      const origin = ev2.target.result;
      origin.detail = {
        summary,
        review,
        image: imageData,
        genre,
        casts,
        rating: ratingVal,
        subGenre,
        date
      };
      origin.value = ratingVal;
      origin.memo = subGenre;
      origin.date = date;
      store.put(origin);
      tx.oncomplete = () => {
        const tx2 = db.transaction(genre, "readonly");
        tx2.objectStore(genre).get(data.id).onsuccess = function (ev3) {
          showDetailPanel(ev3.target.result, genre, false);
          loadData(genre);
        };
      };
    };
  });
  form.querySelector(".cancelDetailBtn").addEventListener("click", () => {
    showDetailPanel(data, genre, false);
  });
}
hideDetailPanel();