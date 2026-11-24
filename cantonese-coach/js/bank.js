/* Browse and search the full sentence bank. */
(function () {
  var CC = window.CC, el = CC.ui.el;
  var bank = window.CC_SENTENCES;
  var cats = window.CC_CATEGORIES;
  var listEl = document.getElementById("bank-list");
  var q = document.getElementById("q");
  var catSel = document.getElementById("cat");
  var statusSel = document.getElementById("status");
  var countEl = document.getElementById("count");
  CC.ui.settingsPanel(document.getElementById("voice"));

  cats.forEach(function (c) { catSel.appendChild(el("option", { value: c.id, text: c.en })); });
  var catName = {};
  cats.forEach(function (c) { catName[c.id] = c.en; });

  function matches(s) {
    var term = q.value.trim().toLowerCase();
    if (catSel.value && s.category !== catSel.value) return false;
    var rec = CC.progress.record(s.id);
    var st = rec && rec.status ? rec.status : "new";
    if (statusSel.value && st !== statusSel.value) return false;
    if (!term) return true;
    return [s.yue, s.jyutping, s.zh, s.en, s.context, s.id].join(" ").toLowerCase().indexOf(term) >= 0;
  }

  function render() {
    listEl.innerHTML = "";
    var shown = bank.filter(matches);
    countEl.textContent = shown.length + " of " + bank.length + " sentences";
    shown.forEach(function (s) {
      var block = CC.ui.sentenceBlock(s);
      var badge = el("span", { class: "badge" });
      function upd() {
        var rec = CC.progress.record(s.id);
        badge.textContent = CC.ui.statusLabel(rec);
        badge.className = "badge " + (rec && rec.status ? rec.status : "new");
      }
      function act(status) {
        return function () {
          if (status) CC.progress.mark(s.id, status); else CC.progress.reset(s.id);
          if (statusSel.value) render(); else upd();
        };
      }
      listEl.appendChild(el("article", { class: "card" }, [
        el("div", { class: "card-head" }, [el("span", { class: "num", text: s.id }), el("span", { class: "cat", text: catName[s.category] }), badge]),
        block.el,
        el("p", { class: "context", text: s.context }),
        el("div", { class: "actions" }, [
          el("button", { class: "btn", type: "button", text: "▶ Play", onclick: function () { CC.ui.readAlong(s.yue, block.ruby); } }),
          el("button", { class: "btn good", type: "button", text: "識講", onclick: act("mastered") }),
          el("button", { class: "btn warn", type: "button", text: "再練", onclick: act("again") }),
          el("button", { class: "btn ghost", type: "button", text: "Reset", onclick: act(null) })
        ])
      ]));
      upd();
    });
  }
  [q, catSel, statusSel].forEach(function (x) { x.addEventListener("input", render); });
  render();
})();
