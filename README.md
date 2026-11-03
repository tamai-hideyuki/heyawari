# heyawari

Meeting room booking system (PostgreSQL exclusion constraints + Temporal API)

会議室の予約管理システム。二重予約をアプリケーションのチェックではなく、データベースの制約で防ぐことを設計の中心に置いている。

## 技術スタック

| レイヤー | 技術 | 状態 |
|---|---|---|
| ランタイム | Node.js 26 LTS | 導入済み |
| パッケージ管理 | pnpm workspaces | 導入済み |
| DB | PostgreSQL 18 | 導入済み |
| ORM / マイグレーション | Drizzle ORM / Drizzle Kit | 導入済み |
| API | Hono | 予定 |
| フロントエンド | Next.js | 予定 |
| 日時処理 | Temporal API | 予定 |
| インフラ | Cloud Run + Cloud SQL | 予定 |

## 設計の要点

### 二重予約は DB の排他制約で防ぐ

```sql
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status = 'confirmed')
```

- 「空き確認の SELECT → INSERT」はリクエストが同時に来ると競合するため、最終判定は DB の制約に任せる
- 予約前の空きチェックは画面の使いやすさのためだけに行う
- 制約違反（SQLSTATE `23P01`）は API で 409 Conflict に変換する

### WITHOUT OVERLAPS ではなく EXCLUDE を使う

PostgreSQL 18 の `WITHOUT OVERLAPS` は部分制約（`WHERE`）を付けられない。キャンセル済みの予約を重複判定から外すため、`EXCLUDE ... WHERE` を採用している。

### 時間帯は半開区間 `[)`

10:00–11:00 と 11:00–12:00 が衝突せず、続けて予約できるようにする。

### 時刻の扱い

- DB：`timestamptz`
- API：タイムゾーンのずれ付き ISO 8601（例：`2026-11-04T10:00:00+09:00`）
- フロントエンド：`Temporal.ZonedDateTime`（Asia/Tokyo）

## ディレクトリ構成

```
heyawari/
├── apps/
│   ├── api/        # Hono（予定）
│   └── web/        # Next.js（予定）
├── packages/
│   └── db/         # Drizzle スキーマ・マイグレーション
├── compose.yaml    # ローカル用 PostgreSQL 18
└── pnpm-workspace.yaml
```

## セットアップ

### 前提

- Node.js 26
- pnpm
- Docker

### 手順

```bash
pnpm install
docker compose up -d
pnpm --filter @heyawari/db db:migrate
```

接続先は環境変数 `DATABASE_URL` で変更できる。未設定の場合は `compose.yaml` のローカル DB に接続する。

