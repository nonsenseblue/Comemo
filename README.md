# CoMemo - Web Memo Share

<p align="center">
  <img src="assets/icons/icon_128px.png" alt="CoMemo" width="128">
</p>

<p align="center">
  <strong>Webページにメモや図形を追加して共有できるChrome拡張機能</strong><br>
  <em>Chrome extension to add memos and shapes to web pages and share them</em>
</p>

---

## Features / 機能

### Memo / メモ
- Drag & drop sticky notes on any web page / ページ上にドラッグ可能な付箋を配置
- Color customization / カラーカスタマイズ
- Minimize to character icon / キャラクターアイコンに最小化
- Right-click to add memo at cursor / 右クリックでカーソル位置に追加

### Shape Drawing / 図形描画
- Arrow, rectangle, ellipse, freehand / 矢印・四角・楕円・フリーハンド
- Drag to move, handles to resize / ドラッグ移動、ハンドルでリサイズ
- Color picker / カラーピッカー

### Screenshot / スクリーンショット
- Visible area capture / 表示範囲キャプチャ
- Full page capture (auto-scroll & stitch) / 全体キャプチャ（自動スクロール合成）
- Includes memos and shapes / メモ・図形も含めてキャプチャ

### Share / 共有
- Generate share URL / 共有URLを生成
- Cloud sync with Supabase (optional) / Supabaseでクラウド同期（オプション）
- Works offline with local storage / ローカル保存でオフライン動作

---

## Installation / インストール

### From ZIP / ZIPから

1. Download and extract the ZIP file / ZIPファイルをダウンロードして解凍
2. Open `chrome://extensions` in Chrome / Chromeで `chrome://extensions` を開く
3. Enable "Developer mode" (top right) / 右上の「デベロッパーモード」をON
4. Click "Load unpacked" / 「パッケージ化されていない拡張機能を読み込む」をクリック
5. Select the extracted CoMemo folder / 解凍したCoMemoフォルダを選択

### From Source / ソースから

```bash
git clone https://github.com/nonsenseblue/Comemo.git
```

Then follow the same steps above. / 上記と同じ手順でインストール。

---

## Usage / 使い方

### Open Panel / パネルを開く

- Click the CoMemo icon in toolbar / ツールバーのCoMemoアイコンをクリック
- Or use shortcut `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`)

### Add Memo / メモを追加

- Click "Add Memo" button / 「メモを追加」ボタンをクリック
- Or double-click on the page / またはページ上でダブルクリック
- Or right-click → "Add memo here" / または右クリック →「ここにメモを追加」

### Draw Shapes / 図形を描く

1. Select a shape tool (arrow, rectangle, ellipse, freehand) / 図形ツールを選択
2. Drag on the page to draw / ページ上でドラッグして描画
3. Press `Escape` to exit draw mode / `Escape`で描画モード終了

### Take Screenshot / スクリーンショット

- "SS (Visible)" - Captures current viewport / 表示範囲をキャプチャ
- "SS (Full)" - Captures entire page / ページ全体をキャプチャ

### Share / 共有

- Click "Copy Share URL" to generate a shareable link / 「共有URLをコピー」でリンク生成
- Share the URL with others / URLを共有

---

## Keyboard Shortcuts / キーボードショートカット

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + Shift + M` | Toggle panel / パネル開閉 |
| `Ctrl/Cmd + Z` | Undo / 元に戻す |
| `Escape` | Exit draw mode / 描画モード終了 |
| `Delete` | Delete selected shape / 選択図形を削除 |

---

## Cloud Sync (Optional) / クラウド同期（オプション）

CoMemo works offline by default. For cloud sharing, set up Supabase:

CoMemoはデフォルトでオフライン動作します。クラウド共有にはSupabaseを設定:

### 1. Create Supabase Project / Supabaseプロジェクト作成

1. Go to [supabase.com](https://supabase.com) and sign in
2. Create a new project
3. Copy your **Project URL** and **anon key** from Settings → API

### 2. Set Up Database / データベース設定

Run the SQL in `docs/schema.sql` in Supabase SQL Editor.

Supabase SQL Editorで `docs/schema.sql` のSQLを実行。

### 3. Configure Extension / 拡張機能を設定

1. Copy `src/js/config.example.js` to `src/js/config.js`
2. Add your Supabase credentials:

```javascript
window.COMEMO_CONFIG = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key'
};
```

3. Reload the extension in `chrome://extensions`

---

## Project Structure / プロジェクト構成

```
CoMemo/
├── manifest.json          # Extension manifest (Manifest V3)
├── assets/
│   ├── icons/            # Extension icons
│   └── fonts/            # Custom fonts
├── lib/
│   └── supabase.min.js   # Supabase SDK
├── src/
│   ├── js/
│   │   ├── content.js    # Main functionality
│   │   ├── background.js # Service worker
│   │   └── config.js     # Supabase config (create from example)
│   └── css/
│       └── content.css   # Styles
├── docs/
│   ├── MANUAL.md         # User manual
│   ├── schema.sql        # Database schema
│   ├── lp.html           # Landing page
│   ├── index.html        # Demo page
│   └── cocome.html       # Mascot page
└── scripts/
    └── build-dist.sh     # Build script
```

---

## Tech Stack / 技術スタック

- **Manifest V3** - Latest Chrome extension spec
- **Vanilla JavaScript** - No frameworks
- **Supabase** - Optional cloud backend
- **SVG** - Shape rendering with hit areas

---

## Mascot / マスコット

<p align="center">
  <img src="assets/icons/cocome_300px.png" alt="cocome" width="150">
</p>

**cocome** - CoMemo's navigator. A tiny presence watching over your memos.

**cocome** - CoMemoのナビゲーター。みんなのメモをそっと見守る存在。

---

## License / ライセンス

MIT License

---

## Contributing / 貢献

Issues and Pull Requests are welcome!

Issue・プルリクエスト歓迎です！
