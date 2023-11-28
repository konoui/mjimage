#!/bin/bash

PROFILE=$1
if [ -n "$PROFILE" ]; then
    echo using profile $PROFLE
    export AWS_PROFILE=$PROFILE
fi
aws s3 sync ./dist/global s3://static.konoui.dev/mjimage/ --delete
aws s3 cp ./example/index.html s3://static.konoui.dev/mjimage/example/index.html
# aws cloudfront create-invalidation --distribution-id E1RAJVH1SAOQOR --paths "/global.js"
