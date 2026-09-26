// .pptx の入出力テスト用のプレゼンテーション（主な機能をひととおり含む）
import { Editor } from '../../src/core/editor.js';
import { createPresentation } from '../../src/core/model.js';
import { applyFont } from '../../src/core/richtext.js';

// 1x1 の赤い PNG
export const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

export function samplePresentation() {
  const e = new Editor(createPresentation());
  const [title, sub] = e.slide.objects;
  e.setText(title.id, '四半期の報告');
  e.setText(sub.id, '営業部 & <チーム>');
  e.slide.notes = '最初に挨拶する\n2 行目';
  e.newSlide('titleContent');
  const [t2, body] = e.slide.objects;
  e.setText(t2.id, '売上の推移');
  e.setText(body.id, '4月は好調\n5月は横ばい');
  const bp = e.findObject(body.id).paragraphs;
  bp[1].level = 1;
  applyFont(bp, { p: 0, o: 0 }, { p: 0, o: 2 }, (f) => { f.bold = true; f.color = '#FF0000'; f.size = 32; });
  bp[0].lineSpacing = 1.5;
  const r = e.insertObject('roundRect', { x: 600, y: 300, w: 200, h: 100, text: '図形の文字', fill: '@accent2:0.4', rotation: 15, flipH: true, shadow: true, opacity: 0.8 });
  e.insertObject('arrow', { x: 100, y: 400, w: 300, h: 50, stroke: '@accent6', strokeWidth: 3, dash: 'dash' });
  e.insertObject('star', { x: 50, y: 50, w: 80, h: 80 });
  e.slide.transition = { type: 'push', duration: 0.7, direction: 'fromLeft' };
  e.slide.advanceAfter = 5;
  const v = e.insertObject('text', { x: 820, y: 120, w: 60, h: 300, text: '縦書きの文', vertical: true, autoFit: 'none', alt: '縦書きの説明' });
  applyFont(e.findObject(v.id).paragraphs, { p: 0, o: 0 }, { p: 0, o: 2 }, (f) => { f.link = 'https://example.com/tate'; });
  e.findObject(r.id).link = 'https://example.com/shape';
  e.slide.animations = [
    { target: r.id, effect: 'fade', trigger: 'click', duration: 0.5 },
    { target: body.id, effect: 'flyIn', trigger: 'after', duration: 1, direction: 'fromLeft' },
    { target: t2.id, effect: 'wipe', trigger: 'click', duration: 0.5, direction: 'fromTop' },
    { target: e.slide.objects.find((o) => o.type === 'star').id, effect: 'zoom', trigger: 'with', duration: 0.5 },
  ];
  e.newSlide('blank');
  const t = e.insertTable(2, 3);
  const tt = e.findObject(t.id);
  tt.cells[0][0].paragraphs[0].runs[0].text = '項目';
  tt.cells[1][2].paragraphs[0].runs[0].text = '150';
  tt.cells[1][1].fill = '#FFFF00';
  e.insertImage(RED_PNG, { w: 100, h: 50 });
  const a = e.insertObject('rect', { x: 10, y: 10, w: 50, h: 50 });
  const b = e.insertObject('ellipse', { x: 100, y: 10, w: 50, h: 50 });
  e.setSelection([a.id, b.id]);
  e.group();
  e.slide.background = '@accent1:0.8';
  e.slide.hidden = true;
  e.pres.headerFooter = { ...e.pres.headerFooter, slideNumber: true, footer: '社外秘', showFooter: true };
  e.fitAll();
  return { pres: e.pres, ids: { rounded: r.id } };
}
