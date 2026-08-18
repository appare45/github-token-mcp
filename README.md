# github-token-mcp

`spec.md` の実装。devcontainer内のエージェントへ、GitHub App installation access token を都度発行するホスト専用MCPサーバー。

## 技術構成

- **MCP server**: `@modelcontextprotocol/server` v2 (`createMcpHandler` + `McpServer`) を Streamable HTTP で配信
- **GitHub App認証**: `@octokit/auth-app` の `createAppAuth`（JWT生成・token交換は自前実装しない）
- **秘密鍵取得**: `@1password/sdk` の `DesktopAuth` — CLIシェルアウトではなく1Password desktop appでの生体認証/システム認証プロンプトを都度要求する
- **Bearer認証**: `@modelcontextprotocol/express` の `requireBearerAuth`。devcontainer側は固定の共有トークンを提示する

## セットアップ

```bash
npm install
cp .env.example .env  # 値を埋める
```

- `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID`: 対象のGitHub App / インストール
- `GITHUB_APP_PRIVATE_KEY_OP_REF`: 秘密鍵の1Password secret reference (`op://vault/item/field`)
- `OP_ACCOUNT_NAME`: 1Password desktop app サイドバーに表示されるアカウント名（`DesktopAuth`用）
- `MCP_BEARER_TOKEN`: devcontainer側が `Authorization: Bearer <token>` で提示する共有シークレット

1Password desktop app側で **Settings > Developer > Integrate with other apps** を有効化しておくこと。

```bash
npm run dev    # tsx watch で起動
npm run build && npm start
```

## 実装状況（骨子）

- [x] `get_installation_token` ツールの型定義・入力バリデーション
- [x] repos カバレッジ検証 → `repo_not_installed`
- [x] permissions 部分集合検証 → `permission_escalation_denied`
- [x] 1Password 経由の秘密鍵取得 → `key_unavailable`
- [x] `@octokit/auth-app` へのトークン発行委譲 → `github_api_error`
- [x] Streamable HTTP + Bearer認証での配信
- [ ] 実際のGitHub App / 1Password vaultに対する動作確認（要人間による認証情報準備）
- [ ] devcontainer側の利用パターン（spec.mdで明示的に後回しとされている）

## ディレクトリ構成

```
src/
  config.ts                       環境変数ロード
  errors.ts                       spec.md の4種類のエラーコードに対応するTokenError
  op-secret.ts                    1Password DesktopAuth 経由の秘密鍵取得
  github-auth.ts                  installation repos/permissions 検証 + createAppAuth 呼び出し
  tools/get-installation-token.ts get_installation_token ツール本体
  server.ts                       McpServer ファクトリ（ツール登録）
  index.ts                        HTTPエントリポイント（bearer認証 + createMcpHandler配信）
```
