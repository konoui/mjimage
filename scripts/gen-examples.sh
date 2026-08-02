#!/bin/bash
set -euo pipefail

# README に貼る example を example/input/ から作り直す。
# 手で更新すると描画を変えたときに古い画像が README に残るため、常にここから生成する。

cd "$(dirname "$0")/.."

SRC_DIR=./example/input
DST_DIR=./example/output

mkdir -p $DST_DIR

while read -r input_path; do
    target_name=$(basename $input_path | cut -f 1 -d ".").svg
    echo "generating $DST_DIR/$target_name from $input_path"
    npx tsx src/cmd/index.ts --inputFile $input_path --outputFile $DST_DIR/$target_name
done < <(find $SRC_DIR -mindepth 1 -maxdepth 1 -type f)

# スプライトを埋め込んでいるぶんファイルが大きいので縮める。
npx svgo --config ./svgo.examples.config.mjs -f $DST_DIR
