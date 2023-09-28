#!/bin/bash

SRC_IMAGE_DIR="./static/png/"
DST_IMAGE_DIR="./static/svg"
PNG_FILES="*.png"
# go install github.com/xyproto/png2svg/cmd/png2svg@latest
while read -r f; do

  input_path=$f
  target_name=$(basename $f | cut -f 1 -d ".").svg
  png2svg -v -q -o $DST_IMAGE_DIR/$target_name $input_path

done < <(find $SRC_IMAGE_DIR $PNG_FILES -mindepth 1 -maxdepth 1 -type f)
