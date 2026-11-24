/* Diagram data model: nodes, edges, trust-boundary zones. All mutations go
 * through these functions so the canvas, exports and notes share one source. */
(function (Z) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MAX_LABEL = 24;
  const MAX_TITLE = 60;
  const MAX_ITEMS = 500;

  function createDiagram(title) {
    return { schema: 'ztna-canvas', version: SCHEMA_VERSION, title: title || '未命名零信任架构', nodes: [], edges: [], zones: [] };
  }

  function clone(d) {
    return JSON.parse(JSON.stringify(d));
  }

  function nextId(list, prefix) {
    let max = 0;
    list.forEach(function (item) {
      if (item.id.indexOf(prefix) === 0) max = Math.max(max, Z.util.idNumber(item.id));
    });
    return prefix + (max + 1);
  }

  function cleanLabel(label, fallback) {
    const s = String(label === undefined || label === null ? '' : label).replace(/[\r\n\t]+/g, ' ').trim();
    return (s || fallback).slice(0, MAX_LABEL);
  }

  function round(v) {
    return Math.round(Number(v) || 0);
  }

  function findNode(d, id) { return d.nodes.find(function (n) { return n.id === id; }) || null; }
  function findEdge(d, id) { return d.edges.find(function (e) { return e.id === id; }) || null; }
  function findZone(d, id) { return d.zones.find(function (z) { return z.id === id; }) || null; }

  function addNode(d, type, x, y, label) {
    const c = Z.catalog.component(type);
    if (!c) throw new Error('未知组件类型: ' + type);
    if (d.nodes.length >= MAX_ITEMS) return null;
    const node = { id: nextId(d.nodes, 'n'), type: type, label: cleanLabel(label, c.name), x: round(x), y: round(y) };
    d.nodes.push(node);
    return node;
  }

  function moveNode(d, id, x, y) {
    const n = findNode(d, id);
    if (n) { n.x = round(x); n.y = round(y); }
    return n;
  }

  function renameNode(d, id, label) {
    const n = findNode(d, id);
    if (n) n.label = cleanLabel(label, Z.catalog.component(n.type).name);
    return n;
  }

  function removeNode(d, id) {
    d.nodes = d.nodes.filter(function (n) { return n.id !== id; });
    d.edges = d.edges.filter(function (e) { return e.from !== id && e.to !== id; });
  }

  /* Returns { ok, edge } or { ok:false, error }. */
  function addEdge(d, from, to, kind, label) {
    const a = findNode(d, from);
    const b = findNode(d, to);
    if (!a || !b) return { ok: false, error: '连线端点不存在' };
    if (from === to) return { ok: false, error: '不能连接到自身' };
    if (d.edges.length >= MAX_ITEMS) return { ok: false, error: '连线数量已达上限 ' + MAX_ITEMS };
    const k = kind || Z.catalog.defaultEdgeKind(a.type, b.type);
    if (!Z.catalog.EDGE_KINDS[k]) return { ok: false, error: '未知连线类型: ' + k };
    const dup = d.edges.some(function (e) { return e.from === from && e.to === to && e.kind === k; });
    if (dup) return { ok: false, error: '相同方向与类型的连线已存在' };
    const edge = { id: nextId(d.edges, 'e'), from: from, to: to, kind: k, label: label ? cleanLabel(label, '') : '' };
    d.edges.push(edge);
    return { ok: true, edge: edge };
  }

  function updateEdge(d, id, patch) {
    const e = findEdge(d, id);
    if (!e) return null;
    if (patch.kind !== undefined && Z.catalog.EDGE_KINDS[patch.kind]) e.kind = patch.kind;
    if (patch.label !== undefined) e.label = cleanLabel(patch.label, '');
    return e;
  }

  function removeEdge(d, id) {
    d.edges = d.edges.filter(function (e) { return e.id !== id; });
  }

  function addZone(d, name, trust, x, y, w, h) {
    if (d.zones.length >= MAX_ITEMS) return null;
    const t = Z.catalog.TRUST_LEVELS[trust] ? trust : 'untrusted';
    const zone = {
      id: nextId(d.zones, 'z'),
      name: cleanLabel(name, '信任边界'),
      trust: t,
      x: round(x), y: round(y),
      w: Math.max(120, round(w || 360)),
      h: Math.max(80, round(h || 240))
    };
    d.zones.push(zone);
    return zone;
  }

  function updateZone(d, id, patch) {
    const z = findZone(d, id);
    if (!z) return null;
    if (patch.name !== undefined) z.name = cleanLabel(patch.name, '信任边界');
    if (patch.trust !== undefined && Z.catalog.TRUST_LEVELS[patch.trust]) z.trust = patch.trust;
    ['x', 'y'].forEach(function (k) { if (patch[k] !== undefined) z[k] = round(patch[k]); });
    if (patch.w !== undefined) z.w = Math.max(120, round(patch.w));
    if (patch.h !== undefined) z.h = Math.max(80, round(patch.h));
    return z;
  }

  function removeZone(d, id) {
    d.zones = d.zones.filter(function (z) { return z.id !== id; });
  }

  function isInt(v) { return typeof v === 'number' && Number.isFinite(v) && Math.round(v) === v; }
  function isText(v, max) { return typeof v === 'string' && v.length <= max && !/[\r\n\t]/.test(v); }

  /* Structural validation; returns a list of Chinese error messages. */
  function validate(d) {
    const errors = [];
    if (!d || typeof d !== 'object') return ['不是有效的画布对象'];
    if (d.schema !== 'ztna-canvas') errors.push('schema 字段必须为 ztna-canvas');
    if (d.version !== SCHEMA_VERSION) errors.push('不支持的版本: ' + d.version);
    if (!isText(d.title, MAX_TITLE)) errors.push('标题无效或超过 ' + MAX_TITLE + ' 字');
    ['nodes', 'edges', 'zones'].forEach(function (k) {
      if (!Array.isArray(d[k])) errors.push(k + ' 必须是数组');
      else if (d[k].length > MAX_ITEMS) errors.push(k + ' 数量超过上限 ' + MAX_ITEMS);
    });
    if (errors.length) return errors;
    const ids = {};
    function checkId(id, prefix) {
      if (typeof id !== 'string' || !new RegExp('^' + prefix + '[1-9]\\d*$').test(id)) { errors.push('无效 ID: ' + id); return; }
      if (ids[id]) errors.push('重复 ID: ' + id);
      ids[id] = true;
    }
    d.nodes.forEach(function (n) {
      checkId(n.id, 'n');
      if (!Z.catalog.component(n.type)) errors.push('组件 ' + n.id + ' 类型未知: ' + n.type);
      if (!isText(n.label, MAX_LABEL) || !n.label.trim()) errors.push('组件 ' + n.id + ' 名称无效');
      if (!isInt(n.x) || !isInt(n.y)) errors.push('组件 ' + n.id + ' 坐标必须为整数');
    });
    const nodeIds = {};
    d.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    const seen = {};
    d.edges.forEach(function (e) {
      checkId(e.id, 'e');
      if (!nodeIds[e.from] || !nodeIds[e.to]) errors.push('连线 ' + e.id + ' 端点不存在');
      if (e.from === e.to) errors.push('连线 ' + e.id + ' 不能连接到自身');
      if (!Z.catalog.EDGE_KINDS[e.kind]) errors.push('连线 ' + e.id + ' 类型未知: ' + e.kind);
      if (!isText(e.label, MAX_LABEL)) errors.push('连线 ' + e.id + ' 说明无效');
      const key = e.from + '>' + e.to + '>' + e.kind;
      if (seen[key]) errors.push('连线 ' + e.id + ' 与 ' + seen[key] + ' 重复');
      seen[key] = e.id;
    });
    d.zones.forEach(function (z) {
      checkId(z.id, 'z');
      if (!isText(z.name, MAX_LABEL) || !z.name.trim()) errors.push('信任边界 ' + z.id + ' 名称无效');
      if (!Z.catalog.TRUST_LEVELS[z.trust]) errors.push('信任边界 ' + z.id + ' 信任级别未知: ' + z.trust);
      if (!isInt(z.x) || !isInt(z.y) || !isInt(z.w) || !isInt(z.h) || z.w < 120 || z.h < 80) errors.push('信任边界 ' + z.id + ' 尺寸无效');
    });
    return errors;
  }

  /* Keep only known fields in a fixed order so serialisation is deterministic. */
  function normalize(d) {
    return {
      schema: 'ztna-canvas',
      version: SCHEMA_VERSION,
      title: d.title,
      nodes: d.nodes.map(function (n) { return { id: n.id, type: n.type, label: n.label, x: n.x, y: n.y }; }),
      edges: d.edges.map(function (e) { return { id: e.id, from: e.from, to: e.to, kind: e.kind, label: e.label }; }),
      zones: d.zones.map(function (z) { return { id: z.id, name: z.name, trust: z.trust, x: z.x, y: z.y, w: z.w, h: z.h }; })
    };
  }

  function serialize(d) {
    return JSON.stringify(normalize(d), null, 2) + '\n';
  }

  function deserialize(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, errors: ['JSON 解析失败: ' + err.message] };
    }
    const errors = validate(parsed);
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, diagram: normalize(parsed) };
  }

  function fingerprint(d) {
    return Z.util.fnv1a(Z.util.canonicalJson(normalize(d)));
  }

  Z.model = {
    MAX_ITEMS: MAX_ITEMS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_LABEL: MAX_LABEL,
    MAX_TITLE: MAX_TITLE,
    createDiagram: createDiagram,
    clone: clone,
    findNode: findNode,
    findEdge: findEdge,
    findZone: findZone,
    addNode: addNode,
    moveNode: moveNode,
    renameNode: renameNode,
    removeNode: removeNode,
    addEdge: addEdge,
    updateEdge: updateEdge,
    removeEdge: removeEdge,
    addZone: addZone,
    updateZone: updateZone,
    removeZone: removeZone,
    validate: validate,
    normalize: normalize,
    serialize: serialize,
    deserialize: deserialize,
    fingerprint: fingerprint
  };
})(globalThis.ZTNA = globalThis.ZTNA || {});
