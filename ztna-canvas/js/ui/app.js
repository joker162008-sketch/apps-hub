/* ztna-canvas browser UI: palette, drag-and-drop canvas, properties panel,
 * exports. All state lives in memory and localStorage; nothing leaves the page. */
(function (Z) {
  'use strict';

  const STORAGE_KEY = 'ztna-canvas:v1';
  const CANVAS_W = 2000;
  const CANVAS_H = 1400;
  const GRID = 10;
  const MAX_UNDO = 100;
  const G = Z.geometry;
  const M = Z.model;
  const C = Z.catalog;

  const state = { diagram: null, selected: null, undo: [], drag: null, pending: null, dirty: false };
  const $ = function (id) { return document.getElementById(id); };

  function snap(v) { return Math.round(v / GRID) * GRID; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setStatus(msg, isError) {
    const el = $('status-msg');
    el.textContent = msg || '';
    el.className = isError ? 'error' : '';
  }

  function pushUndo() {
    state.undoDirty = state.dirty;
    state.undo.push(M.serialize(state.diagram));
    state.undoEvicted = state.undo.length > MAX_UNDO ? state.undo.shift() : null;
    state.dirty = true;
  }

  /* Roll back a pushUndo() whose edit was rejected, including its dirty mark. */
  function cancelUndo() {
    state.undo.pop();
    if (state.undoEvicted) state.undo.unshift(state.undoEvicted);
    state.dirty = state.undoDirty;
  }

  function undo() {
    const prev = state.undo.pop();
    if (!prev) { setStatus('没有可撤销的操作'); return; }
    state.diagram = M.deserialize(prev).diagram;
    state.dirty = true;
    state.selected = null;
    render();
    setStatus('已撤销');
  }

  /* Write only after an edit (state.dirty), so selection-only renders in a stale tab do not overwrite newer saves. */
  function persist() {
    if (!state.dirty) return;
    try { localStorage.setItem(STORAGE_KEY, M.serialize(state.diagram)); state.dirty = false; } catch (err) { /* storage unavailable: retry on next render */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const r = M.deserialize(raw);
      return r.ok ? r.diagram : null;
    } catch (err) {
      return null;
    }
  }

  function svgEl() { return $('canvas').querySelector('svg'); }

  function toCanvasPoint(evt) {
    const rect = svgEl().getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (evt.clientY - rect.top) * (CANVAS_H / rect.height)
    };
  }

  function nodeAt(p) {
    for (let i = state.diagram.nodes.length - 1; i >= 0; i--) {
      const n = state.diagram.nodes[i];
      if (p.x >= n.x && p.x <= n.x + G.NODE_W && p.y >= n.y && p.y <= n.y + G.NODE_H) return n;
    }
    return null;
  }

  function selectedItem() {
    const id = state.selected;
    if (!id) return null;
    if (id[0] === 'n') return { kind: 'node', item: M.findNode(state.diagram, id) };
    if (id[0] === 'e') return { kind: 'edge', item: M.findEdge(state.diagram, id) };
    if (id[0] === 'z') return { kind: 'zone', item: M.findZone(state.diagram, id) };
    return null;
  }

  /* ---------- rendering ---------- */

  function render() {
    $('canvas').innerHTML = Z.svg.renderSvg(state.diagram, {
      interactive: true, selected: state.selected, width: CANVAS_W, height: CANVAS_H, pending: state.pending
    });
    if (state.drag) return; /* keep dragging smooth; side panels refresh on drop */
    renderSide();
    persist();
  }

  function renderSide() {
    const d = state.diagram;
    if (document.activeElement !== $('title-input')) $('title-input').value = d.title;
    renderProps();
    const a = Z.analysis.analyze(d);
    const list = $('findings');
    list.innerHTML = '';
    if (!a.findings.length) {
      const li = document.createElement('li');
      li.className = 'none';
      li.textContent = '未发现问题';
      list.appendChild(li);
    }
    a.findings.forEach(function (f) {
      const li = document.createElement('li');
      li.className = 'sev-' + f.severity;
      li.textContent = '[' + Z.analysis.SEVERITY[f.severity].name + '] ' + f.code + (f.refs.length ? ' · ' + f.refs.join(', ') : '') + ' — ' + f.message;
      if (f.refs[0]) li.addEventListener('click', function () { state.selected = f.refs[0]; render(); });
      list.appendChild(li);
    });
    $('findings-count').textContent = '(' + a.findings.length + ')';
    const md = Z.notes.generateNotes(d);
    $('notes-preview').textContent = md;
    const cn = Z.consistency.checkNotes(d, md);
    const cs = Z.consistency.checkSvg(d, Z.svg.renderSvg(d));
    const badge = $('consistency-badge');
    const ok = cn.ok && cs.ok;
    badge.textContent = ok ? '一致性检查：通过' : '一致性检查：未通过 (' + (cn.errors.length + cs.errors.length) + ')';
    badge.className = 'badge ' + (ok ? 'ok' : 'bad');
    badge.title = ok ? '设计说明与 SVG 均与画布数据逐项一致' : cn.errors.concat(cs.errors).join('\n');
    $('status-counts').textContent = '组件 ' + d.nodes.length + ' · 连线 ' + d.edges.length + ' · 信任边界 ' + d.zones.length + ' · 策略执行点 ' + a.peps.length;
  }

  function row(label, control) {
    const div = document.createElement('div');
    div.className = 'props-row';
    const l = document.createElement('label');
    l.textContent = label;
    div.appendChild(l);
    if (typeof control === 'string') {
      const span = document.createElement('span');
      span.className = 'ro';
      span.textContent = control;
      div.appendChild(span);
    } else {
      if (control.id) l.htmlFor = control.id;
      div.appendChild(control);
    }
    return div;
  }

  function input(id, value, onCommit, type) {
    const el = document.createElement('input');
    el.id = id;
    el.type = type || 'text';
    el.value = value;
    if (!type) el.maxLength = M.MAX_LABEL;
    el.addEventListener('change', function () { onCommit(el.value); });
    return el;
  }

  function select(id, options, value, onChange) {
    const el = document.createElement('select');
    el.id = id;
    options.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o[0];
      opt.textContent = o[1];
      if (o[0] === value) opt.selected = true;
      el.appendChild(opt);
    });
    if (onChange) el.addEventListener('change', function () { onChange(el.value); });
    return el;
  }

  function button(text, onClick, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  }

  function mutate(fn) {
    pushUndo();
    fn();
    render();
  }

  function kindOptions() {
    return Object.keys(C.EDGE_KINDS).map(function (k) { return [k, C.EDGE_KINDS[k].name + ' (' + C.EDGE_KINDS[k].en + ')']; });
  }

  function renderProps() {
    const box = $('props');
    box.innerHTML = '';
    const sel = selectedItem();
    const d = state.diagram;
    if (!sel || !sel.item) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '选中组件、连线或信任边界以编辑属性。Delete 删除选中项，Ctrl+Z 撤销，方向键微调组件位置。';
      box.appendChild(p);
      return;
    }
    const actions = document.createElement('div');
    actions.className = 'props-actions';
    if (sel.kind === 'node') {
      const n = sel.item;
      const c = C.component(n.type);
      const z = G.zoneOfNode(d, n);
      box.appendChild(row('ID', n.id));
      box.appendChild(row('名称', input('prop-label', n.label, function (v) { mutate(function () { M.renameNode(d, n.id, v); }); })));
      box.appendChild(row('类型', c.name + ' (' + c.en + ')'));
      box.appendChild(row('角色', C.ROLES[c.role].name + ' (' + C.ROLES[c.role].en + ')'));
      box.appendChild(row('信任边界', z ? z.id + ' ' + z.name : '—（未放入边界）'));
      const others = d.nodes.filter(function (o) { return o.id !== n.id; }).map(function (o) { return [o.id, o.id + ' ' + o.label]; });
      if (others.length) {
        const target = select('prop-connect-target', others, others[0][0]);
        const kind = select('prop-connect-kind', [['', '自动判断类型']].concat(kindOptions()), '');
        box.appendChild(row('连接到', target));
        box.appendChild(row('连线类型', kind));
        actions.appendChild(button('添加连线', function () {
          pushUndo();
          const r = M.addEdge(d, n.id, target.value, kind.value || undefined, '');
          if (!r.ok) { cancelUndo(); setStatus(r.error, true); return; }
          state.selected = r.edge.id;
          render();
          setStatus('已添加连线 ' + r.edge.id);
        }));
      }
      actions.appendChild(button('删除组件', function () { mutate(function () { M.removeNode(d, n.id); state.selected = null; }); }, 'danger'));
    } else if (sel.kind === 'edge') {
      const e = sel.item;
      const a = M.findNode(d, e.from);
      const b = M.findNode(d, e.to);
      box.appendChild(row('ID', e.id));
      box.appendChild(row('方向', a.id + ' ' + a.label + ' → ' + b.id + ' ' + b.label));
      box.appendChild(row('类型', select('prop-edge-kind', kindOptions(), e.kind, function (v) {
        pushUndo();
        const dup = d.edges.some(function (x) { return x.id !== e.id && x.from === e.from && x.to === e.to && x.kind === v; });
        if (dup) { cancelUndo(); setStatus('相同方向与类型的连线已存在', true); render(); return; }
        M.updateEdge(d, e.id, { kind: v });
        render();
      })));
      box.appendChild(row('说明', input('prop-edge-label', e.label, function (v) { mutate(function () { M.updateEdge(d, e.id, { label: v }); }); })));
      actions.appendChild(button('删除连线', function () { mutate(function () { M.removeEdge(d, e.id); state.selected = null; }); }, 'danger'));
    } else {
      const z = sel.item;
      const trust = Object.keys(C.TRUST_LEVELS).map(function (k) { return [k, C.TRUST_LEVELS[k].name + ' (' + C.TRUST_LEVELS[k].en + ')']; });
      box.appendChild(row('ID', z.id));
      box.appendChild(row('名称', input('prop-zone-name', z.name, function (v) { mutate(function () { M.updateZone(d, z.id, { name: v }); }); })));
      box.appendChild(row('信任级别', select('prop-zone-trust', trust, z.trust, function (v) { mutate(function () { M.updateZone(d, z.id, { trust: v }); }); })));
      box.appendChild(row('宽度', input('prop-zone-w', String(z.w), function (v) { mutate(function () { M.updateZone(d, z.id, { w: clamp(Number(v) || 0, 120, CANVAS_W - z.x) }); }); }, 'number')));
      box.appendChild(row('高度', input('prop-zone-h', String(z.h), function (v) { mutate(function () { M.updateZone(d, z.id, { h: clamp(Number(v) || 0, 80, CANVAS_H - z.y) }); }); }, 'number')));
      const members = Z.analysis.analyze(d).boundaries.find(function (b) { return b.id === z.id; }).members;
      box.appendChild(row('包含组件', members.length ? members.join(', ') : '—'));
      actions.appendChild(button('删除信任边界', function () { mutate(function () { M.removeZone(d, z.id); state.selected = null; }); }, 'danger'));
    }
    box.appendChild(actions);
  }

  /* ---------- palette ---------- */

  function buildPalette() {
    const root = $('palette-groups');
    C.ROLE_ORDER.forEach(function (role) {
      const items = C.COMPONENTS.filter(function (c) { return c.role === role; });
      if (!items.length) return;
      const h = document.createElement('h3');
      h.textContent = C.ROLES[role].name + ' · ' + C.ROLES[role].en;
      root.appendChild(h);
      items.forEach(function (c) { root.appendChild(paletteItem(c.type, c.name, c.en, C.ROLES[role].color, false)); });
    });
    const h = document.createElement('h3');
    h.textContent = '信任边界 · Trust Boundary';
    root.appendChild(h);
    root.appendChild(paletteItem('zone', '信任边界', 'Trust Zone', null, true));
  }

  function paletteItem(type, name, en, color, isZone) {
    const el = document.createElement('div');
    el.className = 'pal-item' + (isZone ? ' zone-item' : '');
    el.draggable = true;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.dataset.type = type;
    el.title = '拖到画布，或点击添加';
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (color) dot.style.background = color;
    const label = document.createElement('span');
    label.textContent = name;
    const small = document.createElement('span');
    small.className = 'en';
    small.textContent = en;
    el.appendChild(dot);
    el.appendChild(label);
    el.appendChild(small);
    el.addEventListener('dragstart', function (evt) {
      evt.dataTransfer.setData('text/plain', 'ztna:' + type);
      evt.dataTransfer.effectAllowed = 'copy';
    });
    el.addEventListener('click', function () { addFromPalette(type, null); });
    el.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); addFromPalette(type, null); }
    });
    return el;
  }

  function freeSpot(isZone) {
    const w = isZone ? 360 : G.NODE_W;
    const h = isZone ? 240 : G.NODE_H;
    for (let y = 60; y < CANVAS_H - h; y += 100) {
      for (let x = 60; x < CANVAS_W - w; x += 200) {
        const hit = isZone
          ? state.diagram.zones.some(function (z) { return Math.abs(z.x - x) < 40 && Math.abs(z.y - y) < 40; })
          : state.diagram.nodes.some(function (n) { return Math.abs(n.x - x) < G.NODE_W + 10 && Math.abs(n.y - y) < G.NODE_H + 10; });
        if (!hit) return { x: x, y: y };
      }
    }
    return { x: 60, y: 60 };
  }

  function addFromPalette(type, point) {
    pushUndo();
    let id;
    if (type === 'zone') {
      const p = point ? { x: snap(point.x - 20), y: snap(point.y - 15) } : freeSpot(true);
      const z = M.addZone(state.diagram, '信任边界 ' + (state.diagram.zones.length + 1), 'untrusted', clamp(p.x, 0, CANVAS_W - 360), clamp(p.y, 0, CANVAS_H - 240), 360, 240);
      if (!z) { cancelUndo(); setStatus('信任边界数量已达上限 ' + M.MAX_ITEMS, true); return; }
      id = z.id;
    } else {
      const p = point ? { x: snap(point.x - G.NODE_W / 2), y: snap(point.y - G.NODE_H / 2) } : freeSpot();
      const n = M.addNode(state.diagram, type, clamp(p.x, 0, CANVAS_W - G.NODE_W), clamp(p.y, 0, CANVAS_H - G.NODE_H));
      if (!n) { cancelUndo(); setStatus('组件数量已达上限 ' + M.MAX_ITEMS, true); return; }
      id = n.id;
    }
    state.selected = id;
    render();
    setStatus('已添加 ' + id);
  }

  /* ---------- canvas interaction ---------- */

  function onCanvasPointerDown(evt) {
    if (evt.button !== 0) return;
    const t = evt.target;
    const p = toCanvasPoint(evt);
    const d = state.diagram;
    const port = t.closest('.port');
    const resize = t.closest('.zone-resize');
    const nodeG = t.closest('.node');
    const edgeG = t.closest('.edge');
    const zoneBar = t.closest('.zone-bar');
    const zoneG = t.closest('.zone');
    evt.preventDefault();
    if (port) {
      const n = M.findNode(d, port.getAttribute('data-port-for'));
      state.drag = { mode: 'connect', from: n.id };
      state.pending = { x1: n.x + G.NODE_W, y1: n.y + G.NODE_H / 2, x2: p.x, y2: p.y };
      state.selected = n.id;
    } else if (resize) {
      const z = M.findZone(d, resize.getAttribute('data-resize-for'));
      state.drag = { mode: 'resize', id: z.id, start: p, w: z.w, h: z.h, snapshot: M.serialize(d), moved: false };
      state.selected = z.id;
    } else if (nodeG) {
      const n = M.findNode(d, nodeG.getAttribute('data-node-id'));
      state.drag = { mode: 'node', id: n.id, dx: p.x - n.x, dy: p.y - n.y, snapshot: M.serialize(d), moved: false };
      state.selected = n.id;
    } else if (edgeG) {
      state.selected = edgeG.getAttribute('data-edge-id');
    } else if (zoneG) {
      const z = M.findZone(d, zoneG.getAttribute('data-zone-id'));
      state.selected = z.id;
      if (zoneBar) {
        const members = Z.analysis.analyze(d).boundaries.find(function (b) { return b.id === z.id; }).members;
        const offsets = members.map(function (id) { const n = M.findNode(d, id); return { id: id, x: n.x - z.x, y: n.y - z.y }; });
        state.drag = { mode: 'zone', id: z.id, dx: p.x - z.x, dy: p.y - z.y, members: offsets, snapshot: M.serialize(d), moved: false };
      }
    } else {
      state.selected = null;
    }
    render();
  }

  function onPointerMove(evt) {
    const dr = state.drag;
    if (!dr) return;
    const p = toCanvasPoint(evt);
    const d = state.diagram;
    if (dr.mode === 'connect') {
      state.pending.x2 = p.x;
      state.pending.y2 = p.y;
    } else if (dr.mode === 'node') {
      M.moveNode(d, dr.id, clamp(snap(p.x - dr.dx), 0, CANVAS_W - G.NODE_W), clamp(snap(p.y - dr.dy), 0, CANVAS_H - G.NODE_H));
      dr.moved = true;
    } else if (dr.mode === 'zone') {
      const z = M.findZone(d, dr.id);
      const nx = clamp(snap(p.x - dr.dx), 0, CANVAS_W - z.w);
      const ny = clamp(snap(p.y - dr.dy), 0, CANVAS_H - z.h);
      M.updateZone(d, z.id, { x: nx, y: ny });
      dr.members.forEach(function (m) {
        M.moveNode(d, m.id, clamp(nx + m.x, 0, CANVAS_W - G.NODE_W), clamp(ny + m.y, 0, CANVAS_H - G.NODE_H));
      });
      dr.moved = true;
    } else if (dr.mode === 'resize') {
      const rz = M.findZone(d, dr.id);
      M.updateZone(d, dr.id, { w: clamp(snap(dr.w + p.x - dr.start.x), 120, CANVAS_W - rz.x), h: clamp(snap(dr.h + p.y - dr.start.y), 80, CANVAS_H - rz.y) });
      dr.moved = true;
    }
    render();
  }

  function onPointerUp(evt) {
    const dr = state.drag;
    if (!dr) return;
    state.drag = null;
    if (dr.mode === 'connect') {
      state.pending = null;
      const target = nodeAt(toCanvasPoint(evt));
      if (target && target.id !== dr.from) {
        pushUndo();
        const r = M.addEdge(state.diagram, dr.from, target.id, undefined, '');
        if (r.ok) {
          state.selected = r.edge.id;
          setStatus('已添加连线 ' + r.edge.id + '：' + dr.from + ' → ' + target.id);
        } else {
          cancelUndo();
          setStatus(r.error, true);
        }
      }
    } else if (dr.moved) {
      state.undo.push(dr.snapshot);
      if (state.undo.length > MAX_UNDO) state.undo.shift();
      state.dirty = true;
    }
    render();
  }

  function onKeyDown(evt) {
    const tag = (evt.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z') { evt.preventDefault(); undo(); return; }
    const sel = selectedItem();
    if (!sel || !sel.item) return;
    if (evt.key === 'Delete' || evt.key === 'Backspace') {
      evt.preventDefault();
      mutate(function () {
        if (sel.kind === 'node') M.removeNode(state.diagram, sel.item.id);
        else if (sel.kind === 'edge') M.removeEdge(state.diagram, sel.item.id);
        else M.removeZone(state.diagram, sel.item.id);
        state.selected = null;
      });
      return;
    }
    const step = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] }[evt.key];
    if (step && sel.kind === 'node') {
      evt.preventDefault();
      const n = sel.item;
      mutate(function () { M.moveNode(state.diagram, n.id, clamp(n.x + step[0], 0, CANVAS_W - G.NODE_W), clamp(n.y + step[1], 0, CANVAS_H - G.NODE_H)); });
    }
  }

  /* ---------- import / export ---------- */

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function baseName() { return Z.util.safeFileName(state.diagram.title); }

  function exportSvg() {
    const d = state.diagram;
    const svg = Z.svg.renderSvg(d);
    const check = Z.consistency.checkSvg(d, svg);
    if (!check.ok) { setStatus('SVG 一致性检查未通过：' + check.errors[0], true); return; }
    download(baseName() + '.svg', new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    setStatus('已导出 SVG（一致性检查通过）');
  }

  function exportNotes() {
    const d = state.diagram;
    const md = Z.notes.generateNotes(d);
    const check = Z.consistency.checkNotes(d, md);
    if (!check.ok) { setStatus('设计说明一致性检查未通过：' + check.errors[0], true); return; }
    download(baseName() + '.design-notes.md', new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    setStatus('已导出设计说明（一致性检查通过）');
  }

  function exportPng() {
    const d = state.diagram;
    const svg = Z.svg.renderSvg(d);
    const check = Z.consistency.checkSvg(d, svg);
    if (!check.ok) { setStatus('SVG 一致性检查未通过：' + check.errors[0], true); return; }
    setStatus('正在生成 PNG…');
    Z.png.svgToPngBlob(svg, 2).then(function (blob) {
      download(baseName() + '.png', blob);
      setStatus('已导出 PNG（2 倍分辨率）');
    }, function (err) { setStatus('PNG 导出失败：' + err.message, true); });
  }

  function exportJson() {
    download(baseName() + '.ztna.json', new Blob([M.serialize(state.diagram)], { type: 'application/json' }));
    setStatus('已导出 JSON');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = function () {
      const r = M.deserialize(String(reader.result));
      if (!r.ok) { setStatus('导入失败：' + r.errors.slice(0, 3).join('；'), true); return; }
      pushUndo();
      state.diagram = r.diagram;
      state.selected = null;
      render();
      setStatus('已导入 ' + file.name);
    };
    reader.onerror = function () { setStatus('读取文件失败', true); };
    reader.readAsText(file);
  }

  function loadPreset(id) {
    const d = Z.presets.getPreset(id);
    if (!d) return;
    if (state.diagram.nodes.length && !window.confirm('载入预设会替换当前画布（可撤销），继续？')) return;
    pushUndo();
    state.diagram = d;
    state.selected = null;
    render();
    setStatus('已载入预设：' + Z.presets.PRESETS.find(function (p) { return p.id === id; }).name);
  }

  /* ---------- boot ---------- */

  function bind() {
    const canvas = $('canvas');
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('dragover', function (evt) { evt.preventDefault(); evt.dataTransfer.dropEffect = 'copy'; canvas.classList.add('drop-target'); });
    canvas.addEventListener('dragleave', function () { canvas.classList.remove('drop-target'); });
    canvas.addEventListener('drop', function (evt) {
      evt.preventDefault();
      canvas.classList.remove('drop-target');
      const data = evt.dataTransfer.getData('text/plain');
      if (data.indexOf('ztna:') !== 0) return;
      const type = data.slice(5);
      if (type !== 'zone' && !C.component(type)) return;
      addFromPalette(type, toCanvasPoint(evt));
    });
    $('title-input').addEventListener('change', function (evt) {
      const v = evt.target.value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, M.MAX_TITLE);
      mutate(function () { state.diagram.title = v || '未命名零信任架构'; });
    });
    $('btn-new').addEventListener('click', function () {
      if (state.diagram.nodes.length && !window.confirm('新建会清空当前画布（可撤销），继续？')) return;
      mutate(function () { state.diagram = M.createDiagram(); state.selected = null; });
      setStatus('已新建空白画布');
    });
    $('btn-undo').addEventListener('click', undo);
    const presetSel = $('preset-select');
    Z.presets.PRESETS.forEach(function (p) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      o.title = p.description;
      presetSel.appendChild(o);
    });
    presetSel.addEventListener('change', function () { const v = presetSel.value; presetSel.value = ''; if (v) loadPreset(v); });
    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', function (evt) {
      const f = evt.target.files[0];
      if (f) importJson(f);
      evt.target.value = '';
    });
    $('btn-export-json').addEventListener('click', exportJson);
    $('btn-export-svg').addEventListener('click', exportSvg);
    $('btn-export-png').addEventListener('click', exportPng);
    $('btn-export-md').addEventListener('click', exportNotes);
  }

  function boot() {
    state.diagram = restore();
    if (!state.diagram) { state.diagram = Z.presets.getPreset('remote-work'); state.dirty = true; }
    buildPalette();
    bind();
    render();
    setStatus('就绪 · 所有数据仅保存在本机浏览器 (localStorage)');
  }

  Z.app = { state: state, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.ZTNA = globalThis.ZTNA || {});
