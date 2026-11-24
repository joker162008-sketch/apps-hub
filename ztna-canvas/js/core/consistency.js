/* Consistency checker: parses exported design notes (Markdown) and SVG back
 * into structured data and compares them item by item with the canvas data.
 * Expected values are rebuilt here from the raw diagram (catalog + geometry),
 * not from notes.js, so a formatting bug in either side is caught. */
(function (Z) {
  'use strict';

  const SECTIONS = [
    ['stats', '## 统计'],
    ['inventory', '## 1. 组件清单'],
    ['boundaries', '## 2. 信任边界'],
    ['peps', '## 3. 策略执行点'],
    ['connections', '## 4. 连线'],
    ['findings', '## 5. 检查提示']
  ];

  function parseSections(md) {
    const lines = md.split(/\r?\n/);
    const out = { title: null, fingerprint: null, sections: {} };
    let cur = null;
    lines.forEach(function (line) {
      if (out.title === null && line.indexOf('# 设计说明：') === 0) out.title = Z.util.unescapeMdText(line.slice('# 设计说明：'.length));
      const fp = /数据指纹 \(FNV-1a\)：`([0-9a-f]{8})`/.exec(line);
      if (fp) out.fingerprint = fp[1];
      if (line.indexOf('## ') === 0) {
        cur = null;
        SECTIONS.forEach(function (s) { if (line.indexOf(s[1]) === 0) cur = s[0]; });
        if (cur) out.sections[cur] = { rows: [], lines: [], seen: true, headerSkipped: 0 };
        return;
      }
      if (!cur) return;
      const sec = out.sections[cur];
      sec.lines.push(line);
      if (/^\s*\|/.test(line)) {
        if (sec.headerSkipped < 2) { sec.headerSkipped++; return; }
        sec.rows.push(Z.util.splitMdRow(line));
      }
    });
    return out;
  }

  function parseList(cell) {
    if (cell === '—') return [];
    return cell.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function sameList(a, b) {
    return a.length === b.length && a.every(function (v, i) { return v === b[i]; });
  }

  /* Rows keyed by first cell; reports missing, extra, duplicate and order issues. */
  function matchRows(section, label, expectedIds, rows, errors) {
    const byId = {};
    rows.forEach(function (r) {
      if (byId[r[0]]) errors.push(label + '：重复条目 ' + r[0]);
      byId[r[0]] = r;
    });
    expectedIds.forEach(function (id) { if (!byId[id]) errors.push(label + '：缺少 ' + id + '（画布中存在）'); });
    rows.forEach(function (r) { if (expectedIds.indexOf(r[0]) < 0) errors.push(label + '：多出 ' + r[0] + '（画布中不存在）'); });
    if (rows.length === expectedIds.length && !sameList(rows.map(function (r) { return r[0]; }), expectedIds)) {
      errors.push(label + '：条目顺序与画布 ID 顺序不一致');
    }
    return byId;
  }

  function cmp(errors, label, id, field, actual, expected) {
    if (actual !== expected) errors.push(label + '：' + id + ' 的「' + field + '」为「' + actual + '」，画布为「' + expected + '」');
  }

  function checkNotes(diagram, md) {
    const C = Z.catalog;
    const U = Z.util;
    const errors = [];
    const p = parseSections(String(md));
    const sortById = function (list) { return list.slice().sort(function (a, b) { return U.compareIds(a.id, b.id); }); };
    const nodes = sortById(diagram.nodes);
    const edges = sortById(diagram.edges);
    const zones = sortById(diagram.zones);
    const nodeById = {};
    nodes.forEach(function (n) { nodeById[n.id] = n; });
    const zoneById = {};
    zones.forEach(function (z) { zoneById[z.id] = z; });
    const zoneOf = {};
    nodes.forEach(function (n) { const z = Z.geometry.zoneOfNode(diagram, n); zoneOf[n.id] = z ? z.id : null; });
    const zoneRef = function (id) { return id ? id + ' ' + zoneById[id].name : '—'; };
    const named = function (o) { return o.name + ' (' + o.en + ')'; };
    const a = Z.analysis.analyze(diagram);

    if (p.title !== diagram.title) errors.push('标题：说明为「' + p.title + '」，画布为「' + diagram.title + '」');
    if (p.fingerprint !== Z.model.fingerprint(diagram)) errors.push('数据指纹不一致：说明为 ' + p.fingerprint + '，画布为 ' + Z.model.fingerprint(diagram));
    SECTIONS.forEach(function (s) { if (!p.sections[s[0]]) errors.push('缺少章节：' + s[1]); });
    if (errors.some(function (e) { return e.indexOf('缺少章节') === 0; })) return { ok: false, errors: errors };
    const S = p.sections;

    const pepIds = nodes.filter(function (n) { return C.roleOf(n.type) === 'pep'; }).map(function (n) { return n.id; });
    const stats = {};
    S.stats.rows.forEach(function (r) { stats[r[0]] = r[1]; });
    cmp(errors, '统计', '组件', '数量', stats['组件'], String(nodes.length));
    cmp(errors, '统计', '连线', '数量', stats['连线'], String(edges.length));
    cmp(errors, '统计', '信任边界', '数量', stats['信任边界'], String(zones.length));
    cmp(errors, '统计', '策略执行点', '数量', stats['策略执行点'], String(pepIds.length));
    cmp(errors, '统计', '检查提示', '数量', stats['检查提示'], String(a.findings.length));

    const inv = matchRows('inventory', '组件清单', nodes.map(function (n) { return n.id; }), S.inventory.rows, errors);
    nodes.forEach(function (n) {
      const r = inv[n.id];
      if (!r) return;
      const c = C.component(n.type);
      cmp(errors, '组件清单', n.id, '名称', r[1], n.label);
      cmp(errors, '组件清单', n.id, '类型', r[2], named(c));
      cmp(errors, '组件清单', n.id, '角色', r[3], named(C.ROLES[c.role]));
      cmp(errors, '组件清单', n.id, '所在信任边界', r[4], zoneRef(zoneOf[n.id]));
      cmp(errors, '组件清单', n.id, '位置', r[5], n.x + ', ' + n.y);
    });

    const bnd = matchRows('boundaries', '信任边界', zones.map(function (z) { return z.id; }), S.boundaries.rows, errors);
    zones.forEach(function (z) {
      const r = bnd[z.id];
      if (!r) return;
      cmp(errors, '信任边界', z.id, '名称', r[1], z.name);
      cmp(errors, '信任边界', z.id, '信任级别', r[2], named(C.TRUST_LEVELS[z.trust]));
      const members = nodes.filter(function (n) { return zoneOf[n.id] === z.id; }).map(function (n) { return n.id; });
      cmp(errors, '信任边界', z.id, '包含组件', parseList(r[3]).join(', '), members.join(', '));
    });
    const unzonedLine = S.boundaries.lines.find(function (l) { return l.indexOf('未归属任何信任边界的组件：') === 0; });
    const unzoned = nodes.filter(function (n) { return zoneOf[n.id] === null; }).map(function (n) { return n.id; });
    if (!unzonedLine) errors.push('信任边界：缺少「未归属任何信任边界的组件」一行');
    else cmp(errors, '信任边界', '未归属', '组件', parseList(unzonedLine.slice('未归属任何信任边界的组件：'.length)).join(', '), unzoned.join(', '));

    const pep = matchRows('peps', '策略执行点', pepIds, S.peps.rows, errors);
    a.peps.forEach(function (x) {
      const r = pep[x.id];
      if (!r) return;
      const n = nodeById[x.id];
      cmp(errors, '策略执行点', x.id, '名称', r[1], n.label);
      cmp(errors, '策略执行点', x.id, '类型', r[2], named(C.component(n.type)));
      cmp(errors, '策略执行点', x.id, '所在信任边界', r[3], zoneRef(zoneOf[n.id]));
      cmp(errors, '策略执行点', x.id, '决策来源', parseList(r[4]).join(', '), x.pdps.join(', '));
      cmp(errors, '策略执行点', x.id, '保护的资源', parseList(r[5]).join(', '), x.resources.join(', '));
    });

    const con = matchRows('connections', '连线', edges.map(function (e) { return e.id; }), S.connections.rows, errors);
    edges.forEach(function (e) {
      const r = con[e.id];
      if (!r) return;
      cmp(errors, '连线', e.id, '源', r[1], e.from + ' ' + nodeById[e.from].label);
      cmp(errors, '连线', e.id, '目标', r[2], e.to + ' ' + nodeById[e.to].label);
      cmp(errors, '连线', e.id, '类型', r[3], named(C.EDGE_KINDS[e.kind]));
      cmp(errors, '连线', e.id, '说明', r[4], e.label || '—');
      const fz = zoneOf[e.from];
      const tz = zoneOf[e.to];
      cmp(errors, '连线', e.id, '跨越信任边界', r[5], fz === tz ? '否' : '是 (' + (fz || '无') + ' → ' + (tz || '无') + ')');
    });

    const fr = S.findings.rows;
    if (fr.length !== a.findings.length) errors.push('检查提示：说明中 ' + fr.length + ' 条，画布分析得到 ' + a.findings.length + ' 条');
    a.findings.forEach(function (f, i) {
      const r = fr[i];
      if (!r) return;
      cmp(errors, '检查提示', '#' + (i + 1), '级别', r[1], Z.analysis.SEVERITY[f.severity].name);
      cmp(errors, '检查提示', '#' + (i + 1), '规则', r[2], f.code);
      cmp(errors, '检查提示', '#' + (i + 1), '涉及对象', parseList(r[3]).join(', '), f.refs.join(', '));
      cmp(errors, '检查提示', '#' + (i + 1), '说明', r[4], f.message);
    });

    return { ok: errors.length === 0, errors: errors };
  }

  function parseSvg(svg) {
    const s = String(svg);
    const out = { fingerprint: null, nodes: {}, edges: {}, zones: {}, labels: {}, dupes: [] };
    const fp = /<svg[^>]*data-ztna-fingerprint="([0-9a-f]{8})"/.exec(s);
    if (fp) out.fingerprint = fp[1];
    let m;
    const nodeRe = /<g class="node" data-node-id="([^"]+)" data-type="([^"]+)" data-role="[^"]+" transform="translate\((-?\d+) (-?\d+)\)">/g;
    while ((m = nodeRe.exec(s))) {
      if (out.nodes[m[1]]) out.dupes.push(m[1]);
      out.nodes[m[1]] = { type: m[2], x: Number(m[3]), y: Number(m[4]) };
    }
    const edgeRe = /<g class="edge" data-edge-id="([^"]+)" data-from="([^"]+)" data-to="([^"]+)" data-kind="([^"]+)">/g;
    while ((m = edgeRe.exec(s))) {
      if (out.edges[m[1]]) out.dupes.push(m[1]);
      out.edges[m[1]] = { from: m[2], to: m[3], kind: m[4] };
    }
    const zoneRe = /<g class="zone" data-zone-id="([^"]+)" data-trust="([^"]+)" data-x="(-?\d+)" data-y="(-?\d+)" data-w="(\d+)" data-h="(\d+)">/g;
    while ((m = zoneRe.exec(s))) {
      if (out.zones[m[1]]) out.dupes.push(m[1]);
      out.zones[m[1]] = { trust: m[2], x: Number(m[3]), y: Number(m[4]), w: Number(m[5]), h: Number(m[6]) };
    }
    const labelRe = /<text[^>]*data-label-for="([^"]+)"[^>]*>([^<]*)<\/text>/g;
    while ((m = labelRe.exec(s))) {
      if (out.labels[m[1]] !== undefined) out.dupes.push('label:' + m[1]);
      out.labels[m[1]] = Z.util.unescapeXml(m[2]);
    }
    const t = /<text[^>]*data-title="true"[^>]*>([^<]*)<\/text>/.exec(s);
    out.title = t ? Z.util.unescapeXml(t[1]) : null;
    return out;
  }

  function checkSvg(diagram, svg) {
    const errors = [];
    const p = parseSvg(svg);
    if (p.fingerprint !== Z.model.fingerprint(diagram)) errors.push('SVG 数据指纹不一致');
    if (p.title !== diagram.title) errors.push('SVG 标题为「' + p.title + '」，画布为「' + diagram.title + '」');
    p.dupes.forEach(function (id) { errors.push('SVG 中重复出现 ' + id); });
    function compareSet(kind, label, items, check) {
      const ids = {};
      items.forEach(function (it) {
        ids[it.id] = true;
        if (!p[kind][it.id]) errors.push('SVG 缺少' + label + ' ' + it.id);
        else check(it, p[kind][it.id]);
      });
      Object.keys(p[kind]).forEach(function (id) { if (!ids[id]) errors.push('SVG 多出' + label + ' ' + id); });
    }
    compareSet('nodes', '组件', diagram.nodes, function (n, g) {
      if (g.type !== n.type || g.x !== n.x || g.y !== n.y) errors.push('SVG 组件 ' + n.id + ' 类型或位置不一致');
      if (p.labels[n.id] !== n.label) errors.push('SVG 组件 ' + n.id + ' 名称为「' + p.labels[n.id] + '」，画布为「' + n.label + '」');
    });
    compareSet('edges', '连线', diagram.edges, function (e, g) {
      if (g.from !== e.from || g.to !== e.to || g.kind !== e.kind) errors.push('SVG 连线 ' + e.id + ' 端点或类型不一致');
      const expected = e.label || undefined;
      if (p.labels[e.id] !== expected) errors.push('SVG 连线 ' + e.id + ' 说明为「' + p.labels[e.id] + '」，画布为「' + (e.label || '') + '」');
    });
    compareSet('zones', '信任边界', diagram.zones, function (z, g) {
      if (g.trust !== z.trust || g.x !== z.x || g.y !== z.y || g.w !== z.w || g.h !== z.h) errors.push('SVG 信任边界 ' + z.id + ' 级别或尺寸不一致');
      if (p.labels[z.id] !== z.name) errors.push('SVG 信任边界 ' + z.id + ' 名称为「' + p.labels[z.id] + '」，画布为「' + z.name + '」');
    });
    return { ok: errors.length === 0, errors: errors };
  }

  Z.consistency = { checkNotes: checkNotes, checkSvg: checkSvg, parseSections: parseSections, parseSvg: parseSvg };
})(globalThis.ZTNA = globalThis.ZTNA || {});
