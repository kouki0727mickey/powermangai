import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, wrapText } from '../src/core/textlayout.js';

const measure = (s) => s.length * 10; // 1 文字 = 10px

test('英単語は空白ごとに 1 トークン、日本語は 1 文字ずつ', () => {
  assert.deepEqual(tokenize('Hello world'), ['Hello ', 'world']);
  assert.deepEqual(tokenize('日本語abc'), ['日', '本', '語', 'abc']);
  assert.deepEqual(tokenize('😀a'), ['😀', 'a']);
});

test('単語の途中では折り返さない', () => {
  assert.deepEqual(wrapText('Hello world foo', 100, measure), ['Hello', 'world foo']);
});

test('日本語は文字単位で折り返す', () => {
  assert.deepEqual(wrapText('あいうえおかき', 30, measure), ['あいう', 'えおか', 'き']);
});

test('改行と空行を保持する', () => {
  assert.deepEqual(wrapText('a\n\nb', 100, measure), ['a', '', 'b']);
  assert.deepEqual(wrapText('', 100, measure), ['']);
});

test('長すぎる単語は文字単位で分割', () => {
  assert.deepEqual(wrapText('abcdefgh', 30, measure), ['abc', 'def', 'gh']);
});

test('行幅が極端に狭くても無限ループしない', () => {
  assert.deepEqual(wrapText('abc', 1, measure), ['a', 'b', 'c']);
  assert.deepEqual(wrapText('あい', 0, measure), ['あ', 'い']);
});
