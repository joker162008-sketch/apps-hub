/* Kids Science Quiz — UI wiring. All text goes through textContent; no network. */
(function () {
  "use strict";

  var core = window.QuizCore;
  var bank = window.QUESTION_BANK;
  var storage = safeStorage();
  var quiz = null;

  function safeStorage() {
    try {
      var s = window.localStorage;
      var probe = "__ksq_probe__";
      s.setItem(probe, "1");
      s.removeItem(probe);
      return s;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function () { throw new Error("storage unavailable"); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  }

  function $(id) { return document.getElementById(id); }

  function show(name) {
    ["start", "question", "end", "records"].forEach(function (s) {
      $("screen-" + s).hidden = s !== name;
    });
    window.scrollTo(0, 0);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function li(text) {
    var item = document.createElement("li");
    item.textContent = text;
    return item;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function renderStart() {
    var errors = core.validateBank(bank);
    var box = $("bank-errors");
    clear(box);
    if (errors.length) {
      box.hidden = false;
      var p = document.createElement("p");
      p.textContent = "给家长：题库文件有问题，请修改 questions/questions.json 后重新运行 build。";
      box.appendChild(p);
      var ul = document.createElement("ul");
      errors.forEach(function (e) { ul.appendChild(li(e)); });
      box.appendChild(ul);
      $("btn-start").disabled = true;
      $("bank-info").textContent = "";
    } else {
      box.hidden = true;
      $("btn-start").disabled = false;
      var n = bank.round_size ? Math.min(bank.round_size, bank.questions.length) : bank.questions.length;
      $("bank-info").textContent = "这一轮有 " + n + " 道题";
    }
    if (bank && bank.title) {
      $("title").textContent = bank.title;
      document.title = bank.title;
    }
    var p2 = core.loadProgress(storage);
    $("progress-snapshot").textContent = p2.plays
      ? "已经玩了 " + p2.plays + " 次，最好成绩 " + p2.best.score + " / " + p2.best.total
      : "";
    show("start");
  }

  function startQuiz() {
    quiz = core.createQuiz(bank);
    renderQuestion();
    show("question");
  }

  function renderQuestion() {
    var item = core.currentQuestion(quiz);
    var total = quiz.items.length;
    $("q-counter").textContent = "第 " + (quiz.index + 1) + " / " + total + " 题";
    $("q-score").textContent = "答对 " + core.score(quiz) + " 题";
    $("q-bar").style.width = Math.round((quiz.index / total) * 100) + "%";
    $("q-topic").textContent = item.topic;
    $("q-topic").hidden = !item.topic;
    $("q-text").textContent = item.question;
    var box = $("q-options");
    clear(box);
    item.options.forEach(function (text, k) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      var letter = document.createElement("span");
      letter.className = "letter";
      letter.textContent = core.LETTERS[k];
      var label = document.createElement("span");
      label.textContent = text;
      btn.appendChild(letter);
      btn.appendChild(label);
      btn.addEventListener("click", function () { choose(k); });
      box.appendChild(btn);
    });
    $("q-feedback").hidden = true;
  }

  function choose(k) {
    var result;
    try {
      result = core.answer(quiz, k);
    } catch (e) {
      return;
    }
    var buttons = $("q-options").querySelectorAll(".option");
    Array.prototype.forEach.call(buttons, function (b, i) {
      b.disabled = true;
      if (i === result.correctIndex) b.classList.add("is-correct");
      else if (i === k) b.classList.add("is-chosen-wrong");
    });
    var fb = $("q-feedback");
    fb.className = "feedback " + (result.correct ? "good" : "try");
    $("fb-title").textContent = result.feedback;
    $("fb-answer").textContent = "正确答案：" + result.correctLetter + "．" + result.correctText;
    $("fb-explanation").textContent = result.explanation;
    $("q-score").textContent = "答对 " + result.score + " 题";
    $("btn-next").textContent = result.answered === result.total ? "看看成绩" : "下一题";
    fb.hidden = false;
    $("btn-next").focus();
  }

  function goNext() {
    if (core.next(quiz)) {
      renderQuestion();
      window.scrollTo(0, 0);
    } else {
      finish();
    }
  }

  function finish() {
    var sum = core.summary(quiz);
    var progress = core.recordResult(core.loadProgress(storage), quiz, new Date());
    var saved = core.saveProgress(storage, progress);
    var stars = $("end-stars");
    clear(stars);
    for (var i = 0; i < 3; i++) {
      var s = document.createElement("span");
      s.textContent = "★";
      if (i >= sum.stars) s.className = "off";
      stars.appendChild(s);
    }
    $("end-score").textContent = sum.score + " / " + sum.total;
    $("end-message").textContent = sum.message;
    var list = $("end-missed-list");
    clear(list);
    sum.missed.forEach(function (m) { list.appendChild(li(m.question + " —— " + m.correctText)); });
    $("end-missed").hidden = sum.missed.length === 0;
    $("end-save-note").hidden = saved;
    show("end");
  }

  function renderRecords() {
    var p = core.loadProgress(storage);
    $("rec-plays").textContent = p.plays + " 次";
    $("rec-best").textContent = p.best ? p.best.score + " / " + p.best.total : "—";
    $("rec-rate").textContent = p.totalAnswered ? Math.round((p.totalCorrect / p.totalAnswered) * 100) + "%" : "—";
    var ul = $("rec-history");
    clear(ul);
    if (!p.history.length) ul.appendChild(li("还没有记录，快去答题吧！"));
    p.history.slice().reverse().forEach(function (h) {
      ul.appendChild(li(formatDate(h.date) + "　答对 " + h.score + " / " + h.total));
    });
    show("records");
  }

  function resetRecords() {
    if (window.confirm("确定要清除所有答题记录吗？")) {
      core.resetProgress(storage);
      renderRecords();
    }
  }

  $("btn-start").addEventListener("click", startQuiz);
  $("btn-records").addEventListener("click", renderRecords);
  $("btn-next").addEventListener("click", goNext);
  $("btn-again").addEventListener("click", startQuiz);
  $("btn-home").addEventListener("click", renderStart);
  $("btn-records-home").addEventListener("click", renderStart);
  $("btn-reset").addEventListener("click", resetRecords);

  renderStart();
})();
