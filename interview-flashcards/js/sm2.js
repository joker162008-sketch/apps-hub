/*
 * SM-2 spaced-repetition scheduling (P. A. Wozniak, 1987).
 * Pure functions only: no DOM, no storage, no clock. "today" is always passed in
 * as a local calendar date string "YYYY-MM-DD".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SM2 = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INITIAL_EF = 2.5;
  var MIN_EF = 1.3;
  var PASS_GRADE = 3;
  var RELEARN_BELOW = 4;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var DAY_MS = 86400000;

  function assertGrade(q) {
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 0 || q > 5) {
      throw new RangeError('SM-2 grade must be an integer 0-5, got ' + String(q));
    }
  }

  function parseDate(s) {
    var m = typeof s === 'string' ? DATE_RE.exec(s) : null;
    if (!m) throw new TypeError('date must be "YYYY-MM-DD", got ' + String(s));
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
      throw new TypeError('invalid calendar date ' + s);
    }
    return t;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function formatUTC(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function isValidDate(s) {
    try { parseDate(s); return true; } catch (e) { return false; }
  }

  function addDays(dateStr, days) {
    if (!Number.isInteger(days)) throw new TypeError('days must be an integer');
    return formatUTC(parseDate(dateStr) + days * DAY_MS);
  }

  function daysBetween(fromStr, toStr) {
    return Math.round((parseDate(toStr) - parseDate(fromStr)) / DAY_MS);
  }

  function localToday(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), floored at 1.3
  function nextEasiness(ef, q) {
    assertGrade(q);
    var e = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    return Math.max(MIN_EF, round6(e));
  }

  function newState() {
    return { repetitions: 0, easiness: INITIAL_EF, interval: 0, due: null, lastReview: null, reviews: 0, lapses: 0 };
  }

  /*
   * Apply one graded repetition. Returns a new state object; the input is not mutated.
   *  q >= 3: n += 1; I(1) = 1, I(2) = 6, I(n) = ceil(I(n-1) * EF) using the EF held
   *          before this repetition; then EF is updated with the formula above.
   *  q <  3: repetitions restart (n = 0, next interval 1 day); EF is left unchanged.
   */
  function review(state, q, today) {
    assertGrade(q);
    parseDate(today);
    var s = state ? state : newState();
    var ef = typeof s.easiness === 'number' ? s.easiness : INITIAL_EF;
    var reps = s.repetitions | 0;
    var prev = s.interval | 0;
    var out = {
      repetitions: reps,
      easiness: ef,
      interval: prev,
      due: s.due,
      lastReview: today,
      reviews: (s.reviews | 0) + 1,
      lapses: s.lapses | 0
    };
    if (q >= PASS_GRADE) {
      out.repetitions = reps + 1;
      if (out.repetitions === 1) out.interval = 1;
      else if (out.repetitions === 2) out.interval = 6;
      else out.interval = Math.ceil(round6(Math.max(prev, 1) * ef));
      out.easiness = nextEasiness(ef, q);
    } else {
      out.repetitions = 0;
      out.interval = 1;
      if (reps > 0) out.lapses += 1;
    }
    out.due = addDays(today, out.interval);
    return out;
  }

  function isNew(state) {
    return !state || !state.lastReview;
  }

  function isDue(state, today) {
    if (isNew(state)) return false;
    return state.due <= today;
  }

  return {
    INITIAL_EF: INITIAL_EF,
    MIN_EF: MIN_EF,
    PASS_GRADE: PASS_GRADE,
    RELEARN_BELOW: RELEARN_BELOW,
    nextEasiness: nextEasiness,
    newState: newState,
    review: review,
    isNew: isNew,
    isDue: isDue,
    addDays: addDays,
    daysBetween: daysBetween,
    isValidDate: isValidDate,
    localToday: localToday
  };
});
