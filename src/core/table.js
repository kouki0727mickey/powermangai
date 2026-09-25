// 表（テーブル）のモデルと操作
import { createObject } from './model.js';
import { defaultRunFont, fromPlainText } from './richtext.js';
import { layoutObjectText, approxMeasure } from './textlayout.js';
import { DEFAULT_THEME } from './colors.js';

export const CELL_INSET = { l: 7.2, t: 3.6, r: 7.2, b: 3.6 };
const ROW_H = 37;

export function createCell(text = '', header = false) {
  return { paragraphs: fromPlainText(text, defaultRunFont({ color: header ? '@bg1' : '@tx1', bold: header })), fill: null };
}

/** rows × cols の表（既定の幅はスライド幅 - 余白） */
export function createTable(rows, cols, props = {}) {
  const w = props.w ?? 800;
  return createObject('table', {
    w,
    h: rows * ROW_H,
    fill: null,
    stroke: null,
    headerRow: true,
    bandedRows: true,
    colWidths: Array.from({ length: cols }, () => w / cols),
    rowHeights: Array.from({ length: rows }, () => ROW_H),
    cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => createCell('', r === 0))),
    ...props,
  });
}

export function cellObject(o, r, c, h) {
  return { type: 'rect', w: o.colWidths[c], h, inset: CELL_INSET, anchor: 'top', wrap: true, paragraphs: o.cells[r][c].paragraphs };
}

/** 各行の高さ（文字量に応じて伸びる）と各セルの位置 */
export function tableLayout(o, measure = approxMeasure, theme = DEFAULT_THEME) {
  const heights = o.rowHeights.map((min, r) => {
    let h = min;
    for (let c = 0; c < o.colWidths.length; c++) {
      h = Math.max(h, layoutObjectText(cellObject(o, r, c, min), measure, theme).contentHeight);
    }
    return h;
  });
  const xs = [0];
  for (const w of o.colWidths) xs.push(xs[xs.length - 1] + w);
  const ys = [0];
  for (const h of heights) ys.push(ys[ys.length - 1] + h);
  return { heights, xs, ys, total: ys[ys.length - 1] };
}

/** 表の幅・高さを列幅・行の高さに合わせる */
export function fitTable(o, measure, theme) {
  o.w = o.colWidths.reduce((a, b) => a + b, 0);
  o.h = Math.round(tableLayout(o, measure, theme).total * 10) / 10;
}

export function insertRow(o, at) {
  const header = o.headerRow && at === 0;
  o.cells.splice(at, 0, o.colWidths.map(() => createCell('', header)));
  o.rowHeights.splice(at, 0, ROW_H);
}

export function insertColumn(o, at) {
  const w = o.w / o.colWidths.length;
  o.colWidths.splice(at, 0, w);
  o.cells.forEach((row, r) => row.splice(at, 0, createCell('', o.headerRow && r === 0)));
  // 表全体の幅は保ち、列幅を比例配分
  const total = o.colWidths.reduce((a, b) => a + b, 0);
  o.colWidths = o.colWidths.map((cw) => (cw * o.w) / total);
}

export function deleteRow(o, at) {
  if (o.cells.length <= 1) return false;
  o.cells.splice(at, 1);
  o.rowHeights.splice(at, 1);
  return true;
}

export function deleteColumn(o, at) {
  if (o.colWidths.length <= 1) return false;
  const removed = o.colWidths.splice(at, 1)[0];
  o.cells.forEach((row) => row.splice(at, 1));
  const total = o.colWidths.reduce((a, b) => a + b, 0);
  o.colWidths = o.colWidths.map((cw) => (cw * (total + removed)) / total);
  return true;
}
