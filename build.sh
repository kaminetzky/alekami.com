#!/bin/sh
# Builds the live site into site/: one option as the home page, plus only the files it loads.
# Publish a different option by changing PAGE. Deploy with: npx wrangler@4 deploy
set -e
cd "$(dirname "$0")"
PAGE=56-backprop

rm -rf site
mkdir site
sed 's#src="\.\./config\.js"#src="config.js"#' "options/$PAGE.html" > site/index.html
cp config.js site/
# Every script the page loads, plus drone-learn.js, which the training worker loads itself.
for f in $(grep -o 'src="[a-z0-9-]*\.js"' "options/$PAGE.html" | sed 's/src="//; s/"//') drone-learn.js; do
  cp "options/$f" site/
done
echo "Built site/ from options/$PAGE.html:"
ls site
