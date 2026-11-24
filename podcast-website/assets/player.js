/* Progressive enhancement for the native <audio> players and the "copy RSS" button.
   No network requests are made here: audio is streamed by the browser from the linked MP3 URL. */
(function () {
  "use strict";
  var SPEEDS = [1, 1.25, 1.5, 2];

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  function fmtSpeed(s) { return s + "×"; }

  document.querySelectorAll(".player").forEach(function (player) {
    var audio = player.querySelector("audio");
    var controls = player.querySelector(".player-controls");
    if (!audio || !controls) return;
    controls.hidden = false;

    var posKey = "pos:" + audio.getAttribute("src");
    var speedBtn = controls.querySelector("[data-speed]");
    var speed = parseFloat(store("speed")) || 1;
    if (SPEEDS.indexOf(speed) < 0) speed = 1;
    speedBtn.textContent = fmtSpeed(speed);

    audio.addEventListener("loadedmetadata", function () {
      audio.playbackRate = speed;
      var saved = parseFloat(store(posKey));
      if (saved > 5 && saved < audio.duration - 5) audio.currentTime = saved;
    });
    audio.addEventListener("play", function () {
      audio.playbackRate = speed;
      document.querySelectorAll(".player audio").forEach(function (other) {
        if (other !== audio) other.pause();
      });
    });
    var lastSaved = 0;
    audio.addEventListener("timeupdate", function () {
      if (Math.abs(audio.currentTime - lastSaved) >= 5) {
        lastSaved = audio.currentTime;
        store(posKey, String(Math.floor(audio.currentTime)));
      }
    });
    audio.addEventListener("ended", function () { store(posKey, "0"); });

    controls.querySelectorAll("[data-skip]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var delta = parseFloat(btn.getAttribute("data-skip"));
        var max = isFinite(audio.duration) ? audio.duration : Infinity;
        audio.currentTime = Math.max(0, Math.min(max, (audio.currentTime || 0) + delta));
      });
    });
    speedBtn.addEventListener("click", function () {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      audio.playbackRate = speed;
      speedBtn.textContent = fmtSpeed(speed);
      store("speed", String(speed));
    });
  });

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      function done(ok) {
        btn.textContent = ok ? "已复制 ✓" : text;
        btn.classList.toggle("copied", ok);
        setTimeout(function () { btn.textContent = label; btn.classList.remove("copied"); }, 2000);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        done(ok);
      }
    });
  });
})();
