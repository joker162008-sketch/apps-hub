/* Settings and progress, persisted in localStorage on this device only. */
(function () {
  var CC = (window.CC = window.CC || {});
  var SETTINGS_KEY = "cantonese-coach.settings.v1";
  var PROGRESS_KEY = "cantonese-coach.progress.v1";
  var DAILY_SIZE = 10;
  var MAX_REVIEW = 3;

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or disabled */ }
  }

  var DEFAULT_SETTINGS = { voiceURI: "", rate: 0.85, showJyutping: true, showZh: true, showEn: true, repeats: 1 };

  CC.settings = {
    get: function () {
      var s = read(SETTINGS_KEY, {});
      var out = {};
      for (var k in DEFAULT_SETTINGS) out[k] = k in s ? s[k] : DEFAULT_SETTINGS[k];
      return out;
    },
    set: function (patch) {
      var s = CC.settings.get();
      for (var k in patch) s[k] = patch[k];
      write(SETTINGS_KEY, s);
      return s;
    }
  };

  function today(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  function addDays(dateStr, n) {
    var p = dateStr.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return today(d);
  }

  function emptyProgress() {
    return { version: 1, sentences: {}, days: {}, dialogues: {}, dailySets: {} };
  }
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  /* Repair anything a hand-edited or old progress file could break, so pages never throw on load. */
  function normalize(p) {
    if (!isObj(p) || p.version !== 1) return emptyProgress();
    ["sentences", "days", "dialogues", "dailySets"].forEach(function (k) { if (!isObj(p[k])) p[k] = {}; });
    Object.keys(p.sentences).forEach(function (id) { if (!isObj(p.sentences[id])) delete p.sentences[id]; });
    Object.keys(p.days).forEach(function (d) {
      var day = p.days[d];
      if (!isObj(day)) day = p.days[d] = {};
      if (!Array.isArray(day.practised)) day.practised = [];
    });
    Object.keys(p.dialogues).forEach(function (id) {
      var r = p.dialogues[id];
      if (!isObj(r)) r = p.dialogues[id] = {};
      if (typeof r.runs !== "number" || !isFinite(r.runs)) r.runs = 0;
    });
    Object.keys(p.dailySets).forEach(function (d) { if (!Array.isArray(p.dailySets[d])) delete p.dailySets[d]; });
    return p;
  }
  function load() { return normalize(read(PROGRESS_KEY, null)); }
  function save(p) { write(PROGRESS_KEY, p); }

  /* Interleave categories so a new learner's first day covers every interview topic. */
  function roundRobin(bank) {
    var byCat = {}, order = [];
    bank.forEach(function (s) {
      if (!byCat[s.category]) { byCat[s.category] = []; order.push(s.category); }
      byCat[s.category].push(s);
    });
    var out = [], i = 0, added = true;
    while (added) {
      added = false;
      order.forEach(function (c) {
        if (byCat[c][i]) { out.push(byCat[c][i]); added = true; }
      });
      i += 1;
    }
    return out;
  }

  /* Daily set: up to 3 "again" reviews, then new sentences, then learning, then mastered (oldest first). */
  function pickDaily(bank, progress, date) {
    var ordered = roundRobin(bank);
    var rec = function (s) { return progress.sentences[s.id] || {}; };
    var byOldest = function (a, b) { return (rec(a).last || "").localeCompare(rec(b).last || ""); };
    var review = ordered.filter(function (s) { return rec(s).status === "again" && rec(s).last !== date; }).sort(byOldest);
    var fresh = ordered.filter(function (s) { return !rec(s).status; });
    var learning = ordered.filter(function (s) { return rec(s).status === "again" || rec(s).status === "practised"; }).sort(byOldest);
    var mastered = ordered.filter(function (s) { return rec(s).status === "mastered"; }).sort(byOldest);
    var picked = [], seen = {};
    function take(list, limit) {
      for (var i = 0; i < list.length && picked.length < limit; i++) {
        if (!seen[list[i].id]) { seen[list[i].id] = 1; picked.push(list[i].id); }
      }
    }
    take(review, MAX_REVIEW);
    take(fresh, DAILY_SIZE);
    take(learning, DAILY_SIZE);
    take(mastered, DAILY_SIZE);
    return picked;
  }

  CC.progress = {
    DAILY_SIZE: DAILY_SIZE,
    today: today,
    load: load,
    pickDaily: pickDaily,
    roundRobin: roundRobin,

    dailySet: function (bank, date) {
      date = date || today();
      var p = load();
      var ids = p.dailySets[date];
      var valid = ids && ids.every(function (id) { return bank.some(function (s) { return s.id === id; }); });
      if (!valid) {
        ids = pickDaily(bank, p, date);
        p.dailySets = {};
        p.dailySets[date] = ids;
        save(p);
      }
      return ids;
    },

    /* status: "practised" (said it), "again" (needs review), "mastered" (got it) */
    mark: function (id, status, date) {
      date = date || today();
      var p = load();
      var r = p.sentences[id] || { reps: 0 };
      r.reps = (r.reps || 0) + 1;
      if (status === "practised" && (r.status === "mastered" || r.status === "again")) {
        /* keep the stronger self-rating */
      } else {
        r.status = status;
      }
      r.last = date;
      p.sentences[id] = r;
      var day = p.days[date] || { practised: [] };
      if (day.practised.indexOf(id) < 0) day.practised.push(id);
      p.days[date] = day;
      save(p);
      return r;
    },

    reset: function (id) {
      var p = load();
      delete p.sentences[id];
      save(p);
    },

    markDialogue: function (id, date) {
      date = date || today();
      var p = load();
      var d = p.dialogues[id] || { runs: 0 };
      d.runs += 1;
      d.last = date;
      p.dialogues[id] = d;
      var day = p.days[date] || { practised: [] };
      day.dialogues = (day.dialogues || 0) + 1;
      p.days[date] = day;
      save(p);
    },

    record: function (id) { return load().sentences[id] || null; },

    /* A day counts toward the streak when every sentence of that day's set was practised,
       or at least DAILY_SIZE sentences were practised. */
    dayComplete: function (p, date) {
      var day = p.days[date];
      if (!day) return false;
      if (day.complete) return true;
      return day.practised.length >= DAILY_SIZE;
    },

    markDayCompleteIfDone: function (bank, date) {
      date = date || today();
      var p = load();
      var ids = p.dailySets[date] || [];
      var day = p.days[date];
      if (day && ids.length && ids.every(function (id) { return day.practised.indexOf(id) >= 0; })) {
        day.complete = true;
        save(p);
        return true;
      }
      return false;
    },

    stats: function (bank, date) {
      date = date || today();
      var p = load();
      var counts = { practised: 0, mastered: 0, again: 0 };
      bank.forEach(function (s) {
        var r = p.sentences[s.id];
        if (!r) return;
        counts.practised += 1;
        if (r.status === "mastered") counts.mastered += 1;
        if (r.status === "again") counts.again += 1;
      });
      var streak = 0, cursor = date;
      if (!CC.progress.dayComplete(p, cursor)) cursor = addDays(cursor, -1);
      while (CC.progress.dayComplete(p, cursor)) { streak += 1; cursor = addDays(cursor, -1); }
      var daysPractised = Object.keys(p.days).filter(function (d) { return p.days[d].practised.length; }).length;
      var last14 = [];
      for (var i = 13; i >= 0; i--) {
        var d = addDays(date, -i);
        var rec = p.days[d];
        last14.push({ date: d, count: rec ? rec.practised.length : 0, complete: CC.progress.dayComplete(p, d) });
      }
      var todaySet = p.dailySets[date] || [];
      var todayDone = todaySet.filter(function (id) { return p.days[date] && p.days[date].practised.indexOf(id) >= 0; }).length;
      return {
        total: bank.length, practised: counts.practised, mastered: counts.mastered, again: counts.again,
        streak: streak, daysPractised: daysPractised, last14: last14,
        todayDone: todayDone, todayTotal: todaySet.length,
        dialogueRuns: Object.keys(p.dialogues).reduce(function (n, k) { return n + p.dialogues[k].runs; }, 0)
      };
    },

    exportJSON: function () { return JSON.stringify(load(), null, 2); },
    importJSON: function (text) {
      var p = JSON.parse(text);
      if (!isObj(p) || p.version !== 1 || !isObj(p.sentences)) throw new Error("Not a cantonese-coach progress file");
      save(normalize(p));
    },
    clearAll: function () { save(emptyProgress()); }
  };
})();
