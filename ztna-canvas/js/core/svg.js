/* Renders the diagram as a standalone SVG string. The same renderer drives the
 * live canvas (interactive=true) and the SVG/PNG exports, so what you see is
 * what gets exported. */
(function (Z) {
  'use strict';

  const FONT = "'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif";
  const LEGEND_H = 44;

  function textWidth(s, size) {
    let w = 0;
    for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2e7f ? size : size * 0.58;
    return w;
  }

  function fitSize(s, base, max, min) {
    let size = base;
    while (size > min && textWidth(s, size) > max) size -= 0.5;
    return size;
  }

  function attrs(obj) {
    return Object.keys(obj).map(function (k) {
      return obj[k] === undefined || obj[k] === null || obj[k] === '' ? '' : ' ' + k + '="' + Z.util.escapeXml(obj[k]) + '"';
    }).join('');
  }

  function el(name, a, inner) {
    return '<' + name + attrs(a) + (inner === undefined ? '/>' : '>' + inner + '</' + name + '>');
  }

  function fmt(v) {
    return String(Math.round(v * 10) / 10);
  }

  function renderZone(z, opts) {
    const t = Z.catalog.TRUST_LEVELS[z.trust];
    const sel = opts.selected === z.id;
    let s = '<g' + attrs({ class: 'zone', 'data-zone-id': z.id, 'data-trust': z.trust, 'data-x': z.x, 'data-y': z.y, 'data-w': z.w, 'data-h': z.h }) + '>';
    s += el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 12, fill: t.fill, stroke: sel ? '#2563eb' : t.stroke, 'stroke-width': sel ? 3 : 2, 'stroke-dasharray': '10 6' });
    s += el('rect', { class: 'zone-bar', x: z.x, y: z.y, width: z.w, height: 30, rx: 12, fill: t.stroke, 'fill-opacity': 0.16 });
    s += el('text', { x: z.x + 12, y: z.y + 20, 'font-size': fmt(fitSize(z.name, 14, z.w - 36 - textWidth(t.name, 12), 9)), 'font-weight': 700, fill: '#1f2937', 'data-label-for': z.id }, Z.util.escapeXml(z.name));
    s += el('text', { x: z.x + z.w - 12, y: z.y + 20, 'font-size': 12, 'text-anchor': 'end', fill: '#374151', 'data-trust-for': z.id }, Z.util.escapeXml(t.name));
    if (opts.interactive) {
      s += el('rect', { class: 'zone-resize', 'data-resize-for': z.id, x: z.x + z.w - 14, y: z.y + z.h - 14, width: 14, height: 14, fill: t.stroke });
    }
    return s + '</g>';
  }

  function edgeOffsets(edges) {
    const groups = {};
    edges.forEach(function (e) {
      const key = Z.util.compareIds(e.from, e.to) < 0 ? e.from + '|' + e.to : e.to + '|' + e.from;
      (groups[key] = groups[key] || []).push(e.id);
    });
    const off = {};
    Object.keys(groups).forEach(function (k) {
      const ids = groups[k];
      ids.forEach(function (id, i) { off[id] = (i - (ids.length - 1) / 2) * 12; });
    });
    return off;
  }

  function overlaps(a, b) {
    const m = 3;
    return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  }

  /* Picks a spot along the edge whose label box avoids earlier labels and nodes. */
  function placeLabel(x1, y1, x2, y2, w, placed, nodes) {
    const ts = [0.5, 0.4, 0.6, 0.3, 0.7];
    let choice = null;
    for (let i = 0; i < ts.length && !choice; i++) {
      const x = x1 + (x2 - x1) * ts[i];
      const y = y1 + (y2 - y1) * ts[i];
      const box = { x: x - w / 2, y: y - 9, w: w, h: 17 };
      const clash = placed.some(function (b) { return overlaps(b, box); }) || nodes.some(function (n) {
        return overlaps({ x: n.x, y: n.y, w: Z.geometry.NODE_W, h: Z.geometry.NODE_H }, box);
      });
      if (!clash) choice = { x: x, y: y, box: box };
    }
    if (!choice) {
      const x = (x1 + x2) / 2;
      const y = (y1 + y2) / 2;
      choice = { x: x, y: y, box: { x: x - w / 2, y: y - 9, w: w, h: 17 } };
    }
    placed.push(choice.box);
    return choice;
  }

  function renderEdge(e, byId, offset, opts) {
    const a = byId[e.from];
    const b = byId[e.to];
    const k = Z.catalog.EDGE_KINDS[e.kind];
    const line = Z.geometry.edgeLine(a, b);
    /* Perpendicular offset relative to a canonical direction so opposite edges separate. */
    const forward = Z.util.compareIds(e.from, e.to) < 0;
    const dx = (line.x2 - line.x1) * (forward ? 1 : -1);
    const dy = (line.y2 - line.y1) * (forward ? 1 : -1);
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ox = -dy / len * offset;
    const oy = dx / len * offset;
    const x1 = line.x1 + ox, y1 = line.y1 + oy, x2 = line.x2 + ox, y2 = line.y2 + oy;
    const sel = opts.selected === e.id;
    let s = '<g' + attrs({ class: 'edge', 'data-edge-id': e.id, 'data-from': e.from, 'data-to': e.to, 'data-kind': e.kind }) + '>';
    if (opts.interactive) {
      s += el('line', { class: 'edge-hit', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), stroke: '#000', 'stroke-opacity': 0, 'stroke-width': 14 });
    }
    s += el('line', { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), stroke: sel ? '#2563eb' : k.color, 'stroke-width': sel ? 3 : 1.8, 'stroke-dasharray': k.dash, 'marker-end': 'url(#arrow-' + e.kind + ')' });
    if (e.label) {
      const w = textWidth(e.label, 11) + 10;
      const pos = placeLabel(x1, y1, x2, y2, w, opts.placed, opts.nodes);
      const mx = pos.x;
      const my = pos.y;
      s += el('rect', { x: fmt(mx - w / 2), y: fmt(my - 9), width: fmt(w), height: 17, rx: 4, fill: '#ffffff', 'fill-opacity': 0.92, stroke: k.color, 'stroke-width': 0.6 });
      s += el('text', { x: fmt(mx), y: fmt(my + 4), 'font-size': 11, 'text-anchor': 'middle', fill: k.color, 'data-label-for': e.id }, Z.util.escapeXml(e.label));
    }
    return s + '</g>';
  }

  function renderNode(n, opts) {
    const G = Z.geometry;
    const c = Z.catalog.component(n.type);
    const role = Z.catalog.ROLES[c.role];
    const sel = opts.selected === n.id;
    let s = '<g' + attrs({ class: 'node', 'data-node-id': n.id, 'data-type': n.type, 'data-role': c.role, transform: 'translate(' + n.x + ' ' + n.y + ')' }) + '>';
    s += el('rect', { x: 0, y: 0, width: G.NODE_W, height: G.NODE_H, rx: 10, fill: '#ffffff', stroke: sel ? '#2563eb' : role.color, 'stroke-width': sel ? 3.5 : 2 });
    s += el('rect', { x: 0, y: 0, width: 8, height: G.NODE_H, rx: 3, fill: role.color });
    if (c.role === 'pep' || c.role === 'pdp') {
      s += el('rect', { x: G.NODE_W - 40, y: -9, width: 36, height: 18, rx: 9, fill: role.color });
      s += el('text', { x: G.NODE_W - 22, y: 4, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', fill: '#ffffff' }, role.en);
    }
    s += el('text', { x: 84, y: 30, 'font-size': fmt(fitSize(n.label, 15, G.NODE_W - 22, 10)), 'font-weight': 600, 'text-anchor': 'middle', fill: '#111827', 'data-label-for': n.id }, Z.util.escapeXml(n.label));
    s += el('text', { x: 84, y: 50, 'font-size': fmt(fitSize(c.en, 11, G.NODE_W - 22, 8)), 'text-anchor': 'middle', fill: '#6b7280' }, Z.util.escapeXml(c.en));
    if (opts.interactive) {
      s += el('circle', { class: 'port', 'data-port-for': n.id, cx: G.NODE_W, cy: G.NODE_H / 2, r: 7, fill: '#ffffff', stroke: role.color, 'stroke-width': 2 });
    }
    return s + '</g>';
  }

  function legendWidth() {
    let w = 0;
    Object.keys(Z.catalog.EDGE_KINDS).forEach(function (kind) {
      const k = Z.catalog.EDGE_KINDS[kind];
      w += 64 + textWidth(k.name + ' (' + k.en + ')', 12);
    });
    return w + 8 + textWidth('PEP = 策略执行点 · PDP = 策略决策点', 12);
  }

  function renderLegend(x, y) {
    let s = '<g class="legend">';
    let cx = x;
    Object.keys(Z.catalog.EDGE_KINDS).forEach(function (kind) {
      const k = Z.catalog.EDGE_KINDS[kind];
      s += el('line', { x1: cx, y1: y, x2: cx + 36, y2: y, stroke: k.color, 'stroke-width': 1.8, 'stroke-dasharray': k.dash, 'marker-end': 'url(#arrow-' + kind + ')' });
      s += el('text', { x: cx + 44, y: y + 4, 'font-size': 12, fill: '#374151' }, Z.util.escapeXml(k.name + ' (' + k.en + ')'));
      cx += 64 + textWidth(k.name + ' (' + k.en + ')', 12);
    });
    s += el('text', { x: cx + 8, y: y + 4, 'font-size': 12, fill: '#374151' }, 'PEP = 策略执行点 · PDP = 策略决策点');
    return s + '</g>';
  }

  /* opts: { interactive, selected, width, height, pending:{x1,y1,x2,y2} } */
  function renderSvg(diagram, options) {
    const opts = options || {};
    const byId = {};
    diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    let vb;
    if (opts.interactive) {
      vb = { x: 0, y: 0, w: opts.width || 2000, h: opts.height || 1400 };
    } else {
      vb = Z.geometry.bounds(diagram, 40);
      vb.h += LEGEND_H;
      vb.w = Math.ceil(Math.max(vb.w, legendWidth() + 80, textWidth(diagram.title, 20) + 80));
    }
    const root = {
      xmlns: 'http://www.w3.org/2000/svg',
      width: vb.w,
      height: vb.h,
      viewBox: vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h,
      'font-family': FONT,
      'data-ztna-fingerprint': Z.model.fingerprint(diagram)
    };
    let s = '<svg' + attrs(root) + '>';
    s += el('title', {}, Z.util.escapeXml(diagram.title));
    s += '<defs>';
    Object.keys(Z.catalog.EDGE_KINDS).forEach(function (kind) {
      s += '<marker' + attrs({ id: 'arrow-' + kind, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }) + '>' +
        el('path', { d: 'M0,0 L10,5 L0,10 z', fill: Z.catalog.EDGE_KINDS[kind].color }) + '</marker>';
    });
    s += '</defs>';
    s += el('rect', { class: 'canvas-bg', x: vb.x, y: vb.y, width: vb.w, height: vb.h, fill: '#ffffff' });
    if (!opts.interactive) {
      s += el('text', { x: vb.x + 40, y: vb.y + 52, 'font-size': 20, 'font-weight': 700, fill: '#111827', 'data-title': 'true' }, Z.util.escapeXml(diagram.title));
    }
    diagram.zones.forEach(function (z) { s += renderZone(z, opts); });
    const offsets = edgeOffsets(diagram.edges);
    const edgeOpts = { interactive: opts.interactive, selected: opts.selected, placed: [], nodes: diagram.nodes };
    diagram.edges.forEach(function (e) {
      if (byId[e.from] && byId[e.to]) s += renderEdge(e, byId, offsets[e.id], edgeOpts);
    });
    diagram.nodes.forEach(function (n) { s += renderNode(n, opts); });
    if (opts.pending) {
      s += el('line', { class: 'pending', x1: fmt(opts.pending.x1), y1: fmt(opts.pending.y1), x2: fmt(opts.pending.x2), y2: fmt(opts.pending.y2), stroke: '#2563eb', 'stroke-width': 2, 'stroke-dasharray': '4 4' });
    }
    if (!opts.interactive) s += renderLegend(vb.x + 40, vb.y + vb.h - 24);
    return s + '</svg>';
  }

  Z.svg = { renderSvg: renderSvg, FONT: FONT, textWidth: textWidth };
})(globalThis.ZTNA = globalThis.ZTNA || {});
