/* Component library, edge kinds and trust levels. */
(function (Z) {
  'use strict';

  const ROLES = {
    subject: { name: '访问主体', en: 'Subject', color: '#2563eb' },
    device: { name: '终端与设备信任', en: 'Device Trust', color: '#0891b2' },
    identity: { name: '身份与凭证', en: 'Identity', color: '#7c3aed' },
    pdp: { name: '策略决策点', en: 'PDP', color: '#c2410c' },
    pep: { name: '策略执行点', en: 'PEP', color: '#dc2626' },
    resource: { name: '受保护资源', en: 'Resource', color: '#15803d' },
    telemetry: { name: '日志与审计', en: 'Telemetry', color: '#4b5563' },
    network: { name: '网络', en: 'Network', color: '#64748b' }
  };

  const ROLE_ORDER = ['subject', 'device', 'identity', 'pdp', 'pep', 'resource', 'telemetry', 'network'];

  const COMPONENTS = [
    { type: 'user', name: '用户', en: 'User', role: 'subject' },
    { type: 'endpoint', name: '终端设备', en: 'Managed Endpoint', role: 'device' },
    { type: 'device_cert', name: '设备证书', en: 'Device Certificate', role: 'device' },
    { type: 'ztna_client', name: 'ZTNA 客户端', en: 'ZTNA Agent', role: 'device' },
    { type: 'posture', name: '设备态势评估', en: 'Device Posture', role: 'device' },
    { type: 'idp', name: '身份提供商', en: 'IdP', role: 'identity' },
    { type: 'mfa', name: '多因素认证', en: 'MFA', role: 'identity' },
    { type: 'pki', name: '证书颁发机构', en: 'PKI / CA', role: 'identity' },
    { type: 'policy_engine', name: '策略引擎', en: 'Policy Engine', role: 'pdp' },
    { type: 'policy_admin', name: '策略管理器', en: 'Policy Administrator', role: 'pdp' },
    { type: 'ztna_gateway', name: 'ZTNA 网关', en: 'ZTNA Gateway', role: 'pep' },
    { type: 'app_connector', name: '应用连接器', en: 'App Connector', role: 'pep' },
    { type: 'app_web', name: 'Web 应用', en: 'Web Application', role: 'resource' },
    { type: 'app_ssh', name: '运维主机', en: 'SSH / RDP Host', role: 'resource' },
    { type: 'app_saas', name: 'SaaS 应用', en: 'SaaS Application', role: 'resource' },
    { type: 'database', name: '数据库', en: 'Database', role: 'resource' },
    { type: 'siem', name: '日志审计', en: 'SIEM / Audit Log', role: 'telemetry' },
    { type: 'threat_intel', name: '威胁情报', en: 'Threat Intelligence', role: 'telemetry' },
    { type: 'internet', name: '互联网', en: 'Internet', role: 'network' }
  ];

  const EDGE_KINDS = {
    data: { name: '业务流量', en: 'Data', color: '#1f2937', dash: '' },
    control: { name: '控制/认证', en: 'Control', color: '#c2410c', dash: '8 5' },
    log: { name: '日志', en: 'Log', color: '#6b7280', dash: '2 4' }
  };

  const TRUST_LEVELS = {
    untrusted: { name: '不可信', en: 'Untrusted', fill: '#fef2f2', stroke: '#f87171' },
    edge: { name: '边缘/DMZ', en: 'Edge / DMZ', fill: '#fffbeb', stroke: '#f59e0b' },
    control: { name: '控制平面', en: 'Control Plane', fill: '#fff7ed', stroke: '#fb923c' },
    protected: { name: '受保护', en: 'Protected', fill: '#f0fdf4', stroke: '#22c55e' }
  };

  const byType = {};
  COMPONENTS.forEach(function (c) { byType[c.type] = c; });

  function component(type) {
    return byType[type] || null;
  }

  function roleOf(type) {
    const c = byType[type];
    return c ? c.role : null;
  }

  /* Default edge kind when the user draws a connection. */
  function defaultEdgeKind(fromType, toType) {
    const a = roleOf(fromType);
    const b = roleOf(toType);
    if (b === 'telemetry') return 'log';
    if (a === 'pdp' || b === 'pdp' || a === 'identity' || b === 'identity') return 'control';
    if (fromType === 'device_cert' || toType === 'posture') return 'control';
    return 'data';
  }

  Z.catalog = {
    ROLES: ROLES,
    ROLE_ORDER: ROLE_ORDER,
    COMPONENTS: COMPONENTS,
    EDGE_KINDS: EDGE_KINDS,
    TRUST_LEVELS: TRUST_LEVELS,
    component: component,
    roleOf: roleOf,
    defaultEdgeKind: defaultEdgeKind
  };
})(globalThis.ZTNA = globalThis.ZTNA || {});
