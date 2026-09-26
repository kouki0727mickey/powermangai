// リボンの KeyTips（Alt キーから始まるキー シーケンス）。PowerPoint のキー割り当てに準拠。
// 葉ノードは { action, args } を持ち、アプリ側でアクションを実行する。
// ギャラリー / パレット / 入力欄を開くアクションは gallery:* / palette:* / input:* で表す。

const ALIGN = {
  label: '配置',
  children: [
    { key: 'L', label: '左揃え', action: 'arrangeAlign', args: 'left' },
    { key: 'C', label: '左右中央揃え', action: 'arrangeAlign', args: 'center' },
    { key: 'R', label: '右揃え', action: 'arrangeAlign', args: 'right' },
    { key: 'T', label: '上揃え', action: 'arrangeAlign', args: 'top' },
    { key: 'M', label: '上下中央揃え', action: 'arrangeAlign', args: 'middle' },
    { key: 'B', label: '下揃え', action: 'arrangeAlign', args: 'bottom' },
    { key: 'H', label: '左右に整列', action: 'distribute', args: 'h' },
    { key: 'V', label: '上下に整列', action: 'distribute', args: 'v' },
  ],
};

const ARRANGE = {
  label: '配置',
  children: [
    { key: 'R', label: '最前面へ移動', action: 'reorder', args: 'front' },
    { key: 'F', label: '前面へ移動', action: 'reorder', args: 'forward' },
    { key: 'K', label: '最背面へ移動', action: 'reorder', args: 'back' },
    { key: 'B', label: '背面へ移動', action: 'reorder', args: 'backward' },
    { key: 'G', label: 'グループ化', action: 'group' },
    { key: 'U', label: 'グループ解除', action: 'ungroup' },
    { key: 'P', label: 'オブジェクトの選択と表示（選択ウィンドウ）', action: 'selectionPane' },
    { key: 'A', ...ALIGN },
    {
      key: 'O', label: '回転',
      children: [
        { key: 'R', label: '右へ 90 度回転', action: 'rotateBy', args: 90 },
        { key: 'L', label: '左へ 90 度回転', action: 'rotateBy', args: -90 },
        { key: 'V', label: '上下反転', action: 'flip', args: 'v' },
        { key: 'H', label: '左右反転', action: 'flip', args: 'h' },
      ],
    },
  ],
};

export const KEYTIPS = {
  label: 'リボン',
  children: [
    // クイック アクセス ツール バー（既定: 上書き保存・元に戻す・やり直し）
    { key: '1', label: '上書き保存（クイック アクセス）', action: 'save', qat: true },
    { key: '2', label: '元に戻す（クイック アクセス）', action: 'qatUndo', qat: true },
    { key: '3', label: 'やり直し（クイック アクセス）', action: 'qatRedo', qat: true },
    {
      key: 'F', label: 'ファイル',
      children: [
        { key: 'N', label: '新規', action: 'newPresentation' },
        { key: 'O', label: '開く', action: 'open' },
        { key: 'S', label: '上書き保存', action: 'save' },
        { key: 'A', label: '名前を付けて保存', action: 'saveAs' },
        { key: 'P', label: '印刷 / PDF', action: 'print' },
        { key: 'E', label: 'エクスポート（PNG 画像）', action: 'exportPng' },
        { key: 'C', label: '閉じる', action: 'closeWindow' },
      ],
    },
    {
      key: 'H', label: 'ホーム',
      children: [
        { key: 'I', label: '新しいスライド', action: 'gallery:layout' },
        { key: 'L', label: 'レイアウト', action: 'gallery:changeLayout' },
        { key: 'FD', label: '検索', action: 'find' },
        { key: 'R', label: '置換', action: 'replace' },
        { key: 'V', label: '貼り付け', action: 'paste' },
        { key: 'X', label: '切り取り', action: 'cut' },
        { key: 'C', label: 'コピー', action: 'copy' },
        { key: 'FP', label: '書式のコピー', action: 'copyFormat' },
        { key: 'FF', label: 'フォント', action: 'input:fontFamily' },
        { key: 'FS', label: 'フォント サイズ', action: 'input:fontSize' },
        { key: 'FG', label: 'フォント サイズの拡大', action: 'fontGrow' },
        { key: 'FK', label: 'フォント サイズの縮小', action: 'fontShrink' },
        { key: '1', label: '太字', action: 'bold' },
        { key: '2', label: '斜体', action: 'italic' },
        { key: '3', label: '下線', action: 'underline' },
        { key: '4', label: '取り消し線', action: 'strike' },
        { key: '7', label: '文字種の変換（大文字 / 小文字）', action: 'changeCase' },
        { key: 'U', label: '箇条書き', action: 'bullets' },
        { key: 'N', label: '段落番号', action: 'numbering' },
        { key: 'AI', label: 'リストのレベルを上げる（インデント増）', action: 'demote' },
        { key: 'AO', label: 'リストのレベルを下げる（インデント減）', action: 'promote' },
        { key: 'K', label: '行間', action: 'gallery:lineSpacing' },
        {
          key: 'AD', label: '文字列の方向',
          children: [
            { key: 'H', label: '横書き', action: 'textDirection', args: false },
            { key: 'V', label: '縦書き', action: 'textDirection', args: true },
          ],
        },
        {
          key: 'AT', label: '文字の配置（上下）',
          children: [
            { key: 'T', label: '上揃え', action: 'textAnchor', args: 'top' },
            { key: 'M', label: '上下中央揃え', action: 'textAnchor', args: 'middle' },
            { key: 'B', label: '下揃え', action: 'textAnchor', args: 'bottom' },
          ],
        },
        { key: 'E', label: 'すべての書式をクリア', action: 'clearFormat' },
        { key: 'FC', label: 'フォントの色', action: 'palette:fontColor' },
        { key: 'TH', label: '蛍光ペンの色', action: 'palette:highlight' },
        { key: 'FT', label: '文字の間隔', action: 'gallery:spacing' },
        { key: 'AL', label: '左揃え', action: 'alignLeft' },
        { key: 'AC', label: '中央揃え', action: 'alignCenter' },
        { key: 'AR', label: '右揃え', action: 'alignRight' },
        { key: 'AJ', label: '両端揃え', action: 'alignJustify' },
        { key: 'SH', label: '図形', action: 'gallery:shapes' },
        { key: 'G', ...ARRANGE },
        { key: 'SF', label: '図形の塗りつぶし', action: 'palette:fill' },
        { key: 'SO', label: '図形の枠線（W: 太さ ／ S: 実線/点線 ／ R: 矢印）', action: 'palette:stroke' },
        { key: 'SE', label: '図形の効果（影）', action: 'gallery:effects' },
        { key: 'Q', label: 'クイック スタイル', action: 'gallery:shapeStyles' },
      ],
    },
    {
      key: 'N', label: '挿入',
      children: [
        { key: 'I', label: '新しいスライド', action: 'gallery:layout' },
        { key: 'X', label: 'テキスト ボックス', action: 'insertTextBox' },
        { key: 'SH', label: '図形', action: 'gallery:shapes' },
        { key: 'T', label: '表', action: 'insertTable' },
        { key: 'C', label: 'グラフ', action: 'insertChart' },
        { key: 'P', label: '画像（このデバイス）', action: 'insertPicture' },
        { key: 'H', label: 'ヘッダーとフッター', action: 'headerFooter' },
        { key: 'K', label: 'リンク', action: 'hyperlink' },
        { key: 'U', label: '記号と特殊文字', action: 'insertSymbol' },
        { key: 'D', label: '日付と時刻', action: 'headerFooter' },
        { key: 'SN', label: 'スライド番号', action: 'headerFooter' },
      ],
    },
    {
      key: 'G', label: 'デザイン',
      children: [
        { key: 'TH', label: 'テーマ', action: 'gallery:themes' },
        { key: 'S', label: 'スライドのサイズ', action: 'gallery:slideSize' },
        { key: 'B', label: '背景の書式設定', action: 'palette:background' },
      ],
    },
    {
      key: 'JL', label: '表のレイアウト',
      children: [
        { key: 'A', label: '上に行を挿入', action: 'tableOp', args: 'rowAbove' },
        { key: 'BE', label: '下に行を挿入', action: 'tableOp', args: 'rowBelow' },
        { key: 'L', label: '左に列を挿入', action: 'tableOp', args: 'colLeft' },
        { key: 'R', label: '右に列を挿入', action: 'tableOp', args: 'colRight' },
        {
          key: 'D', label: '削除',
          children: [
            { key: 'C', label: '列の削除', action: 'tableOp', args: 'deleteCol' },
            { key: 'R', label: '行の削除', action: 'tableOp', args: 'deleteRow' },
            { key: 'T', label: '表の削除', action: 'delete' },
          ],
        },
      ],
    },
    {
      key: 'JT', label: 'テーブル デザイン',
      children: [
        { key: 'H', label: 'タイトル行（見出し）', action: 'toggleTableProp', args: 'headerRow' },
        { key: 'B', label: '縞模様（行）', action: 'toggleTableProp', args: 'bandedRows' },
        { key: 'S', label: '塗りつぶし（セル）', action: 'palette:cellFill' },
      ],
    },
    {
      key: 'JC', label: 'グラフのデザイン',
      children: [
        {
          key: 'A', label: 'グラフ要素を追加',
          children: [
            { key: 'T', label: 'グラフ タイトル', action: 'chartToggle', args: 'showTitle' },
            { key: 'L', label: '凡例', action: 'chartToggle', args: 'showLegend' },
            { key: 'D', label: 'データ ラベル', action: 'chartToggle', args: 'dataLabels' },
            { key: 'G', label: '目盛線', action: 'chartToggle', args: 'gridlines' },
          ],
        },
        { key: 'D', label: 'データの編集', action: 'chartData' },
        { key: 'C', label: 'グラフの種類の変更', action: 'chartType' },
        { key: 'H', label: '色の変更', action: 'chartColors' },
        { key: 'T', label: 'グラフ タイトルの文字', action: 'chartTitle' },
      ],
    },
    {
      key: 'JD', label: '図形の書式',
      children: [
        { key: 'SF', label: '図形の塗りつぶし', action: 'palette:fill' },
        { key: 'SO', label: '図形の枠線（W: 太さ ／ S: 実線/点線 ／ R: 矢印）', action: 'palette:stroke' },
        { key: 'SE', label: '図形の効果（影）', action: 'gallery:effects' },
        { key: 'SS', label: '図形のスタイル', action: 'gallery:shapeStyles' },
        { key: 'O', label: '図形の書式設定', action: 'formatShape' },
        { key: 'E', label: '図形の変更', action: 'gallery:changeShape' },
        { key: 'P', label: '選択ウィンドウ', action: 'selectionPane' },
        { key: 'H', label: '高さ', action: 'input:height' },
        { key: 'W', label: '幅', action: 'input:width' },
        { key: 'AA', ...ALIGN },
        { key: 'AF', label: '前面へ移動', action: 'reorder', args: 'forward' },
        { key: 'AE', label: '背面へ移動', action: 'reorder', args: 'backward' },
        { key: 'AY', label: '回転', children: ARRANGE.children.find((c) => c.key === 'O').children },
      ],
    },
    {
      key: 'K', label: '画面切り替え',
      children: [
        { key: 'T', label: '画面切り替えの種類', action: 'gallery:transition' },
        { key: 'O', label: '効果のオプション（方向）', action: 'transitionOptions' },
        { key: 'D', label: '期間', action: 'input:transitionDuration' },
        { key: 'L', label: 'すべてに適用', action: 'transitionApplyAll' },
        { key: 'AF', label: '自動的に切り替え（秒）', action: 'input:advanceAfter' },
        { key: 'P', label: 'プレビュー', action: 'previewSlide' },
      ],
    },
    {
      key: 'A', label: 'アニメーション',
      children: [
        { key: 'S', label: 'アニメーションの種類（開始効果）', action: 'gallery:animation' },
        { key: 'O', label: '効果のオプション（方向）', action: 'animationOptions' },
        { key: 'T', label: '開始のタイミング', action: 'animationTrigger' },
        { key: 'D', label: '継続時間', action: 'input:animationDuration' },
        { key: 'M', label: 'アニメーション ウィンドウ', action: 'animationPane' },
        { key: 'P', label: 'プレビュー', action: 'previewSlide' },
      ],
    },
    {
      key: 'S', label: 'スライドショー',
      children: [
        { key: 'B', label: '最初から', action: 'showFromStart' },
        { key: 'C', label: '現在のスライドから', action: 'showFromCurrent' },
        { key: 'H', label: '非表示スライドに設定 / 解除', action: 'hideSlide' },
        { key: 'V', label: '発表者ビュー', action: 'presenterView' },
      ],
    },
    {
      key: 'W', label: '表示',
      children: [
        { key: 'L', label: '標準', action: 'viewNormal' },
        { key: 'I', label: 'スライド一覧', action: 'viewSorter' },
        { key: 'D', label: '閲覧表示', action: 'readingView' },
        { key: 'N', label: 'ノート（ノート欄の表示 / 非表示）', action: 'toggleNotes' },
        { key: 'Q', label: 'ズーム', action: 'zoom' },
        { key: 'FW', label: 'ウィンドウに合わせる', action: 'zoomFit' },
        { key: 'GL', label: 'グリッド線', action: 'toggleGrid' },
        { key: 'GU', label: 'ガイド', action: 'toggleGuides' },
      ],
    },
    {
      key: 'Y', label: '練習',
      children: [
        { key: 'C', label: '課題を選ぶ', action: 'challengeList' },
        { key: 'I', label: 'お手本画像を読み込む', action: 'loadTargetImage' },
        { key: 'S', label: '採点する', action: 'score' },
        { key: 'H', label: 'お手本の表示 / 非表示', action: 'toggleTarget' },
        { key: 'T', label: 'ヒントの表示 / 非表示', action: 'toggleHints' },
        { key: 'R', label: '課題をやり直す', action: 'restartChallenge' },
        { key: 'K', label: 'ショートカット一覧', action: 'help' },
      ],
    },
  ],
};

/**
 * KeyTips の状態機械。
 * press(key) の戻り値:
 *   { type: 'pending' }             … 複数文字キーの途中
 *   { type: 'node', node }          … 下の階層へ移動
 *   { type: 'action', action, args, path } … 実行するアクション（セッション終了）
 *   { type: 'invalid' }             … 該当なし（入力はリセット）
 */
export class KeyTipSession {
  constructor(root = KEYTIPS) {
    this.stack = [root];
    this.buffer = '';
    this.path = [];
  }

  get node() { return this.stack[this.stack.length - 1]; }

  /** 現在の階層で表示するヒント（入力途中の場合は前方一致のみ） */
  visibleTips() {
    return this.node.children.filter((c) => c.key.startsWith(this.buffer));
  }

  press(rawKey) {
    const key = String(rawKey).toUpperCase();
    if (key.length !== 1) return { type: 'invalid' };
    const buf = this.buffer + key;
    const matches = this.node.children.filter((c) => c.key.startsWith(buf));
    if (matches.length === 0) {
      this.buffer = '';
      return { type: 'invalid' };
    }
    const exact = matches.find((c) => c.key === buf);
    if (exact && matches.length === 1) {
      this.buffer = '';
      this.path.push(exact.key);
      if (exact.children) {
        this.stack.push(exact);
        return { type: 'node', node: exact };
      }
      return { type: 'action', action: exact.action, args: exact.args, path: [...this.path], label: exact.label };
    }
    this.buffer = buf;
    return { type: 'pending' };
  }

  /** Esc: 入力途中ならクリア、そうでなければ 1 階層戻る。ルートで押したら false（終了） */
  back() {
    if (this.buffer) { this.buffer = ''; return true; }
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.path.pop();
    return true;
  }
}

/** アクション名から KeyTips のキー列を逆引き（ヘルプ表示用） */
export function keyTipPaths(root = KEYTIPS) {
  const result = [];
  const walk = (node, prefix, labels) => {
    for (const c of node.children) {
      const p = [...prefix, c.key];
      const l = [...labels, c.label];
      if (c.children) walk(c, p, l);
      else result.push({ keys: ['Alt', ...p], labels: l, action: c.action, args: c.args });
    }
  };
  walk(root, [], []);
  return result;
}
