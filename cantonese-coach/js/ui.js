/* Shared UI helpers: ruby (characters + Jyutping) rendering, read-along highlighting, settings panel. */
(function () {
  var CC = (window.CC = window.CC || {});
  var HAN = /[\u3400-\u4dbf\u4e00-\u9fff]|[\ud840-\ud8bf][\udc00-\udfff]/;
  var ASCII_WORD = /^[A-Za-z][A-Za-z0-9\-]*/;
  var PUNCT = /[,.?!:;]+$/;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  /* Pair each Chinese character (and each embedded English word) with its Jyutping token. */
  function ruby(yue, jyutping) {
    var tokens = jyutping.split(/\s+/).map(function (t) { return t.replace(PUNCT, ""); }).filter(Boolean);
    var wrap = el("span", { class: "yue", lang: "zh-HK" });
    var units = [];
    var i = 0, t = 0;
    var chars = Array.from(yue);
    var pos = 0;
    while (i < chars.length) {
      var ch = chars[i];
      var rest = chars.slice(i).join("");
      var word = rest.match(ASCII_WORD);
      var node, len;
      if (HAN.test(ch)) {
        node = el("ruby", { class: "u" }, [ch, el("rt", { text: tokens[t] || "" })]);
        t += 1; len = ch.length; i += 1;
      } else if (word) {
        var tok = tokens[t] === word[0] ? tokens[t] : "";
        if (tok) t += 1;
        node = el("ruby", { class: "u en-word" }, [word[0], el("rt", { text: tok })]);
        len = word[0].length; i += word[0].length;
      } else {
        wrap.appendChild(el("span", { class: "p", text: ch }));
        pos += ch.length; i += 1;
        continue;
      }
      units.push({ start: pos, end: pos + len, el: node });
      wrap.appendChild(node);
      pos += len;
    }
    return { el: wrap, units: units };
  }

  function sentenceBlock(entry, extra) {
    var r = ruby(entry.yue, entry.jyutping);
    var box = el("div", { class: "sentence" }, [
      r.el,
      el("div", { class: "jp-line", text: entry.jyutping }),
      el("div", { class: "zh", lang: "zh-Hans", text: entry.zh }),
      el("div", { class: "en", lang: "en", text: entry.en })
    ].concat(extra || []));
    return { el: box, ruby: r };
  }

  /* Speak text and highlight ruby units. Uses onboundary events when the voice provides them,
     otherwise advances an estimated cursor so the eye can follow. */
  function readAlong(text, r, opts) {
    opts = opts || {};
    var units = r ? r.units : [];
    var timer = null, gotBoundary = false;
    function paint(idx) {
      units.forEach(function (u, k) {
        u.el.classList.toggle("spoken", k < idx);
        u.el.classList.toggle("current", k === idx);
      });
    }
    function clear() { units.forEach(function (u) { u.el.classList.remove("spoken", "current"); }); }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    if (r) r.el.classList.add("speaking");
    var handle = CC.speech.speak(text, {
      onstart: function () {
        if (!units.length) return;
        var idx = 0;
        paint(0);
        var perUnit = 260 / CC.settings.get().rate;
        timer = setInterval(function () {
          if (gotBoundary) return stopTimer();
          idx = Math.min(idx + 1, units.length - 1);
          paint(idx);
        }, perUnit);
      },
      onboundary: function (ci) {
        gotBoundary = true;
        stopTimer();
        for (var k = 0; k < units.length; k++) {
          if (ci < units[k].end) { paint(k); return; }
        }
      },
      onend: function (h) {
        stopTimer();
        clear();
        if (r) r.el.classList.remove("speaking");
        if (opts.onend) opts.onend(h);
      }
    });
    var origCancel = handle.cancel;
    handle.cancel = function () {
      stopTimer(); clear();
      if (r) r.el.classList.remove("speaking");
      if (origCancel) origCancel();
    };
    return handle;
  }

  function applyToggles() {
    var s = CC.settings.get();
    document.body.classList.toggle("hide-jp", !s.showJyutping);
    document.body.classList.toggle("hide-zh", !s.showZh);
    document.body.classList.toggle("hide-en", !s.showEn);
  }

  var VOICE_HELP = {
    unsupported: "This browser has no Web Speech API, so audio cannot play. Try Chrome (Android) or Safari (iPhone).",
    "no-voice": "No Cantonese voice found on this device yet. Android: Settings → System → Languages → Text-to-speech → Google engine → install 粵語（香港）/ Cantonese (Hong Kong). iPhone: Settings → Accessibility → Spoken Content → Voices → Chinese (Hong Kong) → download a voice. Then reload this page.",
    "online-only": "Only an online Cantonese voice was found (it would send text to a server), so it is not selected automatically. Install an offline Cantonese voice (see README), or pick the online voice below if you accept that.",
    "not-cantonese": "The selected voice is not Cantonese. Pick a zh-HK / yue voice below."
  };

  function settingsPanel(container) {
    var status = el("div", { class: "voice-status", role: "status" });
    var select = el("select", { id: "voice-select", "aria-label": "Voice" });
    var rate = el("input", { type: "range", min: "0.5", max: "1.3", step: "0.05", id: "rate", "aria-label": "Speed" });
    var rateLabel = el("span", { class: "rate-label" });
    function toggle(key, label) {
      var cb = el("input", { type: "checkbox" });
      cb.checked = CC.settings.get()[key];
      cb.addEventListener("change", function () { var p = {}; p[key] = cb.checked; CC.settings.set(p); applyToggles(); });
      return el("label", { class: "toggle" }, [cb, " " + label]);
    }
    function render() {
      var s = CC.settings.get();
      var all = CC.speech.allVoices();
      var canto = CC.speech.cantoneseVoices();
      var chosen = CC.speech.selectedVoice();
      select.innerHTML = "";
      select.appendChild(el("option", { value: "", text: canto.length ? "Auto (offline Cantonese voice)" : "No Cantonese voice found" }));
      var others = all.filter(function (v) { return !CC.speech.isCantonese(v); });
      canto.concat(others).forEach(function (v) {
        var tag = CC.speech.isCantonese(v) ? "" : " — not Cantonese";
        var net = v.localService ? "" : " (online)";
        var o = el("option", { value: v.voiceURI, text: v.name + " [" + v.lang + "]" + net + tag });
        select.appendChild(o);
      });
      select.value = s.voiceURI && chosen ? s.voiceURI : "";
      rate.value = String(s.rate);
      rateLabel.textContent = Number(s.rate).toFixed(2) + "×";
      var st = CC.speech.status();
      status.className = "voice-status " + (st.ok ? "ok" : "warn");
      status.textContent = st.ok
        ? "Voice: " + st.voice.name + " [" + st.voice.lang + "]" + (st.voice.localService ? " · on-device" : " · online voice")
        : VOICE_HELP[st.reason];
    }
    select.addEventListener("change", function () { CC.settings.set({ voiceURI: select.value }); render(); });
    rate.addEventListener("input", function () { CC.settings.set({ rate: parseFloat(rate.value) }); render(); });
    var test = el("button", { class: "btn small", type: "button", text: "▶ Test voice", onclick: function () {
      CC.speech.speak("你好，歡迎練習廣東話。");
    } });
    var panel = el("details", { class: "settings" }, [
      el("summary", { text: "Voice & display settings" }),
      el("div", { class: "row" }, [el("label", { for: "voice-select", text: "Voice " }), select]),
      el("div", { class: "row" }, [el("label", { for: "rate", text: "Speed " }), rate, rateLabel, test]),
      el("div", { class: "row" }, [toggle("showJyutping", "Jyutping"), toggle("showZh", "普通话"), toggle("showEn", "English")])
    ]);
    container.appendChild(status);
    container.appendChild(panel);
    CC.speech.onVoicesChanged(render);
    render();
    applyToggles();
    if (!CC.speech.status().ok) panel.open = true;
  }

  var STATUS_LABEL = { practised: "Practised", again: "再練 Again", mastered: "識講 Got it" };
  function statusLabel(rec) { return rec && rec.status ? STATUS_LABEL[rec.status] : "New"; }

  function renderStats(container, bank) {
    var st = CC.progress.stats(bank);
    container.innerHTML = "";
    function stat(n, label) { return el("div", { class: "stat" }, [el("b", { text: String(n) }), el("span", { text: label })]); }
    container.appendChild(el("div", { class: "stats" }, [
      stat(st.todayDone + "/" + (st.todayTotal || CC.progress.DAILY_SIZE), "today"),
      stat(st.streak, "day streak"),
      stat(st.mastered + "/" + st.total, "識講 got it"),
      stat(st.practised + "/" + st.total, "practised"),
      stat(st.dialogueRuns, "dialogue runs")
    ]));
    var cal = el("div", { class: "cal", "aria-label": "Last 14 days" });
    st.last14.forEach(function (d) {
      cal.appendChild(el("span", { class: "day" + (d.complete ? " done" : d.count ? " some" : ""), title: d.date + ": " + d.count + " practised" }));
    });
    container.appendChild(el("div", { class: "cal-wrap" }, [el("span", { class: "muted", text: "Last 14 days " }), cal]));
    return st;
  }

  function audioFailed(h) {
    return "Audio did not play (" + (h.reason || "error") + ") — check the voice settings above. Session stopped; nothing was recorded.";
  }

  CC.ui = { audioFailed: audioFailed, el: el, ruby: ruby, sentenceBlock: sentenceBlock, readAlong: readAlong, applyToggles: applyToggles, settingsPanel: settingsPanel, statusLabel: statusLabel, renderStats: renderStats };
})();
