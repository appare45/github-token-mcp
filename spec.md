# GitHub App Token Vending MCP — インターフェース設計

## 目的

devcontainer内のClaude Codeなど「使い捨て環境で動くエージェント」に、GitHub操作用の短命トークンを都度供給する専用MCPサーバー。

- GitHub Appの秘密鍵は**ホスト側にのみ**存在し、devcontainer側には一切渡さない
- 責務は「有効なinstallation access tokenを発行して返す」ことだけに限定する（PR作成・Issue操作などのGitHub操作そのものは担当しない）
- devcontainer側からはHTTP/SSEトランスポートで直接接続する（stdio→HTTP変換のブリッジは挟まない）

## MCPツール定義

### `get_installation_token`

指定したリポジトリに対する installation access token を発行する。

**Input**

```json
{
  "repos": ["owner/repo-a", "owner/repo-b"],
  "permissions": {
    "contents": "write",
    "pull_requests": "write",
    "issues": "write"
  }
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `repos` | ✅ | トークンのスコープを限定するリポジトリ一覧。Appのインストールが許可している範囲を超えて指定した場合はエラーにする |
| `permissions` | – | 省略時はApp登録時のデフォルト権限をそのまま使う。呼び出し側でさらに絞り込みたい場合のみ指定（広げる方向の指定は拒否する） |

**Output（成功時）**

```json
{
  "token": "ghs_xxxxxxxxxxxxxxxxxxxx",
  "expires_at": "2026-08-18T13:45:00Z",
  "repos": ["owner/repo-a", "owner/repo-b"],
  "permissions": {
    "contents": "write",
    "pull_requests": "write",
    "issues": "write"
  }
}
```

**Output（失敗時）**

```json
{
  "error": "repo_not_installed",
  "message": "owner/repo-c is not covered by any installation this MCP has access to"
}
```

想定エラー種別:
- `repo_not_installed` — 指定リポジトリがどのインストールにも属さない
- `permission_escalation_denied` — App登録済みの権限を超える`permissions`が指定された
- `key_unavailable` — 1Passwordから秘密鍵が取得できない（未ログイン/未承認など）
- `github_api_error` — GitHub側でのトークン発行が失敗（レート制限、インストール失効など）

## 内部処理フロー

単一のGitHub App・単一のインストール（固定の`installation_id`）のみを想定する。

1. `repos` の各リポジトリが、このインストールでカバーされているか確認する（カバーされていなければ`repo_not_installed`）
2. `permissions` が指定されていれば、App登録済みの権限セットの部分集合であることを検証する（`permission_escalation_denied`）
3. `op read op://vault/item/private-key` で1Passwordから秘密鍵を取得する
4. JWT生成とinstallation token発行は自前実装せず、Octokitの`createAppAuth`など既存SDKに任せる。App ID・秘密鍵・`installation_id`とともに、`repositories`・`permissions`を絞り込んだ状態でSDKに渡す
5. 発行結果（token, expires_at）をそのまま呼び出し側に返す。MCP自身はトークンをディスクにキャッシュしない

## 後回しにする事項

- devcontainer側の具体的な利用パターン（gh CLIラッパー、git credential helperなど）
