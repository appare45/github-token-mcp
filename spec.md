# GitHub App Token Vending Server — インターフェース設計

## 目的

devcontainer内のClaude Codeなど「使い捨て環境で動くエージェント」に、GitHub操作用の短命トークンを都度供給する専用HTTPサーバー。

- GitHub Appの秘密鍵は**ホスト側にのみ**存在し、devcontainer側には一切渡さない
- 責務は「有効なinstallation access tokenを発行して返す」ことだけに限定する（PR作成・Issue操作などのGitHub操作そのものは担当しない）
- devcontainer側からは普通のHTTPリクエストで直接接続する（シェルスクリプトからの利用を優先し、MCPクライアント実装は要求しない）

## API定義

### `GET /:owner/:repo`

指定したリポジトリに対する installation access token を発行する。

**認証**: `Authorization: Bearer <token>` ヘッダで共有シークレットを提示する。

**クエリパラメータ**

| パラメータ | 必須 | 説明 |
|---|---|---|
| `<permission>=<level>` | – | GitHub App permissionsのキー（`contents`, `issues`, `pull_requests` など）をクエリパラメータ名として、`read`/`write`/`admin`のいずれかを値に指定する。複数指定可。省略時はデフォルト権限（下記）を使う。Appのインストールが許可している範囲を超えて指定した場合はエラーにする |

デフォルト権限（クエリパラメータ未指定時）:

```
contents: write
issues: write
pull_requests: write
```

**レスポンス（成功時）**

`text/plain` でトークン文字列のみを返す。

```
ghs_xxxxxxxxxxxxxxxxxxxx
```

**レスポンス（失敗時）**

`text/plain` でエラーメッセージを返し、ステータスコードで種別を示す。

想定エラー種別:
- `invalid_request`（400） — リクエスト形式が不正（`owner/repo`のいずれかが欠落、権限レベルの指定ミスなど）
- `repo_not_installed`（404） — 指定リポジトリがどのインストールにも属さない
- `permission_escalation_denied`（403） — App登録済みの権限を超える権限が指定された
- `key_unavailable`（503） — 1Passwordから秘密鍵が取得できない（未ログイン/未承認など）
- `github_api_error`（502） — GitHub側でのトークン発行が失敗（レート制限、インストール失効など）

## 内部処理フロー

単一のGitHub App・単一のインストール（固定の`installation_id`）のみを想定する。

1. リクエストされたリポジトリが、このインストールでカバーされているか確認する（カバーされていなければ`repo_not_installed`）
2. permissionsが指定されていれば、App登録済みの権限セットの部分集合であることを検証する（`permission_escalation_denied`）
3. `op read op://vault/item/private-key` で1Passwordから秘密鍵を取得する
4. JWT生成とinstallation token発行は自前実装せず、Octokitの`createAppAuth`など既存SDKに任せる。App ID・秘密鍵・`installation_id`とともに、`repositories`・`permissions`を絞り込んだ状態でSDKに渡す
5. 発行結果（token）をそのまま呼び出し側に返す。サーバー自身はトークンをディスクにキャッシュしない

トークン発行処理は `TokenIssuer` インターフェースの背後に抽象化し、HTTP層（Hono）はこのインターフェースのみに依存する。

## 後回しにする事項

- devcontainer側の具体的な利用パターン（gh CLIラッパー、git credential helperなど）
