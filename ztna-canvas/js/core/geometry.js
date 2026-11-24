/* Geometry helpers: node boxes, zone membership, edge clipping, bounds. */
(function (Z) {
  'use strict';

  const NODE_W = 160;
  const NODE_H = 64;

  function center(node) {
    return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
  }

  function zoneContains(zone, p) {
    return p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;
  }

  /* A node belongs to the smallest zone that contains its centre (ties: lowest id). */
  function zoneOfNode(diagram, node) {
    const p = center(node);
    let best = null;
    diagram.zones.forEach(function (z) {
      if (!zoneContains(z, p)) return;
      if (!best) { best = z; return; }
      const a = z.w * z.h;
      const b = best.w * best.h;
      if (a < b || (a === b && Z.util.compareIds(z.id, best.id) < 0)) best = z;
    });
    return best;
  }

  /* Point where the ray from the box centre towards (tx, ty) leaves the box. */
  function clipToBox(node, tx, ty, pad) {
    const c = center(node);
    const dx = tx - c.x;
    const dy = ty - c.y;
    if (dx === 0 && dy === 0) return c;
    const p = pad === undefined ? 4 : pad;
    const hw = NODE_W / 2 + p;
    const hh = NODE_H / 2 + p;
    const s = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }

  function edgeLine(from, to) {
    const cf = center(from);
    const ct = center(to);
    const forward = function (a, b) { return (b.x - a.x) * (ct.x - cf.x) + (b.y - a.y) * (ct.y - cf.y) > 0; };
    /* Gap narrower than the padding: clip to the bare boxes so the arrowhead tip stays on the target's edge. */
    for (const pad of [4, 0]) {
      const a = clipToBox(from, ct.x, ct.y, pad);
      const b = clipToBox(to, cf.x, cf.y, pad);
      if (forward(a, b)) return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    /* Overlapping boxes: no visible gap exists, keep the centre-to-centre direction. */
    return { x1: cf.x, y1: cf.y, x2: ct.x, y2: ct.y };
  }

  function bounds(diagram, pad) {
    const p = pad === undefined ? 40 : pad;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    diagram.nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + NODE_H);
    });
    diagram.zones.forEach(function (z) {
      minX = Math.min(minX, z.x); minY = Math.min(minY, z.y - 4);
      maxX = Math.max(maxX, z.x + z.w); maxY = Math.max(maxY, z.y + z.h);
    });
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 400; maxY = 200; }
    minY -= 48; /* room for the title */
    return {
      x: Math.floor(minX - p),
      y: Math.floor(minY - p),
      w: Math.ceil(maxX - minX + 2 * p),
      h: Math.ceil(maxY - minY + 2 * p)
    };
  }

  Z.geometry = {
    NODE_W: NODE_W,
    NODE_H: NODE_H,
    center: center,
    zoneContains: zoneContains,
    zoneOfNode: zoneOfNode,
    edgeLine: edgeLine,
    bounds: bounds
  };
})(globalThis.ZTNA = globalThis.ZTNA || {});
