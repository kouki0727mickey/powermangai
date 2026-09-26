// 組み込みの練習課題。target が完成形、start が開始状態。
// 目標値は、既定の挿入位置からショートカットだけで到達できる値にしてある。
import { createObject, createPresentation, createSlide } from './model.js';

/** プレースホルダーの書式を保ったまま文字を入れる */
function setPh(obj, text, fontPatch = {}) {
  for (const p of obj.paragraphs) for (const r of p.runs) Object.assign(r.font, fontPatch);
  obj.paragraphs[0].runs[0].text = text;
  return obj;
}

const pres = (slides) => ({ ...createPresentation(), slides });
const slide = (objects) => ({ ...createSlide('blank'), objects });
const o = (type, props) => createObject(type, props);

function titleSlide(title, subtitle) {
  const s = createSlide('title');
  setPh(s.objects[0], title);
  setPh(s.objects[1], subtitle);
  return s;
}

function contentSlide(title, body) {
  const s = createSlide('titleContent');
  setPh(s.objects[0], title);
  setPh(s.objects[1], body);
  return s;
}

function blankStart() { return pres([createSlide('blank')]); }

export const CHALLENGES = [
  {
    id: 'c1-title',
    level: 1,
    title: 'タイトル スライドに入力',
    description: 'プレースホルダーを Tab で選び、文字を入力します。',
    hints: [
      'Tab … タイトルのプレースホルダーを選択',
      '文字を入力（選択中に入力すると編集が始まります）／ Enter・F2 でも編集開始',
      'Esc … 編集を終了して図形の選択に戻る',
      'Tab … 次のプレースホルダーへ（Ctrl+Enter でも移動できます）',
    ],
    start: () => createPresentation(),
    target: () => pres([titleSlide('ショートカット練習', 'キーボードだけで作る')]),
  },
  {
    id: 'c2-textbox',
    level: 1,
    title: 'テキスト ボックスと文字書式',
    description: 'テキスト ボックスを挿入し、太字・中央揃え・サイズ・色を設定して上端にそろえます。',
    hints: [
      'Alt → N → X … テキスト ボックスを挿入',
      '「重要なお知らせ」と入力して Esc',
      'Ctrl+B … 太字 ／ Ctrl+E … 中央揃え',
      'Alt → H → F → S … フォント サイズに 32 を入力して Enter（Ctrl+Shift+> でも可）',
      'Alt → H → F → C … フォントの色（矢印キーで「赤」を選び Enter）',
      'Alt → H → G → A → T … 上揃え',
    ],
    start: blankStart,
    target: () => pres([slide([
      o('text', { x: 320, y: 0, text: '重要なお知らせ', align: 'center', font: { size: 32, bold: true, color: '#FF0000' } }),
    ])]),
  },
  {
    id: 'c3-shapes',
    level: 2,
    title: '図形の挿入と塗りつぶし',
    description: '四角形を左上、楕円を右下に配置し、色を変えます。',
    hints: [
      'Alt → N → S → H … 図形ギャラリー（矢印キーで選んで Enter）',
      'Alt → H → S → F … 図形の塗りつぶし（標準の色の「赤」）',
      'Alt → H → G → A → L / T … 左揃え・上揃え',
      '楕円は 標準の色の「オレンジ」、Alt → H → G → A → R / B で右下へ',
    ],
    start: blankStart,
    target: () => pres([slide([
      o('rect', { x: 0, y: 0, fill: '#FF0000' }),
      o('ellipse', { x: 800, y: 420, fill: '#FFC000' }),
    ])]),
  },
  {
    id: 'c4-duplicate',
    level: 2,
    title: '複製と整列',
    description: '緑の楕円を 3 つ作り、左端・中央・右端に等間隔で並べます。',
    hints: [
      '楕円を挿入して Alt → H → S → F で「緑」',
      'Ctrl+D … 複製（2 回）',
      'Tab で 1 つずつ選び、Alt → H → G → A → L / C / R（左・中央・右）',
      '同じく Alt → H → G → A → M … 上下中央（1 つだけ選択中はスライド基準）',
      '参考: 3 つ以上を選ぶと Alt → H → G → A → H（左右に整列）は選択範囲の両端基準になります',
    ],
    start: blankStart,
    target: () => pres([slide([
      o('ellipse', { x: 0, y: 210, fill: '#70AD47' }),
      o('ellipse', { x: 400, y: 210, fill: '#70AD47' }),
      o('ellipse', { x: 800, y: 210, fill: '#70AD47' }),
    ])]),
  },
  {
    id: 'c5-slides',
    level: 2,
    title: 'スライドを追加する',
    description: '3 枚のスライドを作ります。2 枚目以降は「タイトルとコンテンツ」です。',
    hints: [
      'Ctrl+M … 新しいスライド（Ctrl+Enter で最後のプレースホルダーから次のスライドへ）',
      'Tab → 入力 → Esc の繰り返し',
      'F6 … スライド一覧へ移動し、Ctrl+↑/↓ で並べ替え',
      'PageUp / PageDown … スライドの切り替え',
    ],
    start: () => createPresentation(),
    target: () => pres([
      titleSlide('プロジェクト報告', '2026年度'),
      contentSlide('目的', '売上を伸ばす'),
      contentSlide('まとめ', '次回に続く'),
    ]),
  },
  {
    id: 'c6-group',
    level: 3,
    title: '回転とグループ化',
    description: '三角形を逆さにし、四角形と楕円を左右の端に置いてグループ化します。',
    hints: [
      '四角形を挿入して Alt → H → G → A → L、楕円を挿入して Alt → H → G → A → R',
      'Ctrl+A … すべて選択 → Ctrl+G … グループ化（Ctrl+Shift+G で解除）',
      '三角形を挿入し、塗りつぶしを「オレンジ」に',
      'Alt → H → G → O → R … 右へ 90 度回転（2 回で 180 度）／ Alt+→ は 15 度ずつ',
    ],
    start: blankStart,
    target: () => {
      const rect = o('rect', { x: 0, y: 210, groupId: 'g1' });
      const ell = o('ellipse', { x: 800, y: 210, groupId: 'g1' });
      const tri = o('triangle', { x: 400, y: 210, rotation: 180, fill: '#ED7D31' });
      return pres([slide([rect, ell, tri])]);
    },
  },
  {
    id: 'c7-banner',
    level: 3,
    title: '帯と重なり順',
    description: 'スライド上部に帯（四角形）を作り、既存の文字の背面に移動します。',
    hints: [
      '四角形を挿入 → Alt → J → D → W … 幅に 960、Alt → J → D → H … 高さに 120',
      'Alt → H → G → A → L / T … 左上へ',
      'Alt → H → S → F … 塗りつぶし「青灰色」',
      'Ctrl+Shift+[ … 最背面へ移動（Alt → H → G → K でも可）',
    ],
    start: () => pres([slide([
      o('text', { x: 0, y: 36, w: 960, h: 60, text: 'Keyboard Only', align: 'center', font: { size: 40, bold: true, color: '#FFFFFF' } }),
    ])]),
    target: () => pres([slide([
      o('rect', { x: 0, y: 0, w: 960, h: 120, fill: '#44546A' }),
      o('text', { x: 0, y: 36, w: 960, h: 60, text: 'Keyboard Only', align: 'center', font: { size: 40, bold: true, color: '#FFFFFF' } }),
    ])]),
  },
  {
    id: 'c8-agenda',
    level: 4,
    title: '総合: アジェンダ',
    description: 'タイトルと 3 つの角丸四角形のアジェンダを作ります。',
    hints: [
      'Ctrl+M で「タイトルとコンテンツ」を追加し、本文プレースホルダーは Delete で削除',
      '角丸四角形に文字を入力し、Ctrl+D で複製して文字を変更',
      'Alt → J → D → W / H でサイズ、Alt → H → G → A で配置、H で左右に整列',
      'Alt → H → F → S でフォント サイズ、Ctrl+B で太字',
    ],
    start: () => createPresentation(),
    target: () => {
      const title = titleSlide('社内勉強会', 'ショートカット編');
      const agenda = createSlide('titleContent');
      agenda.objects = [
        setPh(agenda.objects[0], 'アジェンダ', { bold: true }),
        o('roundRect', { x: 0, y: 210, w: 240, h: 120, text: '基本操作', font: { size: 24 } }),
        o('roundRect', { x: 360, y: 210, w: 240, h: 120, text: '図形', font: { size: 24 } }),
        o('roundRect', { x: 720, y: 210, w: 240, h: 120, text: 'スライド', font: { size: 24 } }),
      ];
      return pres([title, agenda]);
    },
  },
];

export function findChallenge(id) {
  return CHALLENGES.find((c) => c.id === id) || null;
}
