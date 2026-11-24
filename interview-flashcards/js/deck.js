/*
 * Deck model: categories, difficulty levels, card validation, JSON import/export, merge.
 * Pure functions only. Imported data is treated as untrusted.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sm2.js'));
  } else {
    root.Deck = factory(root.SM2);
  }
})(typeof self !== 'undefined' ? self : this, function (SM2) {
  'use strict';

  var FORMAT = 'interview-flashcards';
  var VERSION = 1;
  var CATEGORIES = [
    { key: 'network', label: '网络' },
    { key: 'cloud', label: '云' },
    { key: 'security', label: '安全' },
    { key: 'management', label: '管理' }
  ];
  var DIFFICULTIES = [
    { key: 'basic', label: '基础' },
    { key: 'intermediate', label: '进阶' },
    { key: 'advanced', label: '高级' }
  ];
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var MAX_TEXT = 4000;
  var MAX_TAGS = 20;
  var MAX_CARDS = 5000;

  function keys(list) { return list.map(function (x) { return x.key; }); }
  var CATEGORY_KEYS = keys(CATEGORIES);
  var DIFFICULTY_KEYS = keys(DIFFICULTIES);

  function label(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
    return key;
  }
  function categoryLabel(k) { return label(CATEGORIES, k); }
  function difficultyLabel(k) { return label(DIFFICULTIES, k); }

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  function checkText(v, name, errors) {
    if (typeof v !== 'string' || v.trim() === '') errors.push(name + ' 不能为空');
    else if (v.length > MAX_TEXT) errors.push(name + ' 超过 ' + MAX_TEXT + ' 字符');
  }

  /* Returns { ok, card, errors }. card is a normalised copy holding only known fields. */
  function validateCard(raw) {
    var errors = [];
    if (!isPlainObject(raw)) return { ok: false, card: null, errors: ['卡片必须是 JSON 对象'] };
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) {
      errors.push('id 必须是 1-64 位字母、数字、- 或 _');
    }
    if (CATEGORY_KEYS.indexOf(raw.category) < 0) {
      errors.push('category 必须是 ' + CATEGORY_KEYS.join('/') + ' 之一');
    }
    if (DIFFICULTY_KEYS.indexOf(raw.difficulty) < 0) {
      errors.push('difficulty 必须是 ' + DIFFICULTY_KEYS.join('/') + ' 之一');
    }
    checkText(raw.front, 'front', errors);
    checkText(raw.back, 'back', errors);
    var tags = [];
    if (raw.tags !== undefined) {
      if (!Array.isArray(raw.tags) || raw.tags.length > MAX_TAGS ||
          !raw.tags.every(function (t) { return typeof t === 'string' && t.trim() !== '' && t.length <= 64; })) {
        errors.push('tags 必须是最多 ' + MAX_TAGS + ' 个非空字符串的数组');
      } else {
        tags = raw.tags.map(function (t) { return t.trim(); });
      }
    }
    if (raw.ref !== undefined && (typeof raw.ref !== 'string' || raw.ref.length > 300)) {
      errors.push('ref 必须是不超过 300 字符的字符串');
    }
    if (errors.length) return { ok: false, card: null, errors: errors };
    var card = {
      id: raw.id,
      category: raw.category,
      difficulty: raw.difficulty,
      front: raw.front.trim(),
      back: raw.back.trim()
    };
    if (tags.length) card.tags = tags;
    if (typeof raw.ref === 'string' && raw.ref.trim() !== '') card.ref = raw.ref.trim();
    return { ok: true, card: card, errors: [] };
  }

  function isNonNegInt(x) { return typeof x === 'number' && Number.isInteger(x) && x >= 0; }

  /* Progress entry = SM-2 state. Returns { ok, state, errors }. */
  function validateProgress(raw) {
    var errors = [];
    if (!isPlainObject(raw)) return { ok: false, state: null, errors: ['进度记录必须是 JSON 对象'] };
    if (!isNonNegInt(raw.repetitions)) errors.push('repetitions 必须是非负整数');
    if (typeof raw.easiness !== 'number' || !isFinite(raw.easiness) || raw.easiness < SM2.MIN_EF || raw.easiness > 10) {
      errors.push('easiness 必须在 ' + SM2.MIN_EF + ' 到 10 之间');
    }
    if (!isNonNegInt(raw.interval)) errors.push('interval 必须是非负整数');
    if (raw.due !== null && !SM2.isValidDate(raw.due)) errors.push('due 必须是 YYYY-MM-DD 或 null');
    if (raw.lastReview !== null && !SM2.isValidDate(raw.lastReview)) errors.push('lastReview 必须是 YYYY-MM-DD 或 null');
    if ((raw.due === null) !== (raw.lastReview === null)) errors.push('due 和 lastReview 必须同时为 null 或同时为日期');
    if (raw.reviews !== undefined && !isNonNegInt(raw.reviews)) errors.push('reviews 必须是非负整数');
    if (raw.lapses !== undefined && !isNonNegInt(raw.lapses)) errors.push('lapses 必须是非负整数');
    if (errors.length) return { ok: false, state: null, errors: errors };
    return {
      ok: true,
      errors: [],
      state: {
        repetitions: raw.repetitions,
        easiness: raw.easiness,
        interval: raw.interval,
        due: raw.due,
        lastReview: raw.lastReview,
        reviews: raw.reviews || 0,
        lapses: raw.lapses || 0
      }
    };
  }

  /*
   * Parse an import file. Accepts the export envelope or a bare array of cards.
   * Never drops anything silently: every rejected card / progress entry is listed with its reason.
   * Returns { ok, error, cards, rejected:[{index,id,errors}], progress, rejectedProgress:[{id,errors}] }
   */
  function parseImport(text) {
    var result = { ok: false, error: null, cards: [], rejected: [], progress: null, rejectedProgress: [] };
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      result.error = '不是合法的 JSON：' + e.message;
      return result;
    }
    var rawCards, rawProgress = null;
    if (Array.isArray(data)) {
      rawCards = data;
    } else if (isPlainObject(data)) {
      if (data.format !== FORMAT) {
        result.error = 'format 字段必须是 "' + FORMAT + '"';
        return result;
      }
      if (data.version !== VERSION) {
        result.error = '不支持的版本：' + String(data.version) + '（当前只支持 ' + VERSION + '）';
        return result;
      }
      if (!Array.isArray(data.cards)) {
        result.error = 'cards 必须是数组';
        return result;
      }
      rawCards = data.cards;
      if (data.progress !== undefined && data.progress !== null) {
        if (!isPlainObject(data.progress)) {
          result.error = 'progress 必须是对象（卡片 id → 进度）';
          return result;
        }
        rawProgress = data.progress;
      }
    } else {
      result.error = '顶层必须是对象或数组';
      return result;
    }
    if (rawCards.length > MAX_CARDS) {
      result.error = '卡片数量超过上限 ' + MAX_CARDS;
      return result;
    }
    var seen = Object.create(null);
    rawCards.forEach(function (raw, i) {
      var v = validateCard(raw);
      var id = isPlainObject(raw) && typeof raw.id === 'string' ? raw.id : null;
      if (!v.ok) {
        result.rejected.push({ index: i, id: id, errors: v.errors });
      } else if (seen[v.card.id]) {
        result.rejected.push({ index: i, id: id, errors: ['id 在文件内重复（保留第一张）'] });
      } else {
        seen[v.card.id] = true;
        result.cards.push(v.card);
      }
    });
    if (rawProgress) {
      result.progress = {};
      Object.keys(rawProgress).forEach(function (id) {
        if (!seen[id]) {
          result.rejectedProgress.push({ id: id, errors: ['文件中没有对应的有效卡片'] });
          return;
        }
        var p = validateProgress(rawProgress[id]);
        if (p.ok) result.progress[id] = p.state;
        else result.rejectedProgress.push({ id: id, errors: p.errors });
      });
    }
    result.ok = true;
    return result;
  }

  function sameCard(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /*
   * mode "merge": keep existing cards, add new ids, overwrite content of matching ids.
   * mode "replace": the deck becomes exactly the incoming cards.
   * Returns { cards, added:[ids], updated:[ids], unchanged:[ids], removed:[ids] }.
   */
  function mergeCards(existing, incoming, mode) {
    if (mode !== 'merge' && mode !== 'replace') throw new Error('mode must be merge or replace');
    var byId = Object.create(null);
    existing.forEach(function (c) { byId[c.id] = c; });
    var inIds = Object.create(null);
    var report = { cards: [], added: [], updated: [], unchanged: [], removed: [] };
    incoming.forEach(function (c) {
      inIds[c.id] = true;
      if (!byId[c.id]) report.added.push(c.id);
      else if (sameCard(byId[c.id], c)) report.unchanged.push(c.id);
      else report.updated.push(c.id);
    });
    if (mode === 'replace') {
      existing.forEach(function (c) { if (!inIds[c.id]) report.removed.push(c.id); });
      report.cards = incoming.slice();
    } else {
      var incomingById = Object.create(null);
      incoming.forEach(function (c) { incomingById[c.id] = c; });
      report.cards = existing.map(function (c) { return incomingById[c.id] || c; });
      incoming.forEach(function (c) { if (!byId[c.id]) report.cards.push(c); });
    }
    return report;
  }

  /* Drop progress for cards no longer in the deck; returns { progress, dropped:[ids] }. */
  function pruneProgress(progress, cards) {
    var ids = Object.create(null);
    cards.forEach(function (c) { ids[c.id] = true; });
    var out = {}, dropped = [];
    Object.keys(progress || {}).forEach(function (id) {
      if (ids[id]) out[id] = progress[id];
      else dropped.push(id);
    });
    return { progress: out, dropped: dropped };
  }

  function buildExport(cards, progress, exportedAt) {
    var env = { format: FORMAT, version: VERSION, exportedAt: exportedAt || null, cards: cards };
    if (progress) env.progress = pruneProgress(progress, cards).progress;
    return env;
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    CATEGORIES: CATEGORIES,
    DIFFICULTIES: DIFFICULTIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    DIFFICULTY_KEYS: DIFFICULTY_KEYS,
    categoryLabel: categoryLabel,
    difficultyLabel: difficultyLabel,
    validateCard: validateCard,
    validateProgress: validateProgress,
    MAX_CARDS: MAX_CARDS,
    parseImport: parseImport,
    mergeCards: mergeCards,
    pruneProgress: pruneProgress,
    buildExport: buildExport
  };
});
