# CoMemo ユーザーマニュアル

## はじめに

CoMemoは、Webページにメモや図形を追加して共有できるChrome拡張機能です。
デザインレビュー、フィードバック、情報共有などに活用できます。

---

## インストール

### 方法1: ZIPファイルから

1. ZIPファイルをダウンロードして解凍
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. 解凍したCoMemoフォルダを選択

### 方法2: GitHubから

1. リポジトリをクローンまたはダウンロード
2. 上記と同じ手順でインストール

> Supabaseを設定しなくてもローカル保存で動作します。共有機能を使う場合のみ「クラウド同期」セクションの設定が必要です。

---

## 基本操作

### パネルを開く

- **方法1**: ツールバーのCoMemoアイコンをクリック
- **方法2**: ショートカット `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`)

### ミニキャラクター (cocome)

画面右下に表示されるキャラクターです。
- クリック: パネルを展開
- ドラッグ: 位置を移動

---

## メモ機能

### メモを追加

1. パネルの「メモを追加」ボタンをクリック
2. または、ページ上でダブルクリック
3. または、右クリック →「ここにメモを追加」

### メモを編集

1. メモをクリックして編集モードに
2. テキストを入力
3. メモ外をクリックして確定

### メモを移動

- メモのヘッダー部分をドラッグ

### メモの色を変更

1. メモをクリック
2. 下部のカラーパレットから色を選択

### メモを最小化

- メモ上部の「−」ボタンをクリック
- 再度クリックで展開

### メモを削除

- メモ上部のゴミ箱ボタンをクリック

---

## 図形描画

### 描画モードに入る

パネルから描画ツールを選択:
- 矢印
- 四角形
- 楕円
- フリーハンド

### 図形を描く

1. ツールを選択
2. ページ上でドラッグ

### 図形の色を変更

- パネルのカラーピッカーで色を選択してから描画

### 図形を削除

- 図形をクリックして選択
- Deleteキーを押す
- または図形上の削除ボタンをクリック

### 描画モードを終了

- Escapeキーを押す
- または別のツールを選択

---

## 共有機能

### 共有リンクを作成

1. パネルの「共有URLをコピー」をクリック
2. または各メモの共有ボタンをクリック
3. リンクがクリップボードにコピーされます

### 共有リンクを開く

- 受け取ったリンクをブラウザで開く
- メモと図形が自動的に表示されます

### 注意事項

| ページタイプ | 共有 |
|-------------|------|
| 公開ページ | 問題なく共有可能 |
| ログイン必須ページ | サイトの挙動による |

**ログイン必須ページの場合:**
- 相手が同じページにアクセスできれば表示される
- ログインページにリダイレクトされる場合は表示されない

**機密情報について:**
- 共有リンクを知る人は誰でもメモを見れます
- 機密情報は共有しないでください

---

## スクリーンショット

### 表示範囲をキャプチャ

1. パネルの「SS（表示範囲）」をクリック
2. 現在表示されている範囲がキャプチャされます
3. 画像が自動ダウンロードされます

### ページ全体をキャプチャ

1. パネルの「SS（全体）」をクリック
2. ページ全体が自動スクロールしてキャプチャされます
3. 合成された画像がダウンロードされます

**ポイント:**
- メモと図形も含めてキャプチャされます
- ログインページでも使用可能
- 相手に画像として共有できます

---

## ショートカットキー

| キー | 機能 |
|-----|------|
| `Ctrl/Cmd + Shift + M` | パネルを開く/閉じる |
| `Ctrl/Cmd + Z` | 元に戻す |
| `Escape` | 描画モードを終了 |
| `Delete` | 選択した図形を削除 |

---

## クラウド同期（Supabase設定）

共有機能を使う場合のみ必要です。ローカル保存だけなら設定不要。

### 1. Supabaseプロジェクト作成

1. [Supabase](https://supabase.com) にアクセスしサインイン
2. 「New Project」をクリック
3. 設定:
   - **Name**: `comemo`（任意）
   - **Database Password**: 安全なパスワードを設定
   - **Region**: Northeast Asia (Tokyo)
4. 「Create new project」をクリック

### 2. APIキーを取得

1. ダッシュボードで「Settings」→「API」
2. 以下をコピー:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6...`

### 3. データベース設定

「SQL Editor」→「New Query」で以下を実行:

```sql
-- メモコレクション
CREATE TABLE memo_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_memo_collections_share_code ON memo_collections(share_code);
CREATE INDEX idx_memo_collections_page_url ON memo_collections(page_url);

-- メモ
CREATE TABLE memos (
  id TEXT PRIMARY KEY,
  collection_id UUID REFERENCES memo_collections(id) ON DELETE CASCADE,
  position_x INTEGER NOT NULL,
  position_y INTEGER NOT NULL,
  content TEXT DEFAULT '',
  color TEXT DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_memos_collection_id ON memos(collection_id);

-- 図形
CREATE TABLE shapes (
  id TEXT PRIMARY KEY,
  collection_id UUID REFERENCES memo_collections(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  start_x INTEGER NOT NULL,
  start_y INTEGER NOT NULL,
  end_x INTEGER NOT NULL,
  end_y INTEGER NOT NULL,
  color TEXT DEFAULT '#e53935',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shapes_collection_id ON shapes(collection_id);

-- コメント
CREATE TABLE comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id TEXT REFERENCES memos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_name TEXT DEFAULT '匿名',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_memo_id ON comments(memo_id);

-- Row Level Security (RLS) を有効化
ALTER TABLE memo_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE shapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 全員が読み書きできるポリシー
CREATE POLICY "Allow all on memo_collections" ON memo_collections
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on memos" ON memos
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on shapes" ON shapes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on comments" ON comments
  FOR ALL USING (true) WITH CHECK (true);
```

「Run」をクリックしてエラーがないことを確認。

### 4. 拡張機能に設定

`src/js/config.example.js` を `src/js/config.js` にコピーして編集:

```javascript
window.COMEMO_CONFIG = {
  SUPABASE_URL: 'https://あなたのプロジェクト.supabase.co',
  SUPABASE_ANON_KEY: 'あなたのanonキー'
};
```

設定後、`chrome://extensions/` で拡張機能を再読み込み。

---

## トラブルシューティング

### メモが保存されない

- ページをリロードしてみてください
- chrome://extensions で拡張機能を再読み込み

### 共有リンクが動作しない

- Supabaseの設定を確認
- ネットワーク接続を確認
- RLSポリシーが設定されているか確認

### スクリーンショットが真っ白

- ページの読み込みを待ってから実行
- 一部のサイトはセキュリティ制限でキャプチャ不可

### パネルが表示されない

- ショートカット `Ctrl+Shift+M` を試す
- ページをリロード
- 拡張機能を再インストール

### メモが消える

- ローカル保存はページURL単位。URLが変わると別データ
- `?comemo=xxx` パラメータはストレージキーから除外される

---

## よくある質問

**Q: メモは誰でも見れますか？**
A: 共有リンクを知っている人のみ見れます。ローカル保存のメモは自分だけです。

**Q: オフラインでも使えますか？**
A: はい。ローカル保存は常に動作します。共有機能のみインターネット接続が必要です。

**Q: 対応していないサイトはありますか？**
A: Chrome拡張機能がブロックされているサイト（chrome:// など）では使用できません。

**Q: メモの数に制限はありますか？**
A: 技術的な制限はありませんが、多すぎるとパフォーマンスに影響する場合があります。

---

## お問い合わせ

バグ報告・機能リクエストは GitHub Issues までお願いします。
