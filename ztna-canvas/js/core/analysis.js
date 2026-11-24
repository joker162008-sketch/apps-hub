/* Derives trust boundaries, policy enforcement points and design findings
 * from the diagram data. Pure function of the data; no DOM access. */
(function (Z) {
  'use strict';

  const SEVERITY = {
    high: { name: '高', rank: 0 },
    warn: { name: '中', rank: 1 },
    info: { name: '提示', rank: 2 }
  };

  const RULES = {
    NO_PEP: { severity: 'high', text: '画布中没有任何策略执行点 (PEP)，受保护资源无法按策略访问。' },
    BYPASS_PEP: { severity: 'high', text: '访问主体/终端/网络直接连到受保护资源，绕过了策略执行点。' },
    PEP_NO_PDP: { severity: 'warn', text: '策略执行点没有连接任何策略决策点 (PDP)。' },
    UNPROTECTED_RESOURCE: { severity: 'warn', text: '受保护资源未经任何策略执行点直接保护。' },
    CROSS_BOUNDARY_NO_PEP: { severity: 'warn', text: '业务流量跨越信任边界，但两端都不是策略执行点。' },
    NO_AUDIT: { severity: 'warn', text: '策略决策点/执行点没有向日志审计组件输出日志。' },
    UNZONED: { severity: 'info', text: '组件未放入任何信任边界。' }
  };
  const RULE_ORDER = ['NO_PEP', 'BYPASS_PEP', 'PEP_NO_PDP', 'UNPROTECTED_RESOURCE', 'CROSS_BOUNDARY_NO_PEP', 'NO_AUDIT', 'UNZONED'];

  function analyze(diagram) {
    const U = Z.util;
    const role = function (n) { return Z.catalog.roleOf(n.type); };
    const nodes = diagram.nodes.slice().sort(function (a, b) { return U.compareIds(a.id, b.id); });
    const edges = diagram.edges.slice().sort(function (a, b) { return U.compareIds(a.id, b.id); });
    const zones = diagram.zones.slice().sort(function (a, b) { return U.compareIds(a.id, b.id); });
    const byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    const zoneOf = {};
    nodes.forEach(function (n) {
      const z = Z.geometry.zoneOfNode(diagram, n);
      zoneOf[n.id] = z ? z.id : null;
    });

    const boundaries = zones.map(function (z) {
      return {
        id: z.id, name: z.name, trust: z.trust,
        members: nodes.filter(function (n) { return zoneOf[n.id] === z.id; }).map(function (n) { return n.id; })
      };
    });
    const unzoned = nodes.filter(function (n) { return zoneOf[n.id] === null; }).map(function (n) { return n.id; });

    const connections = edges.map(function (e) {
      const fz = zoneOf[e.from];
      const tz = zoneOf[e.to];
      return { id: e.id, from: e.from, to: e.to, kind: e.kind, label: e.label, fromZone: fz, toZone: tz, crossesBoundary: fz !== tz };
    });

    const pepNodes = nodes.filter(function (n) { return role(n) === 'pep'; });
    const peps = pepNodes.map(function (p) {
      const pdps = {};
      edges.forEach(function (e) {
        const other = e.from === p.id ? e.to : e.to === p.id ? e.from : null;
        if (other && byId[other] && role(byId[other]) === 'pdp') pdps[other] = true;
      });
      /* Resources reachable over directed data edges, passing only through PEPs. */
      const resources = {};
      const visited = {};
      const queue = [p.id];
      visited[p.id] = true;
      while (queue.length) {
        const cur = queue.shift();
        edges.forEach(function (e) {
          if (e.kind !== 'data' || e.from !== cur || visited[e.to]) return;
          const t = byId[e.to];
          if (!t) return;
          visited[e.to] = true;
          if (role(t) === 'resource') resources[t.id] = true;
          else if (role(t) === 'pep') queue.push(t.id);
        });
      }
      return {
        id: p.id, label: p.label, type: p.type, zone: zoneOf[p.id],
        pdps: U.sortedIds(Object.keys(pdps)),
        resources: U.sortedIds(Object.keys(resources))
      };
    });

    const protectedBy = {};
    peps.forEach(function (p) {
      p.resources.forEach(function (r) { (protectedBy[r] = protectedBy[r] || []).push(p.id); });
    });

    const found = [];
    function add(code, refs) { found.push({ code: code, severity: RULES[code].severity, refs: refs, message: RULES[code].text }); }

    if (nodes.length && !pepNodes.length) add('NO_PEP', []);
    const bypassEdges = {};
    edges.forEach(function (e) {
      const a = byId[e.from];
      const b = byId[e.to];
      if (e.kind === 'data' && a && b && role(b) === 'resource' && ['subject', 'device', 'network'].indexOf(role(a)) >= 0) {
        bypassEdges[e.id] = true;
        add('BYPASS_PEP', [e.id]);
      }
    });
    peps.forEach(function (p) { if (!p.pdps.length) add('PEP_NO_PDP', [p.id]); });
    nodes.forEach(function (n) {
      if (role(n) === 'resource' && pepNodes.length && !protectedBy[n.id]) add('UNPROTECTED_RESOURCE', [n.id]);
    });
    connections.forEach(function (c) {
      if (c.kind !== 'data' || !c.crossesBoundary || bypassEdges[c.id]) return;
      if (role(byId[c.from]) !== 'pep' && role(byId[c.to]) !== 'pep') add('CROSS_BOUNDARY_NO_PEP', [c.id]);
    });
    nodes.forEach(function (n) {
      if (role(n) !== 'pep' && role(n) !== 'pdp') return;
      const logs = edges.some(function (e) { return e.from === n.id && e.kind === 'log' && byId[e.to] && byId[e.to].type === 'siem'; });
      if (!logs) add('NO_AUDIT', [n.id]);
    });
    unzoned.forEach(function (id) { add('UNZONED', [id]); });

    found.sort(function (a, b) {
      const r = RULE_ORDER.indexOf(a.code) - RULE_ORDER.indexOf(b.code);
      if (r) return r;
      return U.compareIds(a.refs[0] || '', b.refs[0] || '');
    });

    return {
      nodes: nodes,
      edges: edges,
      zones: zones,
      zoneOf: zoneOf,
      boundaries: boundaries,
      unzoned: unzoned,
      connections: connections,
      peps: peps,
      findings: found
    };
  }

  Z.analysis = { analyze: analyze, RULES: RULES, RULE_ORDER: RULE_ORDER, SEVERITY: SEVERITY };
})(globalThis.ZTNA = globalThis.ZTNA || {});
