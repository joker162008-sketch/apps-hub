/* Cantonese text-to-speech using the browser's built-in Web Speech API.
   No network requests are made by this code; it only drives speechSynthesis. */
(function () {
  var CC = (window.CC = window.CC || {});
  var synth = window.speechSynthesis || null;
  var LANG = "zh-HK";
  var CANTONESE_NAME = /cantonese|粵|粤|廣東|广东|sinji|hong ?kong/i;
  var voices = [];
  var listeners = [];
  var current = null;

  function isCantonese(v) {
    var lang = (v.lang || "").replace("_", "-").toLowerCase();
    return lang.indexOf("zh-hk") === 0 || lang.indexOf("yue") === 0 || CANTONESE_NAME.test(v.name || "");
  }

  function refresh() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    listeners.forEach(function (fn) { fn(); });
  }

  function cantoneseVoices() {
    return voices.filter(isCantonese).sort(function (a, b) {
      return (b.localService ? 1 : 0) - (a.localService ? 1 : 0);
    });
  }

  function selectedVoice() {
    var list = cantoneseVoices();
    var wanted = CC.settings.get().voiceURI;
    if (wanted) {
      for (var i = 0; i < voices.length; i++) if (voices[i].voiceURI === wanted) return voices[i];
    }
    for (var j = 0; j < list.length; j++) if (list[j].localService) return list[j];
    return null;
  }

  function status() {
    if (!synth) return { ok: false, reason: "unsupported" };
    var v = selectedVoice();
    if (!v) return { ok: false, reason: cantoneseVoices().length ? "online-only" : "no-voice" };
    if (!isCantonese(v)) return { ok: false, reason: "not-cantonese", voice: v };
    return { ok: true, voice: v };
  }

  function stop() {
    current = null;
    if (synth) synth.cancel();
  }

  /* speak(text, {onstart, onboundary(charIndex), onend(handle)}) -> handle; handle.failed is set when nothing was spoken */
  function speak(text, opts) {
    opts = opts || {};
    var handle = { cancelled: false };
    var v = synth ? selectedVoice() : null;
    if (!v) {
      // Never let the browser auto-pick a voice: it may be an online one.
      handle.failed = true;
      handle.reason = status().reason;
      setTimeout(function () { if (opts.onend) opts.onend(handle); }, 0);
      return handle;
    }
    stop();
    current = handle;
    var u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang || LANG;
    u.rate = CC.settings.get().rate;
    u.onstart = function () { if (current === handle && opts.onstart) opts.onstart(); };
    u.onboundary = function (e) {
      if (current === handle && opts.onboundary && typeof e.charIndex === "number") opts.onboundary(e.charIndex);
    };
    var finished = false;
    function done(e) {
      if (finished) return;
      finished = true;
      if (e && e.type === "error" && e.error !== "interrupted" && e.error !== "canceled") {
        handle.failed = true;
        handle.reason = e.error || "synthesis-failed";
      }
      if (current === handle) current = null;
      if (!handle.cancelled && opts.onend) opts.onend(handle);
    }
    u.onend = done;
    u.onerror = done;
    handle.cancel = function () { handle.cancelled = true; stop(); };
    // Small delay after cancel() avoids a Chrome bug where the next utterance is dropped.
    setTimeout(function () { if (!handle.cancelled) synth.speak(u); }, 60);
    return handle;
  }

  if (synth) {
    refresh();
    if ("onvoiceschanged" in synth) synth.onvoiceschanged = refresh;
    else if (synth.addEventListener) synth.addEventListener("voiceschanged", refresh);
    // Some mobile browsers populate voices late and never fire voiceschanged.
    var tries = 0;
    var poll = setInterval(function () {
      tries += 1;
      if (voices.length || tries > 10) clearInterval(poll);
      refresh();
    }, 500);
  }

  CC.speech = {
    LANG: LANG,
    supported: !!synth,
    speak: speak,
    stop: stop,
    status: status,
    allVoices: function () { return voices.slice(); },
    cantoneseVoices: cantoneseVoices,
    selectedVoice: selectedVoice,
    isCantonese: isCantonese,
    onVoicesChanged: function (fn) { listeners.push(fn); }
  };
})();
