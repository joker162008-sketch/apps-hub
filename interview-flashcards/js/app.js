/* UI wiring. All scheduling/deck logic lives in sm2.js, deck.js, study.js, storage.js. */
(function () {
  'use strict';
  var SM2 = window.SM2, Deck = window.Deck, Study = window.Study, Store = window.IFCStore;

  var GRADES = [
    { q: 0, text: '完全想不起来' },
    { q: 1, text: '错误，看答案后想起' },
    { q: 2, text: '错误，但答案很眼熟' },
    { q: 3, text: '正确，但非常吃力' },
    { q: 4, text: '正确，稍有犹豫' },
    { q: 5, text: '完美回忆' }
  ];

  var opened = Store.open(window);
  var loaded = Store.load(opened.store);
  var state = loaded.state;
  var answerShown = false;
  var currentView = 'study';
  var displayedId = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function today() { return SM2.localToday(); }
  function cards() { return state.deckSource === 'custom' && state.cards ? state.cards : window.SEED_DECK.cards; }
  function cardById(id) {
    var list = cards();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function save() {
    try {
      Store.save(opened.store, state);
    } catch (e) {
      showBanner(['保存失败（可能是存储空间已满）：' + e.message]);
    }
  }

  function showBanner(lines) {
    var b = $('banner');
    if (!lines.length) { b.hidden = true; return; }
    b.textContent = lines.join('\n');
    b.hidden = false;
  }

  function filter() {
    return { categories: state.settings.categories, difficulties: state.settings.difficulties };
  }

  /* ---------- views ---------- */
  function switchView(name) {
    currentView = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.hidden = v.id !== 'view-' + name;
    });
    if (name === 'study') renderStudy();
    if (name === 'library') renderLibrary();
    if (name === 'stats') renderStats();
  }

  /* ---------- study ---------- */
  function buildChecks(container, list, selected, onChange) {
    container.textContent = '';
    list.forEach(function (item) {
      var label = el('label');
      var box = el('input');
      box.type = 'checkbox';
      box.value = item.key;
      box.checked = selected.indexOf(item.key) >= 0;
      box.addEventListener('change', function () {
        var vals = Array.prototype.filter.call(container.querySelectorAll('input'), function (i) { return i.checked; })
          .map(function (i) { return i.value; });
        onChange(vals);
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(' ' + item.label));
      container.appendChild(label);
    });
  }

  function activeSession() {
    var s = state.session;
    if (!s || s.date !== today()) return null;
    return Study.reconcile(s, cards());
  }

  function renderStudy() {
    var t = today();
    var c = Study.counts(cards(), state.progress, t, filter());
    var willNew = Math.min(c.fresh, state.settings.newLimit);
    $('study-summary').textContent = '今日到期复习 ' + c.due + ' 张 · 未学新卡 ' + c.fresh + ' 张（本轮最多 ' + willNew +
      ' 张）· 当前筛选共 ' + c.total + ' 张';
    var s = activeSession();
    state.session = s;
    var running = !!(s && s.queue.length);
    $('start-btn').textContent = running ? '继续学习' : '开始学习';
    $('end-btn').hidden = !running;
    if (running) renderCard(); else $('card-panel').hidden = true;
    $('done-panel').hidden = !(s && !s.queue.length && s.scheduled.length);
  }

  function startStudy() {
    var s = activeSession();
    if (!s || !s.queue.length) {
      var q = Study.buildQueue(cards(), state.progress, today(), filter(), state.settings.newLimit);
      if (!q.length) {
        $('study-summary').textContent = '当前筛选下没有到期或新的卡片。';
        return;
      }
      state.session = Study.startSession(q, today());
      save();
    }
    $('done-panel').hidden = true;
    answerShown = false;
    renderStudy();
  }

  function endStudy() {
    state.session = null;
    save();
    renderStudy();
  }

  function renderCard() {
    var s = state.session;
    var id = Study.current(s);
    var card = id && cardById(id);
    displayedId = card ? id : null;
    if (!card) { $('card-panel').hidden = true; return; }
    $('card-panel').hidden = false;
    var cat = $('card-category');
    cat.textContent = Deck.categoryLabel(card.category);
    cat.className = 'badge cat-' + card.category;
    $('card-difficulty').textContent = Deck.difficultyLabel(card.difficulty);
    var relearn = s.scheduled.indexOf(id) >= 0;
    $('card-mode').hidden = !relearn;
    $('session-progress').textContent = '剩余 ' + s.queue.length + ' · 已完成 ' + s.done;
    $('card-front').textContent = card.front;
    $('card-back').textContent = card.back;
    $('card-ref').textContent = card.ref ? '参考：' + card.ref : '';
    $('card-back-wrap').hidden = !answerShown;
    $('show-btn').hidden = answerShown;

    var grades = $('grades');
    grades.textContent = '';
    GRADES.forEach(function (g) {
      var b = el('button', g.q >= SM2.PASS_GRADE ? 'pass' : 'fail');
      b.type = 'button';
      b.appendChild(el('b', '', String(g.q)));
      b.appendChild(document.createTextNode(g.text));
      var hint;
      if (relearn) hint = g.q < SM2.RELEARN_BELOW ? '本轮再来一次' : '本轮通过';
      else {
        var next = SM2.review(state.progress[id], g.q, today());
        hint = '下次：' + next.interval + ' 天后' + (g.q < SM2.RELEARN_BELOW ? '，本轮再来一次' : '');
      }
      b.appendChild(el('small', '', hint));
      b.addEventListener('click', function () { gradeCurrent(g.q); });
      grades.appendChild(b);
    });
  }

  function showAnswer() {
    if (!state.session || !Study.current(state.session)) return;
    answerShown = true;
    renderCard();
  }

  function gradeCurrent(q) {
    if (!answerShown || !state.session || !Study.current(state.session)) return;
    if (Study.current(state.session) !== displayedId) { answerShown = false; renderStudy(); return; }
    var r = Study.grade(state.session, state.progress, q, today());
    state.session = r.session;
    state.progress = r.progress;
    answerShown = false;
    save();
    renderStudy();
  }

  /* ---------- library ---------- */
  function fillSelect(sel, list) {
    sel.textContent = '';
    var all = el('option', '', '全部');
    all.value = '';
    sel.appendChild(all);
    list.forEach(function (x) {
      var o = el('option', '', x.label);
      o.value = x.key;
      sel.appendChild(o);
    });
  }

  function progressText(st) {
    if (SM2.isNew(st)) return '新卡，尚未学习';
    return '下次复习 ' + st.due + ' · 间隔 ' + st.interval + ' 天 · EF ' + st.easiness.toFixed(2) +
      ' · 连续正确 ' + st.repetitions + ' · 复习 ' + st.reviews + ' 次 · 遗忘 ' + st.lapses + ' 次';
  }

  function renderLibrary() {
    var q = $('lib-search').value.trim().toLowerCase();
    var cat = $('lib-category').value, diff = $('lib-difficulty').value;
    var list = cards().filter(function (c) {
      if (cat && c.category !== cat) return false;
      if (diff && c.difficulty !== diff) return false;
      if (!q) return true;
      return (c.front + '\n' + c.back + '\n' + (c.tags || []).join(' ') + '\n' + c.id).toLowerCase().indexOf(q) >= 0;
    });
    $('lib-count').textContent = '显示 ' + list.length + ' / ' + cards().length + ' 张';
    var box = $('lib-list');
    box.textContent = '';
    list.forEach(function (c) {
      var d = el('details', 'item');
      var s = el('summary');
      var b1 = el('span', 'badge cat-' + c.category, Deck.categoryLabel(c.category));
      var b2 = el('span', 'badge muted', Deck.difficultyLabel(c.difficulty));
      s.appendChild(b1); s.appendChild(document.createTextNode(' ')); s.appendChild(b2);
      s.appendChild(document.createTextNode(' ' + c.front));
      d.appendChild(s);
      d.appendChild(el('div', 'back', c.back));
      var meta = 'id: ' + c.id + (c.tags ? ' · 标签: ' + c.tags.join(', ') : '') + (c.ref ? ' · 参考: ' + c.ref : '');
      d.appendChild(el('div', 'meta', meta));
      d.appendChild(el('div', 'meta', progressText(state.progress[c.id])));
      if (!SM2.isNew(state.progress[c.id])) {
        var r = el('button', 'secondary', '重置这张卡的进度');
        r.type = 'button';
        r.addEventListener('click', function () {
          delete state.progress[c.id];
          if (state.session) {
            state.session = Object.assign({}, state.session, {
              scheduled: state.session.scheduled.filter(function (x) { return x !== c.id; })
            });
          }
          save();
          renderLibrary();
        });
        d.appendChild(r);
      }
      box.appendChild(d);
    });
  }

  /* ---------- import / export ---------- */
  function download(obj, name) {
    var blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function doExport(withProgress) {
    var env = Deck.buildExport(cards(), withProgress ? state.progress : null, new Date().toISOString());
    download(env, 'interview-flashcards-' + today() + (withProgress ? '-with-progress' : '') + '.json');
  }

  function listIds(ids) {
    if (!ids.length) return '';
    var shown = ids.slice(0, 30).join(', ');
    return '：' + shown + (ids.length > 30 ? ' …（共 ' + ids.length + ' 个）' : '');
  }

  function doImport() {
    var report = $('import-report');
    var file = $('import-file').files[0];
    report.hidden = false;
    if (!file) { report.textContent = '请先选择一个 JSON 文件。'; return; }
    var mode = document.querySelector('input[name=import-mode]:checked').value;
    var withProgress = $('import-progress').checked;
    var reader = new FileReader();
    reader.onerror = function () { report.textContent = '读取文件失败。'; };
    reader.onload = function () {
      var p = Deck.parseImport(String(reader.result));
      if (!p.ok) { report.textContent = '导入失败：' + p.error + '\n本地数据未做任何修改。'; return; }
      if (!p.cards.length) {
        report.textContent = '导入失败：文件中没有有效卡片。\n' + rejectedLines(p).join('\n') + '\n本地数据未做任何修改。';
        return;
      }
      if (mode === 'replace' && p.rejected.length) {
        report.textContent = '导入失败：替换模式要求文件中的卡片全部有效，否则被拒绝卡片对应的本地卡片和进度会被删除。\n' +
          rejectedLines(p).join('\n') + '\n本地数据未做任何修改。请修正文件或改用合并模式。';
        return;
      }
      if (mode === 'replace' && !window.confirm('替换模式会删除卡组中不在文件里的卡片及其进度，确定吗？')) return;
      var m = Deck.mergeCards(cards(), p.cards, mode);
      if (m.cards.length > Deck.MAX_CARDS) {
        report.textContent = '导入失败：合并后共 ' + m.cards.length + ' 张，超过上限 ' + Deck.MAX_CARDS +
          ' 张（超过上限的卡组导出后无法再导入）。\n本地数据未做任何修改。';
        return;
      }
      state.deckSource = 'custom';
      state.cards = m.cards;
      var pr = Deck.pruneProgress(state.progress, m.cards);
      state.progress = pr.progress;
      var lines = ['导入完成（' + (mode === 'merge' ? '合并' : '替换') + '模式），卡组现有 ' + m.cards.length + ' 张。',
        '新增 ' + m.added.length + listIds(m.added),
        '更新内容 ' + m.updated.length + listIds(m.updated),
        '内容相同 ' + m.unchanged.length];
      if (mode === 'replace') lines.push('移除 ' + m.removed.length + listIds(m.removed));
      if (pr.dropped.length) lines.push('随卡片移除的学习进度 ' + pr.dropped.length + ' 条');
      if (withProgress) {
        if (!p.progress) lines.push('文件中没有学习进度，未导入进度。');
        else {
          var ids = Object.keys(p.progress);
          ids.forEach(function (id) { state.progress[id] = p.progress[id]; });
          lines.push('导入学习进度 ' + ids.length + ' 条');
        }
      } else if (p.progress) {
        lines.push('文件包含学习进度，但未勾选导入，已跳过。');
      }
      lines = lines.concat(rejectedLines(p));
      if (state.session && state.session.queue.length) lines.push('导入会结束当前学习轮次，请在「学习」页重新开始。');
      state.session = null;
      answerShown = false;
      save();
      report.textContent = lines.join('\n');
    };
    reader.readAsText(file);
  }

  function rejectedLines(p) {
    var out = [];
    if (p.rejected.length) {
      out.push('被拒绝的卡片 ' + p.rejected.length + ' 张：');
      p.rejected.forEach(function (r) {
        out.push('  第 ' + (r.index + 1) + ' 张' + (r.id ? '（' + r.id + '）' : '') + '：' + r.errors.join('；'));
      });
    }
    if (p.rejectedProgress.length) {
      out.push('被拒绝的进度记录 ' + p.rejectedProgress.length + ' 条：');
      p.rejectedProgress.forEach(function (r) { out.push('  ' + r.id + '：' + r.errors.join('；')); });
    }
    return out;
  }

  function restoreSeed() {
    if (!window.confirm('恢复内置卡组：自定义卡片会被移除，内置卡片的学习进度会保留。确定吗？')) return;
    state.deckSource = 'seed';
    state.cards = null;
    var pr = Deck.pruneProgress(state.progress, cards());
    state.progress = pr.progress;
    state.session = Study.reconcile(state.session, cards());
    save();
    $('reset-report').textContent = '已恢复内置卡组（' + cards().length + ' 张），移除了 ' + pr.dropped.length + ' 条不再对应卡片的进度。';
  }

  function resetProgress() {
    if (!window.confirm('清除全部学习进度？此操作无法撤销（建议先导出备份）。')) return;
    var n = Object.keys(state.progress).length;
    state.progress = {};
    state.session = null;
    save();
    $('reset-report').textContent = '已清除 ' + n + ' 条学习进度。';
  }

  /* ---------- stats ---------- */
  function renderStats() {
    var t = today(), week = SM2.addDays(t, 7);
    var body = $('stats-body');
    body.textContent = '';
    var rows = Deck.CATEGORIES.map(function (c) { return { label: c.label, key: c.key }; });
    rows.push({ label: '合计', key: null });
    rows.forEach(function (r) {
      var total = 0, learned = 0, due = 0, dueWeek = 0, efSum = 0;
      cards().forEach(function (card) {
        if (r.key && card.category !== r.key) return;
        total++;
        var st = state.progress[card.id];
        if (SM2.isNew(st)) return;
        learned++;
        efSum += st.easiness;
        if (st.due <= t) due++;
        if (st.due <= week) dueWeek++;
      });
      var tr = el('tr', r.key ? '' : 'total');
      [r.label, total, learned, due, dueWeek, learned ? (efSum / learned).toFixed(2) : '—'].forEach(function (v) {
        tr.appendChild(el('td', '', String(v)));
      });
      body.appendChild(tr);
    });
    $('stats-source').textContent = (state.deckSource === 'custom' ? '当前使用自定义卡组' : '当前使用内置卡组') +
      ' · 今天是 ' + t + (opened.persistent ? '' : ' · 注意：本地存储不可用，关闭页面后进度会丢失');
  }

  /* ---------- init ---------- */
  function init() {
    var warnings = loaded.warnings.slice();
    if (!opened.persistent) warnings.unshift('浏览器本地存储不可用（可能是隐私模式或 file:// 限制），本次学习进度不会被保存。可改用 README 中的本地服务器方式打开。');
    showBanner(warnings);

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { switchView(t.getAttribute('data-view')); });
    });
    buildChecks($('study-categories'), Deck.CATEGORIES, state.settings.categories, function (v) {
      state.settings.categories = v; save(); renderStudy();
    });
    buildChecks($('study-difficulties'), Deck.DIFFICULTIES, state.settings.difficulties, function (v) {
      state.settings.difficulties = v; save(); renderStudy();
    });
    var nl = $('new-limit');
    nl.value = state.settings.newLimit;
    nl.addEventListener('change', function () {
      var n = parseInt(nl.value, 10);
      if (!isFinite(n) || n < 0) n = 0;
      if (n > 500) n = 500;
      nl.value = n;
      state.settings.newLimit = n;
      save();
      renderStudy();
    });
    $('start-btn').addEventListener('click', startStudy);
    $('end-btn').addEventListener('click', endStudy);
    $('show-btn').addEventListener('click', showAnswer);

    fillSelect($('lib-category'), Deck.CATEGORIES);
    fillSelect($('lib-difficulty'), Deck.DIFFICULTIES);
    $('lib-search').addEventListener('input', renderLibrary);
    $('lib-category').addEventListener('change', renderLibrary);
    $('lib-difficulty').addEventListener('change', renderLibrary);

    $('export-cards').addEventListener('click', function () { doExport(false); });
    $('export-all').addEventListener('click', function () { doExport(true); });
    $('import-btn').addEventListener('click', doImport);
    $('restore-seed').addEventListener('click', restoreSeed);
    $('reset-progress').addEventListener('click', resetProgress);

    document.addEventListener('keydown', function (e) {
      if (currentView !== 'study' || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (!state.session || !Study.current(state.session) || $('card-panel').hidden) return;
      if (!answerShown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); showAnswer(); return; }
      if (answerShown && /^[0-5]$/.test(e.key)) { e.preventDefault(); gradeCurrent(parseInt(e.key, 10)); }
    });

    switchView('study');
  }

  init();
})();
