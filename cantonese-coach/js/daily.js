/* Daily practice: 10 sentences, read-along and repeat-after-me modes. */
(function () {
  var CC = window.CC, el = CC.ui.el;
  var bank = window.CC_SENTENCES;
  var byId = {};
  bank.forEach(function (s) { byId[s.id] = s; });

  var listEl = document.getElementById("daily-list");
  var statsEl = document.getElementById("stats");
  var playAllBtn = document.getElementById("play-all");
  var repeatBtn = document.getElementById("repeat-mode");
  var stopBtn = document.getElementById("stop");
  var repeatsSel = document.getElementById("repeats");
  var runStatus = document.getElementById("run-status");

  CC.ui.settingsPanel(document.getElementById("voice"));
  repeatsSel.value = String(CC.settings.get().repeats);
  repeatsSel.addEventListener("change", function () { CC.settings.set({ repeats: parseInt(repeatsSel.value, 10) }); });

  var ids = CC.progress.dailySet(bank);
  var cards = [];
  var run = null;

  function refreshStats() { CC.ui.renderStats(statsEl, bank); }

  function mark(card, status) {
    CC.progress.mark(card.entry.id, status);
    CC.progress.markDayCompleteIfDone(bank);
    updateCard(card);
    refreshStats();
  }

  function updateCard(card) {
    var rec = CC.progress.record(card.entry.id);
    var today = CC.progress.today();
    card.badge.textContent = CC.ui.statusLabel(rec);
    card.badge.className = "badge " + (rec && rec.status ? rec.status : "new");
    card.el.classList.toggle("done-today", !!(rec && rec.last === today));
  }

  ids.forEach(function (id, n) {
    var entry = byId[id];
    var badge = el("span", { class: "badge" });
    var turn = el("div", { class: "your-turn", "aria-live": "polite" });
    var block = CC.ui.sentenceBlock(entry);
    var card = { entry: entry, badge: badge, turn: turn, ruby: block.ruby };
    var playBtn = el("button", { class: "btn", type: "button", text: "▶ Play", onclick: function () { stopRun(); playOne(card); } });
    card.el = el("article", { class: "card", id: "s-" + id }, [
      el("div", { class: "card-head" }, [el("span", { class: "num", text: String(n + 1) }), el("span", { class: "cat", text: entry.category }), badge]),
      block.el,
      el("p", { class: "context", text: entry.context }),
      turn,
      el("div", { class: "actions" }, [
        playBtn,
        el("button", { class: "btn ghost", type: "button", text: "✓ Said it", onclick: function () { mark(card, "practised"); } }),
        el("button", { class: "btn good", type: "button", text: "識講 Got it", onclick: function () { mark(card, "mastered"); } }),
        el("button", { class: "btn warn", type: "button", text: "再練 Again", onclick: function () { mark(card, "again"); } })
      ])
    ]);
    cards.push(card);
    listEl.appendChild(card.el);
    updateCard(card);
  });

  function playOne(card, onend) {
    card.el.classList.add("active");
    return CC.ui.readAlong(card.entry.yue, card.ruby, {
      onend: function (h) { card.el.classList.remove("active"); if (onend) onend(h); }
    });
  }

  function pauseFor(card) {
    var units = card.ruby.units.length;
    return Math.round((units * 450) / CC.settings.get().rate + 1500);
  }

  function stopRun() {
    if (run) {
      run.stopped = true;
      if (run.handle && run.handle.cancel) run.handle.cancel();
      clearInterval(run.tick);
      clearTimeout(run.timer);
      cards.forEach(function (c) { c.el.classList.remove("active", "turn"); c.turn.textContent = ""; });
    }
    CC.speech.stop();
    run = null;
    runStatus.textContent = "";
    document.body.classList.remove("running");
  }

  function start(mode) {
    stopRun();
    var r = (run = { stopped: false, mode: mode });
    document.body.classList.add("running");
    var repeats = parseInt(repeatsSel.value, 10) || 1;
    var i = 0, rep = 0;

    function next() {
      if (r.stopped) return;
      if (i >= cards.length) {
        runStatus.textContent = mode === "repeat" ? "Session finished — rate each sentence 識講 / 再練." : "Finished.";
        document.body.classList.remove("running");
        run = null;
        return;
      }
      var card = cards[i];
      card.el.scrollIntoView({ behavior: "smooth", block: "center" });
      runStatus.textContent = (mode === "repeat" ? "Repeat after me · " : "Read-along · ") + (i + 1) + "/" + cards.length;
      r.handle = playOne(card, function (h) {
        if (r.stopped) return;
        if (h && h.failed) { stopRun(); runStatus.textContent = CC.ui.audioFailed(h); return; }
        if (mode !== "repeat") { i += 1; r.timer = setTimeout(next, 700); return; }
        yourTurn(card, function () {
          rep += 1;
          if (rep < repeats) return next();
          rep = 0;
          mark(card, "practised");
          i += 1;
          next();
        });
      });
    }

    function yourTurn(card, done) {
      var ms = pauseFor(card);
      var endAt = Date.now() + ms;
      card.el.classList.add("turn");
      function paint() {
        var left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        card.turn.textContent = "🎙 Your turn — say it aloud (" + left + "s)";
      }
      paint();
      r.tick = setInterval(paint, 250);
      r.timer = setTimeout(function () {
        clearInterval(r.tick);
        card.el.classList.remove("turn");
        card.turn.textContent = "";
        if (!r.stopped) done();
      }, ms);
    }

    next();
  }

  playAllBtn.addEventListener("click", function () { start("read"); });
  repeatBtn.addEventListener("click", function () { start("repeat"); });
  stopBtn.addEventListener("click", stopRun);
  document.getElementById("today-label").textContent = CC.progress.today();
  refreshStats();
})();
