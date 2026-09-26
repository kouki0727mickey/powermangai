import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportPptx, buildPptxFiles, colorXml } from '../src/core/pptx-write.js';
import { parseXml } from '../src/core/xml.js';
import { samplePresentation } from './fixtures/sample-pres.js';

const hasPythonPptx = spawnSync('python3', ['-c', 'import pptx']).status === 0;
const hasSoffice = spawnSync('which', ['soffice']).status === 0;

test('色の書き出し（テーマの色・明るさ・透明度）', () => {
  assert.equal(colorXml('#ff0000'), '<a:srgbClr val="FF0000"/>');
  assert.equal(colorXml('@accent1'), '<a:schemeClr val="accent1"/>');
  assert.equal(colorXml('@accent1:0.8'), '<a:schemeClr val="accent1"><a:lumMod val="20000"/><a:lumOff val="80000"/></a:schemeClr>');
  assert.equal(colorXml('@tx1:-0.25', 0.5), '<a:schemeClr val="tx1"><a:lumMod val="75000"/><a:alpha val="50000"/></a:schemeClr>');
});

test('すべての XML が整形式で、関係と Content Types の対象がそろっている', () => {
  const { pres } = samplePresentation();
  const files = buildPptxFiles(pres);
  for (const [name, content] of Object.entries(files)) {
    if (typeof content === 'string') assert.doesNotThrow(() => parseXml(content), name);
  }
  // .rels の参照先が存在する
  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith('.rels')) continue;
    const base = name.replace(/_rels\/[^/]*\.rels$/, '');
    for (const m of content.matchAll(/Target="([^"]+)"(?! TargetMode="External")/g)) {
      const target = path.posix.normalize(path.posix.join(base, m[1]));
      assert.ok(files[target], `${name} → ${target}`);
    }
  }
  // Content Types の Override の対象が存在する
  for (const m of files['[Content_Types].xml'].matchAll(/PartName="\/([^"]+)"/g)) assert.ok(files[m[1]], m[1]);
  assert.ok(files['ppt/media/image1.png']);
  assert.ok(files['ppt/notesSlides/notesSlide1.xml']);
  assert.ok(!files['ppt/notesSlides/notesSlide2.xml'], 'ノートのないスライドにはノートを作らない');
});

test('python-pptx で開ける（図形・文字・書式・表・画像・ノート）', { skip: !hasPythonPptx }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pmgpptx-'));
  const file = path.join(dir, 'out.pptx');
  writeFileSync(file, await exportPptx(samplePresentation().pres));
  const script = `
import json, sys
from pptx import Presentation
p = Presentation(sys.argv[1])
out = {'w': p.slide_width, 'h': p.slide_height, 'slides': []}
for s in p.slides:
    shapes = []
    for sh in s.shapes:
        d = {'type': str(sh.shape_type), 'name': sh.name, 'x': sh.left, 'rot': sh.rotation}
        try:
            d['click'] = sh.click_action.hyperlink.address
        except Exception:
            pass
        if sh.has_text_frame:
            d['text'] = sh.text_frame.text
            d['links'] = [r.hyperlink.address for para in sh.text_frame.paragraphs for r in para.runs if r.hyperlink.address]
            runs = [(r.text, r.font.bold, r.font.size.pt if r.font.size else None) for para in sh.text_frame.paragraphs for r in para.runs]
            d['runs'] = runs
            d['levels'] = [para.level for para in sh.text_frame.paragraphs]
        if sh.has_table:
            d['cells'] = [[c.text for c in row.cells] for row in sh.table.rows]
        if sh.is_placeholder:
            d['ph'] = str(sh.placeholder_format.type)
        shapes.append(d)
    notes = s.notes_slide.notes_text_frame.text if s.has_notes_slide else None
    out['slides'].append({'layout': s.slide_layout.name, 'shapes': shapes, 'notes': notes})
print(json.dumps(out, ensure_ascii=False))
`;
  const out = JSON.parse(execFileSync('python3', ['-c', script, file]).toString());
  assert.deepEqual([out.w, out.h], [12192000, 6858000]);
  assert.equal(out.slides.length, 3);
  const [s1, s2, s3] = out.slides;
  assert.equal(s1.layout, 'タイトル スライド');
  assert.equal(s1.shapes[0].text, '四半期の報告');
  assert.match(s1.shapes[0].ph, /CENTER_TITLE/);
  assert.equal(s1.shapes[1].text, '営業部 & <チーム>');
  assert.equal(s1.notes, '最初に挨拶する\n2 行目');
  const body = s2.shapes[1];
  assert.equal(body.text, '4月は好調\n5月は横ばい');
  assert.deepEqual(body.levels, [0, 1]);
  assert.deepEqual(body.runs[0], ['4月', true, 32]);
  const rounded = s2.shapes.find((sh) => sh.text === '図形の文字');
  assert.equal(rounded.rot, 15);
  assert.equal(rounded.click, 'https://example.com/shape');
  assert.deepEqual(s2.shapes.find((sh) => sh.text === '縦書きの文').links, ['https://example.com/tate']);
  assert.ok(s2.shapes.some((sh) => sh.type.includes('LINE') || sh.type.includes('CONNECTOR') || sh.name.startsWith('Shape')));
  const table = s3.shapes.find((sh) => sh.cells);
  assert.deepEqual(table.cells, [['項目', '', ''], ['', '', '150']]);
  assert.ok(s3.shapes.some((sh) => sh.type.includes('PICTURE')));
  assert.ok(s3.shapes.some((sh) => sh.type.includes('GROUP')));
  assert.ok(s3.shapes.some((sh) => sh.text === '社外秘'), 'フッター');
});

test('LibreOffice で開いて PDF に変換できる', { skip: !hasSoffice, timeout: 180000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pmgsoffice-'));
  const file = path.join(dir, 'out.pptx');
  writeFileSync(file, await exportPptx(samplePresentation().pres));
  const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pdf', '--outdir', dir, file], { timeout: 170000 });
  assert.equal(r.status, 0, r.stderr?.toString());
  assert.ok(existsSync(path.join(dir, 'out.pdf')), readdirSync(dir).join(','));
});
