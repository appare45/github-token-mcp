#!/bin/sh
# Example TOKEN_REQUEST_HOOK_PATH script: shows a macOS notification for
# each token request, using TOKEN_REQUEST_REPOS / TOKEN_REQUEST_PERMISSIONS
# set by github-token-issuer.ts. Runs before the 1Password prompt.
#
# Usage: TOKEN_REQUEST_HOOK_PATH=./hooks/notify-macos.sh npm start
set -eu

repos=$(printf '%s' "${TOKEN_REQUEST_REPOS:-unknown}" | sed 's/"/\\"/g')
permissions=$(printf '%s' "${TOKEN_REQUEST_PERMISSIONS:-{}}" | sed 's/"/\\"/g')

osascript -e "display notification \"${permissions}\" with title \"GitHub token request\" subtitle \"${repos}\""
