// 小さな XML パーサーと書き出し用のヘルパー（.pptx 用）。
// 名前空間の接頭辞は、既知の URI なら標準の接頭辞（p: a: r: など）にそろえる。

const KNOWN_NS = {
  'http://schemas.openxmlformats.org/presentationml/2006/main': 'p',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://schemas.openxmlformats.org/package/2006/relationships': '',
  'http://schemas.openxmlformats.org/package/2006/content-types': '',
  'http://schemas.microsoft.com/office/powerpoint/2010/main': 'p14',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
};

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** XML 文字列 → { name, attrs, children, text }（ルート要素） */
export function parseXml(src) {
  const text = typeof src === 'string' ? src : new TextDecoder().decode(src);
  let i = 0;
  const root = { name: '#document', attrs: {}, children: [], nsMap: {} };
  const stack = [root];
  const n = text.length;
  const mapName = (qname, nsMap, isAttr) => {
    const c = qname.indexOf(':');
    const prefix = c === -1 ? '' : qname.slice(0, c);
    const local = c === -1 ? qname : qname.slice(c + 1);
    if (isAttr && c === -1) return local;
    const uri = nsMap[prefix];
    if (uri !== undefined && KNOWN_NS[uri] !== undefined) {
      const std = KNOWN_NS[uri];
      return std ? `${std}:${local}` : local;
    }
    return qname;
  };
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    if (lt > i) {
      const t = text.slice(i, lt);
      const cur = stack[stack.length - 1];
      if (cur.children.length === 0 || typeof cur.children[cur.children.length - 1] !== 'string') cur.children.push(decodeEntities(t));
      else cur.children[cur.children.length - 1] += decodeEntities(t);
    }
    if (text.startsWith('<?', lt)) { i = text.indexOf('?>', lt) + 2; continue; }
    if (text.startsWith('<!--', lt)) { i = text.indexOf('-->', lt) + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt);
      stack[stack.length - 1].children.push(text.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (text.startsWith('<!', lt)) { i = text.indexOf('>', lt) + 1; continue; }
    if (text[lt + 1] === '/') {
      const gt = text.indexOf('>', lt);
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }
    // 開始タグ
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(text[j])) j++;
    const qname = text.slice(lt + 1, j);
    const rawAttrs = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === '/') { selfClose = true; j = text.indexOf('>', j) + 1; break; }
      if (text[j] === '>') { j++; break; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(text[k])) k++;
      const an = text.slice(j, k);
      while (k < n && /\s/.test(text[k])) k++;
      if (text[k] === '=') {
        k++;
        while (k < n && /\s/.test(text[k])) k++;
        const q = text[k];
        const end = text.indexOf(q, k + 1);
        rawAttrs[an] = decodeEntities(text.slice(k + 1, end));
        j = end + 1;
      } else {
        rawAttrs[an] = '';
        j = k;
      }
    }
    const parent = stack[stack.length - 1];
    const nsMap = { ...parent.nsMap };
    for (const [k, v] of Object.entries(rawAttrs)) {
      if (k === 'xmlns') nsMap[''] = v;
      else if (k.startsWith('xmlns:')) nsMap[k.slice(6)] = v;
    }
    const attrs = {};
    for (const [k, v] of Object.entries(rawAttrs)) {
      if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
      attrs[mapName(k, nsMap, true)] = v;
    }
    const el = { name: mapName(qname, nsMap, false), attrs, children: [], nsMap };
    parent.children.push(el);
    if (!selfClose) stack.push(el);
    i = j;
  }
  const top = root.children.find((c) => typeof c !== 'string');
  if (!top) throw new Error('XML の形式が正しくありません');
  return top;
}

// ---- 検索ヘルパー
export const kids = (el, name) => (el ? el.children.filter((c) => typeof c !== 'string' && (!name || c.name === name)) : []);
export const kid = (el, name) => (el ? el.children.find((c) => typeof c !== 'string' && c.name === name) || null : null);
/** パス（'p:cSld/p:spTree'）で子孫をたどる */
export function path(el, p) {
  let cur = el;
  for (const part of p.split('/')) { cur = kid(cur, part); if (!cur) return null; }
  return cur;
}
export function textOf(el) {
  if (!el) return '';
  return el.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
/** 子孫をすべてたどる */
export function* walk(el) {
  for (const c of kids(el)) { yield c; yield* walk(c); }
}

// ---- 書き出しヘルパー
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // XML 1.0 で使えない制御文字を除く（タブ・改行は残す）
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
}

/** タグを作る: tag('a:off', { x: 1 }) / tag('a:t', {}, '文字')。子は文字列（XML）の配列でもよい */
export function tag(name, attrs = {}, ...children) {
  const a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v === true ? 1 : v)}"`).join('');
  const inner = children.flat().filter((c) => c !== undefined && c !== null && c !== false && c !== '').join('');
  return inner ? `<${name}${a}>${inner}</${name}>` : `<${name}${a}/>`;
}

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
