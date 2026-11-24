/*
 * Kids Science Quiz — pure quiz logic (no DOM, no network).
 * Works in the browser (window.QuizCore) and in Node (module.exports) so the
 * same code is exercised by the pytest suite.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QuizCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OPTION_COUNT = 4;
  var STORAGE_KEY = "kids-science-quiz.progress.v1";
  var PROGRESS_VERSION = 1;
  var HISTORY_LIMIT = 20;
  var LETTERS = ["A", "B", "C", "D"];

  var PRAISE = "答对啦！你真棒！";
  var ENCOURAGE = "差一点点！我们一起来看看为什么吧。";

  // Small deterministic PRNG (mulberry32) so a seeded quiz is reproducible.
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function isText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  // Runtime mirror of the Python validator's structural rules.
  function validateBank(bank) {
    var errors = [];
    if (!bank || typeof bank !== "object" || !Array.isArray(bank.questions)) {
      return ["题库格式不对：缺少 questions 列表"];
    }
    if (bank.questions.length === 0) errors.push("题库里还没有题目");
    var seen = Object.create(null);
    bank.questions.forEach(function (q, i) {
      var label = "第 " + (i + 1) + " 题";
      if (!q || typeof q !== "object") {
        errors.push(label + "：格式不对");
        return;
      }
      if (q.id) label += "（" + q.id + "）";
      if (!isText(q.id)) errors.push(label + "：缺少 id");
      else if (seen[q.id]) errors.push(label + "：id 重复");
      else seen[q.id] = true;
      if (!isText(q.question)) errors.push(label + "：缺少题目文字");
      if (!isText(q.explanation)) errors.push(label + "：缺少讲解");
      if (!Array.isArray(q.options) || q.options.length !== OPTION_COUNT) {
        errors.push(label + "：必须正好有 4 个选项");
        return;
      }
      var correct = 0;
      q.options.forEach(function (opt, k) {
        if (!opt || !isText(opt.text)) errors.push(label + "：选项 " + LETTERS[k] + " 没有文字");
        if (opt && opt.correct === true) correct += 1;
      });
      if (correct !== 1) errors.push(label + "：必须正好有 1 个正确答案（现在有 " + correct + " 个）");
    });
    return errors;
  }

  function createQuiz(bank, opts) {
    opts = opts || {};
    var errors = validateBank(bank);
    if (errors.length) throw new Error("题库有问题：" + errors.join("；"));
    var rng = opts.rng || makeRng(typeof opts.seed === "number" ? opts.seed : Date.now());
    var questions = opts.shuffleQuestions === false ? bank.questions.slice() : shuffle(bank.questions, rng);
    var size = opts.roundSize || bank.round_size || questions.length;
    questions = questions.slice(0, Math.max(1, Math.min(size, questions.length)));
    var items = questions.map(function (q) {
      var options = opts.shuffleOptions === false ? q.options.slice() : shuffle(q.options, rng);
      var correctIndex = -1;
      options.forEach(function (o, k) {
        if (o.correct === true) correctIndex = k;
      });
      return {
        id: q.id,
        topic: q.topic || "",
        question: q.question,
        options: options.map(function (o) { return o.text; }),
        correctIndex: correctIndex,
        explanation: q.explanation
      };
    });
    return { title: bank.title || "", items: items, index: 0, answers: [], finished: false };
  }

  function currentQuestion(quiz) {
    if (quiz.finished) return null;
    return quiz.items[quiz.index] || null;
  }

  function score(quiz) {
    return quiz.answers.filter(function (a) { return a && a.correct; }).length;
  }

  function answer(quiz, choice) {
    var item = currentQuestion(quiz);
    if (!item) throw new Error("测验已经结束了");
    if (quiz.answers[quiz.index]) throw new Error("这道题已经回答过了");
    if (!(choice >= 0 && choice < item.options.length) || Math.floor(choice) !== choice) {
      throw new Error("没有这个选项");
    }
    var correct = choice === item.correctIndex;
    quiz.answers[quiz.index] = { id: item.id, choice: choice, correct: correct };
    return {
      correct: correct,
      choice: choice,
      correctIndex: item.correctIndex,
      correctLetter: LETTERS[item.correctIndex],
      correctText: item.options[item.correctIndex],
      feedback: correct ? PRAISE : ENCOURAGE,
      explanation: item.explanation,
      score: score(quiz),
      answered: quiz.answers.length,
      total: quiz.items.length
    };
  }

  // Move to the next question; returns false once the quiz is finished.
  function next(quiz) {
    if (quiz.finished) return false;
    if (!quiz.answers[quiz.index]) throw new Error("请先选一个答案");
    quiz.index += 1;
    if (quiz.index >= quiz.items.length) {
      quiz.finished = true;
      return false;
    }
    return true;
  }

  function starsFor(percent) {
    if (percent === 100) return 3;
    if (percent >= 60) return 2;
    return 1;
  }

  function messageFor(percent) {
    if (percent === 100) return "全部答对！你是小小科学家！";
    if (percent >= 60) return "真不错！你知道好多科学知识！";
    return "完成啦！每玩一次，你都会知道得更多！";
  }

  function summary(quiz) {
    var total = quiz.items.length;
    var s = score(quiz);
    var percent = total ? Math.round((s / total) * 100) : 0;
    var missed = [];
    quiz.items.forEach(function (item, i) {
      var a = quiz.answers[i];
      if (a && !a.correct) {
        missed.push({ id: item.id, question: item.question, correctText: item.options[item.correctIndex] });
      }
    });
    return {
      score: s,
      total: total,
      percent: percent,
      stars: starsFor(percent),
      message: messageFor(percent),
      missed: missed
    };
  }

  function emptyProgress() {
    return {
      version: PROGRESS_VERSION,
      plays: 0,
      totalCorrect: 0,
      totalAnswered: 0,
      best: null,
      lastPlayed: null,
      history: [],
      questions: {}
    };
  }

  function isNum(v) {
    return typeof v === "number" && isFinite(v) && v >= 0;
  }

  function isProgress(p) {
    if (!p || typeof p !== "object" || p.version !== PROGRESS_VERSION) return false;
    if (!isNum(p.plays) || !isNum(p.totalCorrect) || !isNum(p.totalAnswered)) return false;
    if (!Array.isArray(p.history) || !p.questions || typeof p.questions !== "object") return false;
    if (p.best === null || p.best === undefined) return p.plays === 0;
    return typeof p.best === "object" && isNum(p.best.score) && isNum(p.best.total) && isNum(p.best.percent);
  }

  function loadProgress(storage) {
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress();
      var parsed = JSON.parse(raw);
      return isProgress(parsed) ? parsed : emptyProgress();
    } catch (e) {
      return emptyProgress();
    }
  }

  function recordResult(progress, quiz, now) {
    if (!quiz.finished) throw new Error("测验还没结束");
    var p = JSON.parse(JSON.stringify(isProgress(progress) ? progress : emptyProgress()));
    var sum = summary(quiz);
    var date = (now || new Date()).toISOString();
    p.plays += 1;
    p.totalCorrect += sum.score;
    p.totalAnswered += sum.total;
    p.lastPlayed = date;
    if (!p.best || sum.percent > p.best.percent ||
        (sum.percent === p.best.percent && sum.score > p.best.score)) {
      p.best = { score: sum.score, total: sum.total, percent: sum.percent, date: date };
    }
    p.history.push({ date: date, score: sum.score, total: sum.total });
    if (p.history.length > HISTORY_LIMIT) p.history = p.history.slice(-HISTORY_LIMIT);
    quiz.answers.forEach(function (a) {
      var q = p.questions[a.id] || { seen: 0, correct: 0 };
      q.seen += 1;
      if (a.correct) q.correct += 1;
      p.questions[a.id] = q;
    });
    return p;
  }

  function saveProgress(storage, progress) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(progress));
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetProgress(storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* storage unavailable: nothing to clear */
    }
    return emptyProgress();
  }

  return {
    OPTION_COUNT: OPTION_COUNT,
    STORAGE_KEY: STORAGE_KEY,
    HISTORY_LIMIT: HISTORY_LIMIT,
    LETTERS: LETTERS,
    makeRng: makeRng,
    shuffle: shuffle,
    validateBank: validateBank,
    createQuiz: createQuiz,
    currentQuestion: currentQuestion,
    answer: answer,
    next: next,
    score: score,
    summary: summary,
    emptyProgress: emptyProgress,
    loadProgress: loadProgress,
    recordResult: recordResult,
    saveProgress: saveProgress,
    resetProgress: resetProgress
  };
});
