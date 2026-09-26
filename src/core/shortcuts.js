// PowerPoint (Windows) に準拠したショートカット表。
// contexts: editor = スライド編集領域, slides = スライド一覧(サムネイル), text = テキスト編集中, show = スライドショー
const E = ['editor'];
const ES = ['editor', 'slides', 'sorter'];
const S = ['slides', 'sorter'];
const ALL = ['editor', 'slides', 'sorter', 'text', 'notes'];

export const BINDINGS = [
  // ファイル
  { action: 'newPresentation', keys: ['Ctrl+N'], contexts: ES, category: 'ファイル', label: '新しいプレゼンテーション' },
  { action: 'open', keys: ['Ctrl+O', 'Ctrl+F12'], contexts: ES, category: 'ファイル', label: '開く' },
  { action: 'save', keys: ['Ctrl+S', 'Shift+F12'], contexts: ALL, category: 'ファイル', label: '上書き保存' },
  { action: 'saveAs', keys: ['F12', 'Ctrl+Shift+S'], contexts: ALL, category: 'ファイル', label: '名前を付けて保存' },
  { action: 'print', keys: ['Ctrl+P'], contexts: ALL, category: 'ファイル', label: '印刷 / PDF に出力' },
  { action: 'closeWindow', keys: ['Ctrl+W', 'Ctrl+F4'], contexts: ALL, category: 'ファイル', label: '閉じる' },

  // 共通編集
  { action: 'undo', keys: ['Ctrl+Z'], contexts: ES, category: '編集', label: '元に戻す' },
  { action: 'redo', keys: ['Ctrl+Y', 'F4'], contexts: ES, category: '編集', label: 'やり直し / 繰り返し' },
  { action: 'copy', keys: ['Ctrl+C', 'Ctrl+Insert'], contexts: ES, category: '編集', label: 'コピー' },
  { action: 'cut', keys: ['Ctrl+X', 'Shift+Delete'], contexts: ES, category: '編集', label: '切り取り' },
  { action: 'paste', keys: ['Ctrl+V', 'Shift+Insert'], contexts: ES, category: '編集', label: '貼り付け' },
  { action: 'pasteSpecial', keys: ['Ctrl+Alt+V'], contexts: ES, category: '編集', label: '形式を選択して貼り付け' },
  { action: 'duplicate', keys: ['Ctrl+D'], contexts: ES, category: '編集', label: '複製（オブジェクト / スライド）' },
  { action: 'selectAll', keys: ['Ctrl+A'], contexts: E, category: '選択', label: 'すべてのオブジェクトを選択' },
  { action: 'selectNext', keys: ['Tab'], contexts: E, category: '選択', label: '次のオブジェクトを選択' },
  { action: 'selectPrev', keys: ['Shift+Tab'], contexts: E, category: '選択', label: '前のオブジェクトを選択' },
  { action: 'escape', keys: ['Escape'], contexts: [...ES, 'notes'], category: '選択', label: '選択解除 / ノートから編集領域へ' },
  { action: 'find', keys: ['Ctrl+F'], contexts: ALL, category: '編集', label: '検索' },
  { action: 'replace', keys: ['Ctrl+H'], contexts: ALL, category: '編集', label: '置換' },
  { action: 'delete', keys: ['Delete', 'Backspace'], contexts: ES, category: '編集', label: '削除（オブジェクト / スライド）' },

  // テキスト編集
  { action: 'startEdit', keys: ['Enter', 'F2'], contexts: E, category: 'テキスト', label: 'テキスト編集を開始' },
  { action: 'endEdit', keys: ['Escape', 'F2'], contexts: ['text'], category: 'テキスト', label: 'テキスト編集を終了（図形を選択）' },
  { action: 'nextPlaceholder', keys: ['Ctrl+Enter'], contexts: ['editor', 'text'], category: 'テキスト', label: '次のプレースホルダー / 新しいスライド' },
  { action: 'bold', keys: ['Ctrl+B'], contexts: [...E, 'text'], category: '書式', label: '太字' },
  { action: 'italic', keys: ['Ctrl+I'], contexts: [...E, 'text'], category: '書式', label: '斜体' },
  { action: 'underline', keys: ['Ctrl+U'], contexts: [...E, 'text'], category: '書式', label: '下線' },
  { action: 'fontGrow', keys: ['Ctrl+Shift+>', 'Ctrl+]'], contexts: [...E, 'text'], category: '書式', label: 'フォント サイズの拡大' },
  { action: 'fontShrink', keys: ['Ctrl+Shift+<', 'Ctrl+['], contexts: [...E, 'text'], category: '書式', label: 'フォント サイズの縮小' },
  { action: 'clearFormat', keys: ['Ctrl+Space'], contexts: [...E, 'text'], category: '書式', label: '文字書式のクリア' },
  { action: 'changeCase', keys: ['Shift+F3'], contexts: [...E, 'text'], category: '書式', label: '大文字 / 小文字の切り替え' },
  { action: 'alignLeft', keys: ['Ctrl+L'], contexts: [...E, 'text'], category: '段落', label: '左揃え' },
  { action: 'alignCenter', keys: ['Ctrl+E'], contexts: [...E, 'text'], category: '段落', label: '中央揃え' },
  { action: 'alignRight', keys: ['Ctrl+R'], contexts: [...E, 'text'], category: '段落', label: '右揃え' },
  { action: 'alignJustify', keys: ['Ctrl+J'], contexts: [...E, 'text'], category: '段落', label: '両端揃え' },
  { action: 'copyFormat', keys: ['Ctrl+Shift+C'], contexts: [...E, 'text'], category: '書式', label: '書式のコピー' },
  { action: 'pasteFormat', keys: ['Ctrl+Shift+V'], contexts: [...E, 'text'], category: '書式', label: '書式の貼り付け' },
  { action: 'subscript', keys: ['Ctrl+='], contexts: [...E, 'text'], category: '書式', label: '下付き' },
  { action: 'superscript', keys: ['Ctrl+Shift+=', 'Ctrl+Shift++'], contexts: [...E, 'text'], category: '書式', label: '上付き' },
  { action: 'lineSpacing1', keys: ['Ctrl+1'], contexts: [...E, 'text'], category: '段落', label: '行間 1.0' },
  { action: 'lineSpacing15', keys: ['Ctrl+5'], contexts: [...E, 'text'], category: '段落', label: '行間 1.5' },
  { action: 'lineSpacing2', keys: ['Ctrl+2'], contexts: [...E, 'text'], category: '段落', label: '行間 2.0' },
  { action: 'demote', keys: ['Alt+Shift+ArrowRight'], contexts: [...E, 'text'], category: '段落', label: 'インデントを増やす（レベル下げ）' },
  { action: 'promote', keys: ['Alt+Shift+ArrowLeft'], contexts: [...E, 'text'], category: '段落', label: 'インデントを減らす（レベル上げ）' },
  { action: 'moveParaUp', keys: ['Alt+Shift+ArrowUp'], contexts: ['text'], category: '段落', label: '段落を上へ移動' },
  { action: 'moveParaDown', keys: ['Alt+Shift+ArrowDown'], contexts: ['text'], category: '段落', label: '段落を下へ移動' },
  { action: 'textUndo', keys: ['Ctrl+Z'], contexts: ['text'], category: 'テキスト', label: '元に戻す（入力中）' },
  { action: 'textRedo', keys: ['Ctrl+Y'], contexts: ['text'], category: 'テキスト', label: 'やり直し（入力中）' },
  { action: 'fontDialog', keys: ['Ctrl+T', 'Ctrl+Shift+F', 'Ctrl+Shift+P'], contexts: [...E, 'text'], category: '書式', label: 'フォント ダイアログ' },

  // 図形の操作
  { action: 'moveUp', keys: ['ArrowUp'], contexts: E, category: '図形', label: '上へ移動' },
  { action: 'moveDown', keys: ['ArrowDown'], contexts: E, category: '図形', label: '下へ移動' },
  { action: 'moveLeft', keys: ['ArrowLeft'], contexts: E, category: '図形', label: '左へ移動' },
  { action: 'moveRight', keys: ['ArrowRight'], contexts: E, category: '図形', label: '右へ移動' },
  { action: 'nudgeUp', keys: ['Ctrl+ArrowUp'], contexts: E, category: '図形', label: '上へ 1px 移動' },
  { action: 'nudgeDown', keys: ['Ctrl+ArrowDown'], contexts: E, category: '図形', label: '下へ 1px 移動' },
  { action: 'nudgeLeft', keys: ['Ctrl+ArrowLeft'], contexts: E, category: '図形', label: '左へ 1px 移動' },
  { action: 'nudgeRight', keys: ['Ctrl+ArrowRight'], contexts: E, category: '図形', label: '右へ 1px 移動' },
  { action: 'growW', keys: ['Shift+ArrowRight'], contexts: E, category: '図形', label: '幅を広げる' },
  { action: 'shrinkW', keys: ['Shift+ArrowLeft'], contexts: E, category: '図形', label: '幅を狭める' },
  { action: 'growH', keys: ['Shift+ArrowUp'], contexts: E, category: '図形', label: '高さを高くする' },
  { action: 'shrinkH', keys: ['Shift+ArrowDown'], contexts: E, category: '図形', label: '高さを低くする' },
  { action: 'growWFine', keys: ['Ctrl+Shift+ArrowRight'], contexts: E, category: '図形', label: '幅を 1px 広げる' },
  { action: 'shrinkWFine', keys: ['Ctrl+Shift+ArrowLeft'], contexts: E, category: '図形', label: '幅を 1px 狭める' },
  { action: 'growHFine', keys: ['Ctrl+Shift+ArrowUp'], contexts: E, category: '図形', label: '高さを 1px 高くする' },
  { action: 'shrinkHFine', keys: ['Ctrl+Shift+ArrowDown'], contexts: E, category: '図形', label: '高さを 1px 低くする' },
  { action: 'rotateRight', keys: ['Alt+ArrowRight'], contexts: E, category: '図形', label: '右へ 15° 回転' },
  { action: 'rotateLeft', keys: ['Alt+ArrowLeft'], contexts: E, category: '図形', label: '左へ 15° 回転' },
  { action: 'rotateRightFine', keys: ['Ctrl+Alt+ArrowRight'], contexts: E, category: '図形', label: '右へ 1° 回転' },
  { action: 'rotateLeftFine', keys: ['Ctrl+Alt+ArrowLeft'], contexts: E, category: '図形', label: '左へ 1° 回転' },
  { action: 'selectionPane', keys: ['Alt+F10'], contexts: ES, category: '図形', label: '選択ウィンドウ（オブジェクトの選択と表示）' },
  { action: 'group', keys: ['Ctrl+G'], contexts: E, category: '図形', label: 'グループ化' },
  { action: 'ungroup', keys: ['Ctrl+Shift+G'], contexts: E, category: '図形', label: 'グループ解除' },
  { action: 'bringToFront', keys: ['Ctrl+Shift+]'], contexts: E, category: '図形', label: '最前面へ移動' },
  { action: 'sendToBack', keys: ['Ctrl+Shift+['], contexts: E, category: '図形', label: '最背面へ移動' },

  // スライド
  { action: 'newSlide', keys: ['Ctrl+M'], contexts: ALL, category: 'スライド', label: '新しいスライド' },
  { action: 'nextSlide', keys: ['PageDown'], contexts: ES, category: 'スライド', label: '次のスライド' },
  { action: 'prevSlide', keys: ['PageUp'], contexts: ES, category: 'スライド', label: '前のスライド' },
  { action: 'nextSlide', keys: ['ArrowDown', 'ArrowRight'], contexts: ['slides'], category: 'スライド', label: '次のスライド（一覧）' },
  { action: 'prevSlide', keys: ['ArrowUp', 'ArrowLeft'], contexts: ['slides'], category: 'スライド', label: '前のスライド（一覧）' },
  { action: 'nextSlide', keys: ['ArrowRight'], contexts: ['sorter'], category: '表示', label: '次のスライド（スライド一覧表示）' },
  { action: 'prevSlide', keys: ['ArrowLeft'], contexts: ['sorter'], category: '表示', label: '前のスライド（スライド一覧表示）' },
  { action: 'sorterDown', keys: ['ArrowDown'], contexts: ['sorter'], category: '表示', label: '下の行のスライド（スライド一覧表示）' },
  { action: 'sorterUp', keys: ['ArrowUp'], contexts: ['sorter'], category: '表示', label: '上の行のスライド（スライド一覧表示）' },
  { action: 'firstSlide', keys: ['Home'], contexts: S, category: 'スライド', label: '最初のスライド（一覧）' },
  { action: 'lastSlide', keys: ['End'], contexts: S, category: 'スライド', label: '最後のスライド（一覧）' },
  { action: 'moveSlideUp', keys: ['Ctrl+ArrowUp'], contexts: S, category: 'スライド', label: 'スライドを上へ移動' },
  { action: 'moveSlideDown', keys: ['Ctrl+ArrowDown'], contexts: S, category: 'スライド', label: 'スライドを下へ移動' },
  { action: 'moveSlideFirst', keys: ['Ctrl+Shift+ArrowUp'], contexts: S, category: 'スライド', label: 'スライドを先頭へ移動' },
  { action: 'moveSlideLast', keys: ['Ctrl+Shift+ArrowDown'], contexts: S, category: 'スライド', label: 'スライドを末尾へ移動' },
  { action: 'focusEditor', keys: ['Enter'], contexts: S, category: 'スライド', label: '編集領域へ移動（一覧表示は標準表示に戻る）' },
  { action: 'nextPane', keys: ['F6'], contexts: ALL, category: 'スライド', label: '次のウィンドウ枠へ移動（一覧 → 編集 → ノート）' },
  { action: 'prevPane', keys: ['Shift+F6'], contexts: ALL, category: 'スライド', label: '前のウィンドウ枠へ移動' },
  { action: 'toggleGrid', keys: ['Shift+F9'], contexts: ALL, category: '表示', label: 'グリッド線の表示 / 非表示' },
  { action: 'toggleGuides', keys: ['Alt+F9'], contexts: ALL, category: '表示', label: 'ガイドの表示 / 非表示' },

  // スライドショー
  { action: 'showFromStart', keys: ['F5'], contexts: ALL, category: 'スライドショー', label: '最初から開始' },
  { action: 'showFromCurrent', keys: ['Shift+F5'], contexts: ALL, category: 'スライドショー', label: '現在のスライドから開始' },
  { action: 'showNext', keys: ['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'N', 'Enter'], contexts: ['show'], category: 'スライドショー', label: '次へ' },
  { action: 'showPrev', keys: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'P'], contexts: ['show'], category: 'スライドショー', label: '前へ' },
  { action: 'showFirst', keys: ['Home'], contexts: ['show'], category: 'スライドショー', label: '最初のスライド' },
  { action: 'showLast', keys: ['End'], contexts: ['show'], category: 'スライドショー', label: '最後のスライド' },
  { action: 'showBlack', keys: ['B', '.'], contexts: ['show'], category: 'スライドショー', label: '黒い画面の表示 / 解除' },
  { action: 'showWhite', keys: ['W', ','], contexts: ['show'], category: 'スライドショー', label: '白い画面の表示 / 解除' },
  { action: 'showEnd', keys: ['Escape', '-'], contexts: ['show'], category: 'スライドショー', label: 'スライドショーの終了' },
  { action: 'showAll', keys: ['Ctrl+S'], contexts: ['show'], category: 'スライドショー', label: 'すべてのスライド（一覧から移動）' },
  { action: 'showHidden', keys: ['H'], contexts: ['show'], category: 'スライドショー', label: '次のスライドが非表示スライドなら表示' },

  // 練習モード（このアプリ独自）
  { action: 'help', keys: ['F1', 'Ctrl+/'], contexts: ALL, category: '練習', label: 'ショートカット一覧' },
  { action: 'score', keys: ['F9'], contexts: ALL, category: '練習', label: '採点する' },
  { action: 'toggleTarget', keys: ['F11'], contexts: ALL, category: '練習', label: 'お手本の表示 / 非表示' },
  { action: 'challengeList', keys: ['F8'], contexts: ALL, category: '練習', label: '課題を選ぶ' },
];

// 移動量（px）
export const MOVE_STEP = 8;

/** ヘルプ画面用: カテゴリごとに（表示上）重複を除いた一覧 */
export function bindingsByCategory() {
  const map = new Map();
  for (const b of BINDINGS) {
    if (!map.has(b.category)) map.set(b.category, []);
    map.get(b.category).push(b);
  }
  return map;
}
