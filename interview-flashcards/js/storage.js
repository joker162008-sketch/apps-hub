/*
 * Browser-local persistence (localStorage). The backing store is injectable for tests.
 * If localStorage is unavailable, an in-memory store is used and `persistent` is false.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./deck.js'), require('./sm2.js'));
  } else {
    root.IFCStore = factory(root.Deck, root.SM2);
  }
})(typeof self !== 'undefined' ? self : this, function (Deck, SM2) {
  'use strict';

  var KEY = 'interview-flashcards.v1';

  function memoryStore() {
    var m = Object.create(null);
    return {
      getItem: function (k) { return k in m ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  function probe(store) {
    try {
      var k = KEY + '.probe';
      store.setItem(k, '1');
      store.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function emptyState() {
    return { deckSource: 'seed', cards: null, progress: {}, session: null, settings: { newLimit: 20, categories: [], difficulties: [] } };
  }

  /*
   * Load state. Corrupt or invalid parts are reset and reported in `warnings` (never silently).
   * cards === null means "use the built-in seed deck".
   */
  function load(store) {
    var state = emptyState();
    var warnings = [];
    var raw = null;
    try { raw = store.getItem(KEY); } catch (e) { warnings.push('无法读取本地存储：' + e.message); }
    if (raw === null) return { state: state, warnings: warnings };
    var data;
    try { data = JSON.parse(raw); } catch (e) {
      warnings.push('本地数据损坏，已重置为内置卡组。');
      return { state: state, warnings: warnings };
    }
    if (!data || typeof data !== 'object') return { state: state, warnings: ['本地数据格式错误，已重置。'] };

    if (data.deckSource === 'custom' && Array.isArray(data.cards)) {
      var good = [];
      data.cards.forEach(function (c, i) {
        var v = Deck.validateCard(c);
        if (v.ok) good.push(v.card);
        else warnings.push('本地第 ' + (i + 1) + ' 张卡片无效，已忽略：' + v.errors.join('；'));
      });
      state.deckSource = 'custom';
      state.cards = good;
    }
    if (data.progress && typeof data.progress === 'object') {
      Object.keys(data.progress).forEach(function (id) {
        var p = Deck.validateProgress(data.progress[id]);
        if (p.ok) state.progress[id] = p.state;
        else warnings.push('卡片 ' + id + ' 的学习进度无效，已重置：' + p.errors.join('；'));
      });
    }
    var s = data.session;
    if (s && SM2.isValidDate(s.date) && Array.isArray(s.queue) && Array.isArray(s.scheduled)) {
      state.session = {
        date: s.date,
        queue: s.queue.filter(function (x) { return typeof x === 'string'; }),
        scheduled: s.scheduled.filter(function (x) { return typeof x === 'string'; }),
        done: Number.isInteger(s.done) && s.done >= 0 ? s.done : 0
      };
    }
    var st = data.settings;
    if (st && typeof st === 'object') {
      if (Number.isInteger(st.newLimit) && st.newLimit >= 0 && st.newLimit <= 500) state.settings.newLimit = st.newLimit;
      if (Array.isArray(st.categories)) state.settings.categories = st.categories.filter(function (k) { return Deck.CATEGORY_KEYS.indexOf(k) >= 0; });
      if (Array.isArray(st.difficulties)) state.settings.difficulties = st.difficulties.filter(function (k) { return Deck.DIFFICULTY_KEYS.indexOf(k) >= 0; });
    }
    return { state: state, warnings: warnings };
  }

  function save(store, state) {
    var data = {
      deckSource: state.deckSource,
      cards: state.deckSource === 'custom' ? state.cards : null,
      progress: state.progress,
      session: state.session,
      settings: state.settings
    };
    store.setItem(KEY, JSON.stringify(data));
  }

  function clear(store) { store.removeItem(KEY); }

  function open(win) {
    try {
      if (win && win.localStorage && probe(win.localStorage)) return { store: win.localStorage, persistent: true };
    } catch (e) { /* fall through */ }
    return { store: memoryStore(), persistent: false };
  }

  return { KEY: KEY, memoryStore: memoryStore, emptyState: emptyState, load: load, save: save, clear: clear, open: open };
});
