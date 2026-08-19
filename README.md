# github-token-mcp

`spec.md` の実装。devcontainer内のエージェントへ、GitHub App installation access token を都度発行するホスト専用HTTPサーバー。

## 技術構成

- **HTTP server**: `Hono` (`@hono/node-server` で配信)
- **GitHub App認証**: `@octokit/auth-app` の `createAppAuth`（JWT生成・token交換は自前実装しない）
- **秘密鍵取得**: `@1password/sdk` の `DesktopAuth` — CLIシェルアウトではなく1Password desktop appでの生体認証/システム認証プロンプトを都度要求する
- **Bearer認証**: `hono/bearer-auth`。固定の共有トークンを `Authorization: Bearer <token>` で提示する
- **アクセスログ**: `hono/logger`。stderrにリクエストログを出力する（トークン自体は出力しない）

## セットアップ

```bash
npm install
cp .env.example .env  # 値を埋める
```

- `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID`: 対象のGitHub App / インストール
- `GITHUB_APP_PRIVATE_KEY_OP_REF`: 秘密鍵の1Password secret reference (`op://vault/item/field`)
- `OP_ACCOUNT_NAME`: 1Password desktop app サイドバーに表示されるアカウント名（`DesktopAuth`用）
- `BEARER_TOKEN`: devcontainer側が `Authorization: Bearer <token>` で提示する共有シークレット
- `ALLOWED_HOSTS`（任意）: 受け付ける `Host` ヘッダのカンマ区切りリスト（DNS rebinding対策）。未設定時は `localhost,127.0.0.1,host.docker.internal`

1Password desktop app側で **Settings > Developer > Integrate with other apps** を有効化しておくこと。

```bash
npm run dev    # tsx watch で起動
npm run build && npm start
```

## API

### `GET /:owner/:repo`

指定リポジトリに対する installation access token を発行する。

**認証**: `Authorization: Bearer <BEARER_TOKEN>`

**クエリパラメータ**（任意）: GitHub App permissionsのキーをそのままクエリパラメータ名として指定する（例: `?contents=read&issues=write`）。省略時は次のデフォルト権限が使われる。

```
contents: write
issues: write
pull_requests: write
```

**レスポンス**: 成功時はトークン文字列を `text/plain` で返す。失敗時はエラーメッセージを `text/plain` で返し、ステータスコードで種別を示す。

| ステータス | エラー種別 |
|---|---|
| 400 | `invalid_request` — リクエスト形式が不正（権限レベルの指定ミスなど） |
| 401 | Bearer認証失敗 |
| 403 | Hostヘッダ不許可、または `permission_escalation_denied`（App登録済み権限を超える要求） |
| 422 | `request_rejected`（GitHub側がリクエストを拒否。指定リポジトリがこのインストールでカバーされていない場合を含む。詳細はGitHubのエラーメッセージをそのまま返す） |
| 502 | `github_api_error`（GitHub側でのトークン発行失敗） |
| 503 | `key_unavailable`（1Passwordから秘密鍵が取得できない） |

**リクエスト例**（devcontainer側から、ホストの `host.docker.internal:3000` へ）

```bash
curl -sS "http://host.docker.internal:3000/appare45/github-token-mcp" \
  -H "Authorization: Bearer ${BEARER_TOKEN}"
```

デフォルト権限を絞り込みたい場合はクエリパラメータで指定する:

```bash
curl -sS "http://host.docker.internal:3000/appare45/github-token-mcp?contents=read" \
  -H "Authorization: Bearer ${BEARER_TOKEN}"
```

## 実装状況（骨子）

- [x] `TokenIssuer` インターフェースによるトークン発行処理の抽象化
- [x] repos カバレッジは事前検証せず、GitHubのトークン発行APIが返す422をそのまま `request_rejected` として返す
- [x] permissions 部分集合検証 → 403 `permission_escalation_denied`
- [x] 1Password 経由の秘密鍵取得 → 503 `key_unavailable`
- [x] `@octokit/auth-app` へのトークン発行委譲 → 502 `github_api_error`
- [x] Hono + Bearer認証 + Hostヘッダ許可リストでの配信
- [x] 実際のGitHub App / 1Password vaultに対する動作確認
- [ ] devcontainer側の利用パターン（spec.mdで明示的に後回しとされている）

## ディレクトリ構成

```
src/
  config.ts          環境変数ロード
  errors.ts          エラーコードに対応するAppError
  op-secret.ts        1Password DesktopAuth 経由の秘密鍵取得
  github-auth.ts      installation repos/permissions 検証 + createAppAuth 呼び出し
  token-issuer.ts       TokenIssuer インターフェース定義
  github-token-issuer.ts  TokenIssuer の GitHub App 向け実装
  app.ts               Hono アプリ（Bearer認証・Hostチェック・ルーティング）
  index.ts             HTTPエントリポイント
```
