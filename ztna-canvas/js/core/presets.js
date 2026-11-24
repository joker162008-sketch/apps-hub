/* Built-in preset templates. Generic, fictional example — no real company data. */
(function (Z) {
  'use strict';

  function remoteWork() {
    return {
      schema: 'ztna-canvas',
      version: 1,
      title: '远程办公 ZTNA 访问（示例）',
      zones: [
        { id: 'z1', name: '远程办公环境', trust: 'untrusted', x: 40, y: 80, w: 440, h: 560 },
        { id: 'z2', name: 'ZTNA 服务边缘', trust: 'edge', x: 540, y: 80, w: 240, h: 180 },
        { id: 'z3', name: '零信任控制平面', trust: 'control', x: 540, y: 320, w: 720, h: 460 },
        { id: 'z4', name: '企业数据中心', trust: 'protected', x: 840, y: 40, w: 660, h: 250 }
      ],
      nodes: [
        { id: 'n1', type: 'user', label: '远程员工', x: 80, y: 130 },
        { id: 'n2', type: 'endpoint', label: '公司配发笔记本', x: 80, y: 290 },
        { id: 'n3', type: 'device_cert', label: '设备证书', x: 80, y: 450 },
        { id: 'n4', type: 'ztna_client', label: 'ZTNA 客户端', x: 300, y: 290 },
        { id: 'n5', type: 'ztna_gateway', label: 'ZTNA 网关', x: 580, y: 150 },
        { id: 'n6', type: 'idp', label: '身份提供商', x: 580, y: 550 },
        { id: 'n7', type: 'mfa', label: '多因素认证', x: 840, y: 700 },
        { id: 'n8', type: 'policy_engine', label: '策略引擎', x: 840, y: 380 },
        { id: 'n9', type: 'posture', label: '设备态势评估', x: 1080, y: 550 },
        { id: 'n10', type: 'pki', label: '企业内部 CA', x: 580, y: 700 },
        { id: 'n11', type: 'siem', label: '日志审计 SIEM', x: 1080, y: 380 },
        { id: 'n12', type: 'app_connector', label: '应用连接器', x: 880, y: 150 },
        { id: 'n13', type: 'app_web', label: '内部 OA 系统', x: 1120, y: 70 },
        { id: 'n14', type: 'app_ssh', label: '运维主机', x: 1120, y: 200 },
        { id: 'n15', type: 'database', label: '业务数据库', x: 1320, y: 135 }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', kind: 'data', label: '使用' },
        { id: 'e2', from: 'n2', to: 'n4', kind: 'data', label: '本机流量' },
        { id: 'e3', from: 'n3', to: 'n4', kind: 'control', label: 'mTLS 客户端证书' },
        { id: 'e4', from: 'n4', to: 'n5', kind: 'data', label: 'mTLS 隧道' },
        { id: 'e5', from: 'n4', to: 'n6', kind: 'control', label: 'OIDC 登录' },
        { id: 'e6', from: 'n6', to: 'n7', kind: 'control', label: 'MFA 挑战' },
        { id: 'e7', from: 'n5', to: 'n8', kind: 'control', label: '策略查询' },
        { id: 'e8', from: 'n8', to: 'n6', kind: 'control', label: '身份与组属性' },
        { id: 'e9', from: 'n8', to: 'n9', kind: 'control', label: '设备态势' },
        { id: 'e10', from: 'n4', to: 'n9', kind: 'control', label: '态势上报' },
        { id: 'e11', from: 'n10', to: 'n3', kind: 'control', label: '签发证书' },
        { id: 'e12', from: 'n5', to: 'n12', kind: 'data', label: '按策略转发' },
        { id: 'e13', from: 'n12', to: 'n13', kind: 'data', label: 'HTTPS' },
        { id: 'e14', from: 'n12', to: 'n14', kind: 'data', label: 'SSH' },
        { id: 'e15', from: 'n13', to: 'n15', kind: 'data', label: 'SQL' },
        { id: 'e16', from: 'n5', to: 'n11', kind: 'log', label: '访问日志' },
        { id: 'e17', from: 'n8', to: 'n11', kind: 'log', label: '决策日志' },
        { id: 'e18', from: 'n12', to: 'n11', kind: 'log', label: '连接日志' },
        { id: 'e19', from: 'n12', to: 'n8', kind: 'control', label: '策略同步' }
      ]
    };
  }

  const PRESETS = [
    { id: 'remote-work', name: '远程办公 ZTNA 访问', description: '远程员工经 ZTNA 客户端与网关，按身份、设备证书与态势策略访问内部应用。', build: remoteWork }
  ];

  function getPreset(id) {
    const p = PRESETS.find(function (x) { return x.id === id; });
    return p ? Z.model.normalize(p.build()) : null;
  }

  Z.presets = { PRESETS: PRESETS, getPreset: getPreset };
})(globalThis.ZTNA = globalThis.ZTNA || {});
