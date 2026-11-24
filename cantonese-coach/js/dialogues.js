/* Interview scenario dialogues: two-speaker scripts with read-along and role-play. */
(function () {
  var CC = window.CC, el = CC.ui.el;
  var dialogues = window.CC_DIALOGUES;
  var menu = document.getElementById("scenario-menu");
  var stage = document.getElementById("stage");
  var roleSel = document.getElementById("role");
  var hideMine = document.getElementById("hide-mine");
  var runStatus = document.getElementById("run-status");
  CC.ui.settingsPanel(document.getElementById("voice"));

  var current = null, lines = [], run = null;

  function runsFor(id) {
    var d = CC.progress.load().dialogues[id];
    return d ? d.runs : 0;
  }

  function renderMenu() {
    menu.innerHTML = "";
    dialogues.forEach(function (d) {
      var btn = el("button", { class: "scenario" + (current && current.id === d.id ? " selected" : ""), type: "button", onclick: function () { location.hash = d.id; } }, [
        el("b", { lang: "zh-HK", text: d.title }),
        el("span", { text: d.title_en }),
        el("small", { class: "muted", text: runsFor(d.id) + " runs" })
      ]);
      menu.appendChild(btn);
    });
  }

  function select(id) {
    stopRun();
    current = dialogues.filter(function (d) { return d.id === id; })[0] || dialogues[0];
    var sp = current.speakers;
    roleSel.options[1].text = "I play A · " + sp.A.en;
    roleSel.options[2].text = "I play B · " + sp.B.en;
    stage.innerHTML = "";
    stage.appendChild(el("h2", {}, [el("span", { lang: "zh-HK", text: current.title }), " · " + current.title_en]));
    stage.appendChild(el("p", { class: "context", text: current.context }));
    lines = current.lines.map(function (ln, i) {
      var block = CC.ui.sentenceBlock(ln);
      var who = sp[ln.speaker];
      var prompt = el("div", { class: "your-turn", "aria-live": "polite" });
      var line = { data: ln, ruby: block.ruby, prompt: prompt };
      line.el = el("div", { class: "bubble side-" + ln.speaker, id: "line-" + i }, [
        el("div", { class: "who" }, [el("span", { class: "tag", text: ln.speaker }), " ", el("span", { lang: "zh-HK", text: who.yue }), " · " + who.en]),
        block.el,
        prompt,
        el("button", { class: "btn small ghost", type: "button", text: "▶", "aria-label": "Play line", onclick: function () { stopRun(); playLine(line); } })
      ]);
      stage.appendChild(line.el);
      return line;
    });
    applyRole();
    renderMenu();
  }

  function applyRole() {
    var role = roleSel.value;
    lines.forEach(function (l) {
      var mine = role !== "both" && l.data.speaker === role;
      l.el.classList.toggle("mine", mine);
      l.el.classList.toggle("hidden-text", mine && hideMine.checked);
    });
  }

  function playLine(line, onend) {
    line.el.classList.add("active");
    line.el.classList.remove("hidden-text");
    return CC.ui.readAlong(line.data.yue, line.ruby, {
      onend: function (h) { line.el.classList.remove("active"); applyRole(); if (onend) onend(h); }
    });
  }

  function stopRun() {
    if (run) {
      run.stopped = true;
      if (run.handle && run.handle.cancel) run.handle.cancel();
      clearTimeout(run.timer);
    }
    CC.speech.stop();
    run = null;
    lines.forEach(function (l) { l.el.classList.remove("active", "turn"); l.prompt.innerHTML = ""; });
    applyRole();
    runStatus.textContent = "";
    document.body.classList.remove("running");
  }

  function start() {
    stopRun();
    var r = (run = { stopped: false });
    var role = roleSel.value;
    document.body.classList.add("running");
    var i = 0;
    function next() {
      if (r.stopped) return;
      if (i >= lines.length) {
        CC.progress.markDialogue(current.id);
        runStatus.textContent = "Dialogue finished.";
        document.body.classList.remove("running");
        run = null;
        renderMenu();
        return;
      }
      var line = lines[i];
      line.el.scrollIntoView({ behavior: "smooth", block: "center" });
      runStatus.textContent = "Line " + (i + 1) + "/" + lines.length;
      if (role !== "both" && line.data.speaker === role) return yourTurn(line);
      r.handle = playLine(line, function (h) {
        if (r.stopped) return;
        if (h && h.failed) { stopRun(); runStatus.textContent = CC.ui.audioFailed(h); return; }
        i += 1; r.timer = setTimeout(next, 500);
      });
    }
    function yourTurn(line) {
      line.el.classList.add("active", "turn");
      line.prompt.innerHTML = "";
      line.prompt.appendChild(el("span", { text: "🎙 Your line — say it aloud, then tap Next. " }));
      line.prompt.appendChild(el("button", { class: "btn small", type: "button", text: "▶ Hear model", onclick: function () {
        if (r.stopped) return;
        r.handle = playLine(line, function () { line.el.classList.add("active"); });
      } }));
      line.prompt.appendChild(el("button", { class: "btn small good", type: "button", text: "Next ▶▶", onclick: function () {
        if (r.stopped) return;
        CC.speech.stop();
        line.el.classList.remove("active", "turn");
        line.prompt.innerHTML = "";
        i += 1;
        next();
      } }));
      if (hideMine.checked) {
        line.prompt.appendChild(el("button", { class: "btn small ghost", type: "button", text: "Show text", onclick: function () { line.el.classList.remove("hidden-text"); } }));
      }
    }
    next();
  }

  roleSel.addEventListener("change", function () { stopRun(); applyRole(); });
  hideMine.addEventListener("change", applyRole);
  document.getElementById("play-dialogue").addEventListener("click", start);
  document.getElementById("stop").addEventListener("click", stopRun);
  window.addEventListener("hashchange", function () { select(location.hash.slice(1)); });
  select(location.hash.slice(1));
})();
