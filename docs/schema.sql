-- ============================================
-- CoMemo 全体 Supabase Schema
-- ============================================
--
-- このファイルはSupabaseセットアップ用の参照SQLです。
-- Supabase Dashboard > SQL Editor で実行してください。
--
-- セットアップ手順:
-- 1. Supabaseプロジェクトを作成
-- 2. SQL Editorでこのファイルの内容を実行
-- 3. src/js/config.js にSupabase URLとAnon Keyを設定
--
-- ============================================


-- ############################################
-- PART 1: メイン機能 (メモ共有)
-- ############################################

-- ============================================
-- 1-1. memo_collections テーブル
-- メモのコレクション（共有単位）
-- ============================================
CREATE TABLE IF NOT EXISTS memo_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url TEXT NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- share_codeで検索するためのインデックス
CREATE INDEX IF NOT EXISTS memo_collections_share_code_idx
ON memo_collections (share_code);

-- ============================================
-- 1-2. memos テーブル
-- 個々のメモ
-- ============================================
CREATE TABLE IF NOT EXISTS memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES memo_collections(id) ON DELETE CASCADE,
  position_x INT NOT NULL DEFAULT 100,
  position_y INT NOT NULL DEFAULT 100,
  content TEXT DEFAULT '',
  color TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- collection_idで検索するためのインデックス
CREATE INDEX IF NOT EXISTS memos_collection_id_idx
ON memos (collection_id);

-- ============================================
-- 1-3. shapes テーブル
-- 図形（矢印、四角、丸）
-- ============================================
CREATE TABLE IF NOT EXISTS shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES memo_collections(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'arrow', 'rectangle', 'circle'
  start_x INT NOT NULL,
  start_y INT NOT NULL,
  end_x INT NOT NULL,
  end_y INT NOT NULL,
  color TEXT DEFAULT '#ff6b6b',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- collection_idで検索するためのインデックス
CREATE INDEX IF NOT EXISTS shapes_collection_id_idx
ON shapes (collection_id);

-- ============================================
-- 1-4. comments テーブル
-- メモへのコメント
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id UUID REFERENCES memos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- memo_idで検索するためのインデックス
CREATE INDEX IF NOT EXISTS comments_memo_id_idx
ON comments (memo_id);


-- ############################################
-- PART 2: ランディングページ機能
-- ############################################

-- ============================================
-- 2-1. lp_reactions テーブル
-- リアクション集計（かわいい、便利そう、使いたい）
-- ============================================
CREATE TABLE IF NOT EXISTS lp_reactions (
  id TEXT PRIMARY KEY DEFAULT 'main',
  cute INT DEFAULT 0,
  useful INT DEFAULT 0,
  want INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期行を挿入 (1行のみ使用)
INSERT INTO lp_reactions (id, cute, useful, want)
VALUES ('main', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2-2. lp_comments テーブル
-- ランディングページへのコメント
-- ============================================
CREATE TABLE IF NOT EXISTS lp_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL CHECK (char_length(text) <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 新しい順に取得するためのインデックス
CREATE INDEX IF NOT EXISTS lp_comments_created_at_idx
ON lp_comments (created_at DESC);


-- ############################################
-- PART 3: Row Level Security (RLS) 設定
-- ############################################
-- 匿名ユーザーからのアクセスを許可

-- RLSを有効化
ALTER TABLE memo_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE shapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_comments ENABLE ROW LEVEL SECURITY;

-- memo_collections: 誰でも読み取り・挿入可能
CREATE POLICY "Anyone can read collections"
  ON memo_collections FOR SELECT USING (true);
CREATE POLICY "Anyone can insert collections"
  ON memo_collections FOR INSERT WITH CHECK (true);

-- memos: 誰でも読み取り・挿入・更新・削除可能
CREATE POLICY "Anyone can read memos"
  ON memos FOR SELECT USING (true);
CREATE POLICY "Anyone can insert memos"
  ON memos FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update memos"
  ON memos FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete memos"
  ON memos FOR DELETE USING (true);

-- shapes: 誰でも読み取り・挿入・更新・削除可能
CREATE POLICY "Anyone can read shapes"
  ON shapes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert shapes"
  ON shapes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update shapes"
  ON shapes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete shapes"
  ON shapes FOR DELETE USING (true);

-- comments: 誰でも読み取り・挿入可能
CREATE POLICY "Anyone can read comments"
  ON comments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert comments"
  ON comments FOR INSERT WITH CHECK (true);

-- lp_reactions: 誰でも読み取り・更新可能
CREATE POLICY "Anyone can read lp_reactions"
  ON lp_reactions FOR SELECT USING (true);
CREATE POLICY "Anyone can update lp_reactions"
  ON lp_reactions FOR UPDATE USING (true);

-- lp_comments: 誰でも読み取り・挿入可能
CREATE POLICY "Anyone can read lp_comments"
  ON lp_comments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert lp_comments"
  ON lp_comments FOR INSERT WITH CHECK (true);


-- ############################################
-- 確認・管理用クエリ
-- ############################################

-- テーブル一覧確認
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- メモコレクション確認
-- SELECT * FROM memo_collections ORDER BY created_at DESC LIMIT 10;

-- 特定の共有コードのデータ確認
-- SELECT * FROM memo_collections WHERE share_code = 'XXXXXX';
-- SELECT * FROM memos WHERE collection_id = 'uuid-here';
-- SELECT * FROM shapes WHERE collection_id = 'uuid-here';

-- ランディングページ確認
-- SELECT * FROM lp_reactions;
-- SELECT * FROM lp_comments ORDER BY created_at DESC;

-- リアクションリセット
-- UPDATE lp_reactions SET cute=0, useful=0, want=0 WHERE id='main';

-- 全データ削除（注意！）
-- TRUNCATE memo_collections, memos, shapes, comments CASCADE;
-- TRUNCATE lp_reactions, lp_comments;
