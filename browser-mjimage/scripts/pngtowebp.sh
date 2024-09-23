#!/bin/bash

SRC_IMAGE_DIR="./static/png/"
DST_IMAGE_DIR="./static/webp"
PNG_FILES="*.png"
# brew install cwebp
while read -r f; do

  input_path=$f
  target_name=$(basename $f | cut -f 1 -d ".").webp
  cwebp -lossless -preset icon -metadata icc -sharp_yuv -o $DST_IMAGE_DIR/$target_name -progress -short $input_path

done < <(find $SRC_IMAGE_DIR $PNG_FILES -mindepth 1 -maxdepth 1 -type f)
