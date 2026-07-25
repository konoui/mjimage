#!/bin/bash
set -euo pipefail

PROFILE=${1:-}
if [ -n "$PROFILE" ]; then
    echo using profile $PROFILE
    export AWS_PROFILE=$PROFILE
fi

DIST=./dist-browser

# s3 sync は --delete 付きなので、成果物が欠けたまま実行すると
# 配信中のファイルを消してしまう。同期前に揃っていることを確かめる。
for path in "$DIST/global.js" "$DIST/svg" "$DIST/webp"; do
    if [ ! -e "$path" ]; then
        echo "error: $path not found. run 'npm run build:browser' first." >&2
        exit 1
    fi
done

# https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
# max-age: for cdn, 30 days
# s-maxage: for browsre, 5 days
aws s3 sync $DIST/ s3://static.konoui.dev/mjimage/ --delete --cache-control max-age=2592000,s-maxage=432000,stale-while-revalidate=432000
aws s3 cp ./example/index.html s3://static.konoui.dev/mjimage/example/index.html
