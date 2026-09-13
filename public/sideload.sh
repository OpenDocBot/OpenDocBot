#!/usr/bin/env bash
#
# Sideloads the OpenDocBot Office Add-in into Word, Excel and PowerPoint on
# macOS by copying the manifest into each app's wef folder.
#
# Usage: curl -fsSL https://opendocbot.com/sideload.sh | bash

set -euo pipefail

ManifestUrl="https://opendocbot.com/manifest.xml"

WefDirs=(
  "$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
  "$HOME/Library/Containers/com.microsoft.Excel/Data/Documents/wef"
  "$HOME/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef"
)

for dir in "${WefDirs[@]}"; do
  mkdir -p "$dir"
  curl -fsSL "$ManifestUrl" -o "$dir/manifest.xml"
  echo "OpenDocBot installed in: $dir"
done

echo "Done! Restart Word, Excel and PowerPoint, then check Home > Add-ins."