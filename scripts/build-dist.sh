#!/bin/bash
# CoMemo - Distribution ZIP Builder
# Creates a ZIP file with only the files needed for Chrome extension

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_ROOT/dist"
ZIP_NAME="CoMemo-v1.0.0.zip"

echo -e "${BLUE}Building CoMemo distribution...${NC}"

# Clean and create dist directory
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/CoMemo"

# Copy required files
echo "Copying files..."

# manifest.json
cp "$PROJECT_ROOT/manifest.json" "$DIST_DIR/CoMemo/"

# assets (icons and fonts)
mkdir -p "$DIST_DIR/CoMemo/assets/icons"
mkdir -p "$DIST_DIR/CoMemo/assets/fonts"
cp "$PROJECT_ROOT/assets/icons/icon_16px.png" "$DIST_DIR/CoMemo/assets/icons/"
cp "$PROJECT_ROOT/assets/icons/icon_32px.png" "$DIST_DIR/CoMemo/assets/icons/"
cp "$PROJECT_ROOT/assets/icons/icon_48px.png" "$DIST_DIR/CoMemo/assets/icons/"
cp "$PROJECT_ROOT/assets/icons/icon_64px.png" "$DIST_DIR/CoMemo/assets/icons/"
cp "$PROJECT_ROOT/assets/icons/icon_128px.png" "$DIST_DIR/CoMemo/assets/icons/"
cp "$PROJECT_ROOT/assets/icons/cocome_300px.png" "$DIST_DIR/CoMemo/assets/icons/"
cp "$PROJECT_ROOT/assets/fonts/"* "$DIST_DIR/CoMemo/assets/fonts/" 2>/dev/null || true

# lib
mkdir -p "$DIST_DIR/CoMemo/lib"
cp "$PROJECT_ROOT/lib/supabase.min.js" "$DIST_DIR/CoMemo/lib/"

# src
mkdir -p "$DIST_DIR/CoMemo/src/js"
mkdir -p "$DIST_DIR/CoMemo/src/css"
cp "$PROJECT_ROOT/src/js/config.js" "$DIST_DIR/CoMemo/src/js/"
cp "$PROJECT_ROOT/src/js/config.example.js" "$DIST_DIR/CoMemo/src/js/"
cp "$PROJECT_ROOT/src/js/content.js" "$DIST_DIR/CoMemo/src/js/"
cp "$PROJECT_ROOT/src/js/background.js" "$DIST_DIR/CoMemo/src/js/"
cp "$PROJECT_ROOT/src/css/content.css" "$DIST_DIR/CoMemo/src/css/"

# Create README for users
cat > "$DIST_DIR/CoMemo/README.txt" << 'EOF'
CoMemo - Web Memo Share
=======================

Installation:
1. Open Chrome and go to chrome://extensions
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this CoMemo folder

Setup (Optional - for cloud sync):
1. Copy src/js/config.example.js to src/js/config.js
2. Create a Supabase project at https://supabase.com
3. Add your Supabase URL and anon key to config.js

Enjoy!
EOF

# Create ZIP
echo "Creating ZIP..."
cd "$DIST_DIR"
zip -r "$ZIP_NAME" CoMemo -x "*.DS_Store"

# Cleanup folder, keep only ZIP
rm -rf "$DIST_DIR/CoMemo"

echo -e "${GREEN}Done! Created: dist/$ZIP_NAME${NC}"
echo "File size: $(du -h "$DIST_DIR/$ZIP_NAME" | cut -f1)"
