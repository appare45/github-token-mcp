# github-token-mcp

devcontainer内のエージェントへ、GitHub App installation access token を都度発行するホスト専用HTTPサーバー。GitHub Appの秘密鍵はホスト側にのみ存在し、devcontainer側には一切渡さない。

## セットアップ（ホスト側でサーバーを起動）

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

## devcontainerでの使い方

サーバーをホストで起動しておけば、devcontainer側は `GITHUB_TOKEN`/`GH_TOKEN` がシェル全体に設定された状態で `gh` や `git` をそのまま使える。都度MCPツールを呼ぶ必要はない。

1. 利用するリポジトリの `.devcontainer/devcontainer.json` に、対象リポジトリと共有シークレットを渡す設定を追加する:
   ```json
   {
     "containerEnv": {
       "GITHUB_REPO": "<owner>/<repo>"
     },
     "remoteEnv": {
       "BEARER_TOKEN": "${localEnv:BEARER_TOKEN}"
     }
   }
   ```
   `BEARER_TOKEN` は `devcontainer up` を実行するホスト側シェルで export しておく（`.env` はサーバープロセス自身が読むだけで、`${localEnv:...}` は別途OSのシェル環境変数を見る）。
2. Linuxホストでは `host.docker.internal` が既定で解決されないため、`runArgs: ["--add-host=host.docker.internal:host-gateway"]` を追加する。
3. Claude Codeの設定（`~/.claude/settings.json`。devcontainer間で共有する `claude-code-config` volumeに置けば全プロジェクト共通で効く）に、セッション開始時にトークンを取得して `$CLAUDE_ENV_FILE` へ書き出す `SessionStart` フックを登録する:
   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "matcher": "",
           "hooks": [
             {
               "type": "command",
               "command": "$CLAUDE_CONFIG_DIR/hooks/fetch-github-token.sh >> \"$CLAUDE_ENV_FILE\""
             }
           ]
         }
       ]
     }
   }
   ```
   `fetch-github-token.sh` は `$GITHUB_REPO` / `$BEARER_TOKEN` を使ってこのサーバーからトークンを取得し、`export GITHUB_TOKEN=... GH_TOKEN=...` を出力するだけのスクリプト。`GITHUB_REPO`/`BEARER_TOKEN` が未設定のプロジェクトでは何もせず終了するため、他プロジェクトに影響しない。
   ```bash
   #!/bin/sh
   set -e
   if [ -z "$GITHUB_REPO" ] || [ -z "$BEARER_TOKEN" ]; then
     exit 0
   fi
   token=$(curl -fsS "http://host.docker.internal:3000/${GITHUB_REPO}" \
     -H "Authorization: Bearer ${BEARER_TOKEN}") || exit 0
   GH_TOKEN="$token" gh auth setup-git >/dev/null 2>&1 || true
   echo "export GITHUB_TOKEN=${token} GH_TOKEN=${token}"
   ```
   `gh auth setup-git` はgitのcredential helperを `gh` に向ける設定で、`gh` は呼び出し時点の `GH_TOKEN` を見て認証するため、これで `gh` CLIだけでなく `git push`/`git clone` などHTTPS経由のgit操作もそのまま通るようになる。

これでコンテナ内のClaude Codeセッションは起動時にトークンを取得済みの状態になり、`gh auth login` なしで `gh`/`git` が使える。installation tokenの有効期限は約1時間なので、それを超える長時間セッションでは新しいセッションを開始して再取得する。

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
| 403 | Hostヘッダ不許可 |
| 422 | `request_rejected`（GitHub側がリクエストを拒否。指定リポジトリがこのインストールでカバーされていない、または要求した権限がApp登録済みの範囲を超える場合を含む。詳細はGitHubのエラーメッセージをそのまま返す） |
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
