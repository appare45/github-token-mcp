#!/bin/sh
# Example TOKEN_REQUEST_HOOK_PATH script: shows a macOS notification for
# each token request, using TOKEN_REQUEST_REPOS / TOKEN_REQUEST_PERMISSIONS
# set by github-token-issuer.ts. Runs before the 1Password prompt.
#
# Usage: TOKEN_REQUEST_HOOK_PATH=./hooks/notify-macos.sh npm start
#
# repos/permissions come from the HTTP request (owner/repo path segment and
# permission query-param keys) and are attacker-influenced, so they are read
# by osascript via `system attribute` rather than interpolated into the
# AppleScript source — string interpolation here would let a crafted value
# break out of the quoted literal and run arbitrary AppleScript/shell.
set -eu

export TOKEN_REQUEST_REPOS="${TOKEN_REQUEST_REPOS:-unknown}"
export TOKEN_REQUEST_PERMISSIONS="${TOKEN_REQUEST_PERMISSIONS:-{}}"

osascript <<'EOF'
set repos to system attribute "TOKEN_REQUEST_REPOS"
set permissions to system attribute "TOKEN_REQUEST_PERMISSIONS"
display notification permissions with title "GitHub token request" subtitle repos
EOF
