/* Generates the design-notes Markdown from the diagram data. */
(function (Z) {
  'use strict';

  const HEADINGS = {
    stats: '## 统计 (Summary)',
    inventory: '## 1. 组件清单 (Component Inventory)',
    boundaries: '## 2. 信任边界 (Trust Boundaries)',
    peps: '## 3. 策略执行点 (Policy Enforcement Points)',
    connections: '## 4. 连线 (Connections)',
    findings: '## 5. 检查提示 (Findings)'
  };

  function generateNotes(diagram) {
    const U = Z.util;
    const C = Z.catalog;
    const a = Z.analysis.analyze(diagram);
    const cell = U.escapeMdCell;
    const nodeById = {};
    a.nodes.forEach(function (n) { nodeById[n.id] = n; });
    const zoneById = {};
    a.zones.forEach(function (z) { zoneById[z.id] = z; });
    const zoneRef = function (id) { return id ? id + ' ' + zoneById[id].name : '—'; };
    const nodeRef = function (id) { return id + ' ' + nodeById[id].label; };
    const list = function (ids) { return ids.length ? ids.join(', ') : '—'; };
    const row = function (cells) { return '| ' + cells.map(cell).join(' | ') + ' |'; };
    const sep = function (n) { return '|' + new Array(n + 1).join('---|'); };
    const out = [];

    out.push('# 设计说明：' + U.escapeMdText(diagram.title));
    out.push('');
    out.push('> 本文件由 ztna-canvas 根据画布数据自动生成，内容与画布逐项对应。请在画布中修改后重新导出，不要手工编辑。');
    out.push('>');
    out.push('> 数据指纹 (FNV-1a)：`' + Z.model.fingerprint(diagram) + '`');
    out.push('');

    out.push(HEADINGS.stats);
    out.push('');
    out.push(row(['项目', '数量']));
    out.push(sep(2));
    out.push(row(['组件', String(a.nodes.length)]));
    out.push(row(['连线', String(a.edges.length)]));
    out.push(row(['信任边界', String(a.zones.length)]));
    out.push(row(['策略执行点', String(a.peps.length)]));
    out.push(row(['检查提示', String(a.findings.length)]));
    out.push('');

    out.push(HEADINGS.inventory);
    out.push('');
    out.push(row(['ID', '名称', '类型', '角色', '所在信任边界', '位置 (x, y)']));
    out.push(sep(6));
    a.nodes.forEach(function (n) {
      const c = C.component(n.type);
      out.push(row([n.id, n.label, c.name + ' (' + c.en + ')', C.ROLES[c.role].name + ' (' + C.ROLES[c.role].en + ')', zoneRef(a.zoneOf[n.id]), n.x + ', ' + n.y]));
    });
    out.push('');

    out.push(HEADINGS.boundaries);
    out.push('');
    out.push('组件归属按组件中心点所在的最小信任边界计算。');
    out.push('');
    out.push(row(['ID', '名称', '信任级别', '包含组件']));
    out.push(sep(4));
    a.boundaries.forEach(function (b) {
      const t = C.TRUST_LEVELS[b.trust];
      out.push(row([b.id, b.name, t.name + ' (' + t.en + ')', list(b.members)]));
    });
    out.push('');
    out.push('未归属任何信任边界的组件：' + list(a.unzoned));
    out.push('');

    out.push(HEADINGS.peps);
    out.push('');
    out.push('策略执行点 = 角色为 PEP 的组件；决策来源 = 与其直接相连的 PDP；保护的资源 = 沿业务流量方向、仅经过 PEP 可达的受保护资源。');
    out.push('');
    out.push(row(['ID', '名称', '类型', '所在信任边界', '决策来源 (PDP)', '保护的资源']));
    out.push(sep(6));
    a.peps.forEach(function (p) {
      const c = C.component(p.type);
      out.push(row([p.id, p.label, c.name + ' (' + c.en + ')', zoneRef(p.zone), list(p.pdps), list(p.resources)]));
    });
    out.push('');

    out.push(HEADINGS.connections);
    out.push('');
    out.push(row(['ID', '源', '目标', '类型', '说明', '跨越信任边界']));
    out.push(sep(6));
    a.connections.forEach(function (e) {
      const k = C.EDGE_KINDS[e.kind];
      const cross = e.crossesBoundary ? '是 (' + (e.fromZone || '无') + ' → ' + (e.toZone || '无') + ')' : '否';
      out.push(row([e.id, nodeRef(e.from), nodeRef(e.to), k.name + ' (' + k.en + ')', e.label || '—', cross]));
    });
    out.push('');

    out.push(HEADINGS.findings);
    out.push('');
    out.push('以下为基于画布结构的自动检查，仅供设计评审参考，不代表安全评估结论。');
    out.push('');
    out.push(row(['序号', '级别', '规则', '涉及对象', '说明']));
    out.push(sep(5));
    a.findings.forEach(function (f, i) {
      out.push(row([String(i + 1), Z.analysis.SEVERITY[f.severity].name, f.code, list(f.refs), f.message]));
    });
    if (!a.findings.length) {
      out.push('');
      out.push('未发现问题。');
    }
    out.push('');
    return out.join('\n');
  }

  Z.notes = { generateNotes: generateNotes, HEADINGS: HEADINGS };
})(globalThis.ZTNA = globalThis.ZTNA || {});
