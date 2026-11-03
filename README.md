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
| API | Hono | 導入済み |
| フロントエンド | Vite + React / TanStack Router / TanStack Query / Tailwind CSS | 導入済み |
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

### 認証

- Better Auth のメールアドレスとパスワードによるログイン。セッションは Cookie で持つ
- `/health` と `/auth/*` 以外の API はログインが必要（未ログインは 401）
- 予約者はリクエストの内容ではなく、サーバーがセッションから決める
- 予約をキャンセルできるのは予約した本人だけ（他人の予約は 403）。本人かどうかは UPDATE の条件で確かめ、確認と更新の間に競合が入らないようにしている

### 時刻の扱い

- DB：`timestamptz`
- API：タイムゾーンのずれ付き ISO 8601（例：`2026-11-04T10:00:00+09:00`）
- フロントエンド：`Temporal.ZonedDateTime`（Asia/Tokyo）

## ディレクトリ構成

```
heyawari/
├── apps/
│   ├── api/        # Hono
│   └── web/        # Vite + React（SPA）
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

起動する（API: http://localhost:8787、画面: http://localhost:5173）：

```bash
pnpm --filter @heyawari/api dev
pnpm --filter @heyawari/web dev
```

画面から API へは Hono RPC（`hono/client`）で型付きで呼び出す。開発中は Vite が `/api` を API サーバーに転送するため、CORS の設定は要らない。

### 環境変数（API）

| 変数 | 内容 | 既定値 |
|---|---|---|
| `DATABASE_URL` | DB の接続先 | `compose.yaml` のローカル DB |
| `BETTER_AUTH_SECRET` | セッションの署名などに使う秘密鍵。本番では必須（`openssl rand -base64 32` で作る） | 開発用の固定値（警告が出る） |
| `BETTER_AUTH_URL` | API 自身の URL | `http://localhost:8787` |
| `WEB_ORIGIN` | 画面のオリジン（カンマ区切りで複数可）。これ以外からのログイン操作は拒否する | `http://localhost:5173` |
| `PORT` | 待ち受けるポート | `8787` |

画面からは `/api/*` で API を呼ぶ。開発中は Vite が `/api` を外して API に転送する（転送先は `API_URL` で変更可）。本番でも、画面と同じオリジンの `/api` を API に転送する構成にする（Cookie を同じサイトで扱うため）。

### テスト

```bash
pnpm test
```

- Node.js 標準のテストランナー（`node:test`）を使っている。DB の制約とクエリのテストは `packages/db/test/`、API のテストは `apps/api/test/` にある
- 開発用とは別の `heyawari_test` データベースを使う。無ければ自動で作り、マイグレーションを当てる。接続先は `TEST_DATABASE_URL` で変更できる
- テストのたびにテーブルを空にするため、テストは 1 ファイルずつ順番に実行する

