document.getElementById("importLatestBtn").addEventListener("click", async function () {
  if (typeof showBackupMessage !== "function" || typeof restoreDatabase !== "function") {
    alert("初期化エラー: main.jsが正しく読み込まれていません。");
    return;
  }
  showBackupMessage("最新バックアップを読み込み中…");
  try {
    const resp = await fetch("./db_backup.json", { cache: "reload" });
    if (!resp.ok) throw new Error("ファイル取得失敗");
    const backup = await resp.json();

    if (!backup || !backup.data || typeof backup.data !== "object") {
      showBackupMessage("保存ファイルが不正です");
      return;
    }
    restoreDatabase(backup.data);
  } catch (e) {
    showBackupMessage("db_backup.jsonの取得または復元に失敗しました");
  }
});