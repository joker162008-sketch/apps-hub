/* ztna-canvas core utilities. Classic script: attaches to globalThis.ZTNA so the
 * app works when index.html is opened directly from disk (file://). */
(function (Z) {
  'use strict';

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function unescapeXml(value) {
    return String(value)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /* Backslash-escape characters Markdown would treat as inline HTML, entities, code spans, emphasis or links. */
  function escapeMdText(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/[<>&`*[\]~]/g, '\\$&')
      .replace(/_/g, function (m, i, str) { /* intraword _ never forms emphasis; no lookbehind for older Safari */
        return /[A-Za-z0-9]/.test(str.charAt(i - 1)) && /[A-Za-z0-9]/.test(str.charAt(i + 1)) ? '_' : '\\_';
      })
      .replace(/\r?\n/g, ' ');
  }

  function unescapeMdText(value) {
    return String(value).replace(/\\([\\<>&`*_[\]~|])/g, '$1');
  }

  function escapeMdCell(value) {
    return escapeMdText(value).replace(/\|/g, '\\|');
  }

  /* Split one Markdown table row into raw cells, honouring \| and \\ escapes. */
  function splitMdRow(line) {
    const text = line.trim();
    const cells = [];
    let cur = '';
    let i = text.startsWith('|') ? 1 : 0;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\' && i + 1 < text.length && '|\\<>&`*_[]~'.indexOf(text[i + 1]) >= 0) {
        cur += text[i + 1];
        i++;
      } else if (ch === '|') {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim() !== '') cells.push(cur.trim());
    return cells;
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort()
        .filter(function (k) { return value[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ':' + canonicalJson(value[k]); })
        .join(',') + '}';
    }
    return JSON.stringify(value);
  }

  /* 32-bit FNV-1a over UTF-16 code units; deterministic in browser and Node. */
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function idNumber(id) {
    const m = /^[a-z]+(\d+)$/.exec(id);
    return m ? parseInt(m[1], 10) : 0;
  }

  /* Natural order for ids such as n2 < n10. */
  function compareIds(a, b) {
    const pa = String(a).replace(/\d+$/, '');
    const pb = String(b).replace(/\d+$/, '');
    if (pa !== pb) return pa < pb ? -1 : 1;
    return idNumber(a) - idNumber(b);
  }

  function sortedIds(ids) {
    return ids.slice().sort(compareIds);
  }

  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function safeFileName(title) {
    const cleaned = String(title || '').trim()
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
      .replace(/\s+/g, '-');
    return cleaned || 'ztna-canvas';
  }

  Z.util = {
    escapeXml: escapeXml,
    unescapeXml: unescapeXml,
    escapeMdText: escapeMdText,
    unescapeMdText: unescapeMdText,
    escapeMdCell: escapeMdCell,
    splitMdRow: splitMdRow,
    canonicalJson: canonicalJson,
    fnv1a: fnv1a,
    compareIds: compareIds,
    sortedIds: sortedIds,
    idNumber: idNumber,
    seededRandom: seededRandom,
    safeFileName: safeFileName
  };
})(globalThis.ZTNA = globalThis.ZTNA || {});
