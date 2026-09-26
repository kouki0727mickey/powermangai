import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readZip, writeZip, crc32 } from '../src/core/zip.js';
import { parseXml, kid, kids, path as xpath, textOf, tag, esc } from '../src/core/xml.js';

test('CRC32', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('ZIP: 書いたものを読める（日本語のファイル名・無圧縮と圧縮）', async () => {
  const big = 'あいう'.repeat(1000);
  const z = await writeZip({ 'a.txt': 'hello', 'フォルダ/b.txt': big, 'c.bin': new Uint8Array([1, 2, 3]) });
  const files = await readZip(z);
  assert.equal(new TextDecoder().decode(files['a.txt']), 'hello');
  assert.equal(new TextDecoder().decode(files['フォルダ/b.txt']), big);
  assert.deepEqual([...files['c.bin']], [1, 2, 3]);
});

test('ZIP: 他のツールで作った ZIP を読め、作った ZIP は他のツールで展開できる', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pmgzip-'));
  writeFileSync(path.join(dir, 'x.txt'), 'x'.repeat(5000));
  execFileSync('python3', ['-c', `import zipfile;z=zipfile.ZipFile('${dir}/py.zip','w',zipfile.ZIP_DEFLATED);z.write('${dir}/x.txt','d/x.txt');z.close()`]);
  const files = await readZip(readFileSync(path.join(dir, 'py.zip')));
  assert.equal(new TextDecoder().decode(files['d/x.txt']).length, 5000);
  writeFileSync(path.join(dir, 'ours.zip'), await writeZip({ 'y/z.xml': '<a>テスト</a>' }));
  const out = execFileSync('python3', ['-c', `import zipfile;z=zipfile.ZipFile('${dir}/ours.zip');print(z.testzip());print(z.read('y/z.xml').decode())`]).toString();
  assert.match(out, /None\n<a>テスト<\/a>/);
});

test('ZIP: 壊れたデータはエラー', async () => {
  await assert.rejects(readZip(new Uint8Array(100)), /ZIP/);
});

test('XML: 要素・属性・文字・実体参照・CDATA・コメント', () => {
  const x = parseXml('<?xml version="1.0"?><!-- c --><r a="1&amp;2"><b>x &lt; y &#x3042;&#12354;</b><c/><![CDATA[<raw>]]></r>');
  assert.equal(x.name, 'r');
  assert.equal(x.attrs.a, '1&2');
  assert.equal(textOf(kid(x, 'b')), 'x < y ああ');
  assert.ok(kid(x, 'c'));
  assert.ok(x.children.includes('<raw>'));
});

test('XML: 名前空間の接頭辞を標準の接頭辞にそろえる', () => {
  const x = parseXml('<pp:sld xmlns:pp="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:rr="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><pp:cSld><d:t rr:id="rId1">z</d:t></pp:cSld></pp:sld>');
  assert.equal(x.name, 'p:sld');
  const t = xpath(x, 'p:cSld/a:t');
  assert.equal(t.attrs['r:id'], 'rId1');
  assert.equal(kids(xpath(x, 'p:cSld')).length, 1);
});

test('XML の書き出し', () => {
  assert.equal(tag('a:off', { x: 1, y: 0, z: undefined }), '<a:off x="1" y="0"/>');
  assert.equal(tag('a:t', {}, esc('<&>')), '<a:t>&lt;&amp;&gt;</a:t>');
  assert.equal(esc('a\u0001b\tc'), 'ab\tc');
  assert.equal(tag('b', { v: true }), '<b v="1"/>');
});

test('XML: 壊れた記述はエラーになる（止まらない）', () => {
  for (const bad of ['<a><?x', '<a><!-- x', '<a><!x', '<a b="1><c/></a>', '<a b=1/>', '<a', '<a><![CDATA[x', '<a><b>text']) {
    assert.throws(() => parseXml(bad), /XML/, bad);
  }
});

test('ZIP: 申告より大きく展開されるデータは上限で止まる', async () => {
  const { inflateRaw, deflateRaw } = await import('../src/core/zip.js');
  const big = await deflateRaw(new Uint8Array(1_000_000));
  await assert.rejects(inflateRaw(big, 1000), /大きすぎ/);
  assert.equal((await inflateRaw(big)).length, 1_000_000);
});
