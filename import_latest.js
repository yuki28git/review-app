document.getElementById("importLatestBtn").addEventListener("click", async function () {
  if (typeof showBackupMessage !== "function" || typeof restoreDatabase !== "function") {
    alert("初期化エラー: main.jsが正しく読み込まれていません。");
    return;
  }
  showBackupMessage("最新バックアップを読み込み中…");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000); // 7秒でタイムアウト
    const resp = await fetch("./db_backup.json", { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error("ファイル取得失敗");
    const backup = await resp.json();

    function isValidBackupData(data) {
      if (typeof data !== "object" || data === null) return false;
      const genres = ["映画", "アニメ", "ドラマ", "ゲーム"];
      for (const genre of genres) {
        if (!Array.isArray(data[genre])) return false;
        for (const item of data[genre]) {
          if (typeof item !== "object" || item === null) return false;
          if (typeof item.name !== "string" || typeof item.id === "undefined") return false;
        }
      }
      return true;
    }

    if (!backup || !backup.data || !isValidBackupData(backup.data)) {
      showBackupMessage("保存ファイルが不正です");
      return;
    }
    restoreDatabase(backup.data);
  } catch (e) {
    console.error("Error while fetching or restoring db_backup.json:", e);
    if (e.name === "AbortError") {
      showBackupMessage("通信がタイムアウトしました。ネットワーク環境をご確認ください。");
    } else {
      showBackupMessage("db_backup.jsonの取得または復元に失敗しました");
    }
  }
});