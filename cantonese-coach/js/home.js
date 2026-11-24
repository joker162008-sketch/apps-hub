/* Home page: progress summary plus export / import / reset of local progress. */
(function () {
  var CC = window.CC;
  var bank = window.CC_SENTENCES;
  CC.ui.settingsPanel(document.getElementById("voice"));
  CC.progress.dailySet(bank);
  CC.ui.renderStats(document.getElementById("stats"), bank);
  document.getElementById("bank-size").textContent = String(bank.length);
  document.getElementById("dialogue-count").textContent = String(window.CC_DIALOGUES.length);

  document.getElementById("export").addEventListener("click", function () {
    var blob = new Blob([CC.progress.exportJSON()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cantonese-coach-progress-" + CC.progress.today() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });
  document.getElementById("import").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { CC.progress.importJSON(reader.result); location.reload(); }
      catch (err) { alert(err.message); }
    };
    reader.readAsText(f);
  });
  document.getElementById("reset").addEventListener("click", function () {
    if (confirm("Delete all practice progress stored in this browser?")) { CC.progress.clearAll(); location.reload(); }
  });
})();
