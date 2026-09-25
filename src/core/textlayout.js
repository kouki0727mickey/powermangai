// テキストの折り返し（日本語は文字単位、英語は単語単位）

const WORD_CHAR = /[A-Za-z0-9À-ɏ'’\-_.,:;!?()"@#$%&*+/=<>[\]{}|~^`]/;

/** 段落を折り返しの単位（英単語＋後続空白 / 1 文字）に分割 */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (WORD_CHAR.test(ch)) {
      let j = i;
      while (j < text.length && WORD_CHAR.test(text[j])) j++;
      while (j < text.length && text[j] === ' ') j++;
      tokens.push(text.slice(i, j));
      i = j;
    } else {
      // サロゲートペア（絵文字など）を壊さない
      const cp = text.codePointAt(i);
      const len = cp > 0xffff ? 2 : 1;
      tokens.push(text.slice(i, i + len));
      i += len;
    }
  }
  return tokens;
}

/**
 * text を maxWidth に収まる行の配列にする。
 * measure(str) は文字列の幅を返す関数（canvas の measureText を想定）。
 */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    const fits = (str) => measure(str.trimEnd()) <= maxWidth;
    for (const token of tokenize(para)) {
      if (line === '' || fits(line + token)) {
        if (line !== '' || fits(token) || token.length === 1) {
          line += token;
          continue;
        }
      } else {
        lines.push(line.trimEnd());
        line = '';
        if (fits(token) || token.length === 1) { line = token.trimStart(); continue; }
      }
      // 1 単語が行幅を超える場合は文字単位で分割（line は空の状態でここに来る）
      for (const ch of Array.from(token)) {
        if (line !== '' && !fits(line + ch)) {
          lines.push(line.trimEnd());
          line = ch.trimStart();
        } else {
          line += ch;
        }
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
