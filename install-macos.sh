#!/bin/bash
# Seal Pet - macOS Installer
# This script removes the quarantine flag so the app can run without Gatekeeper blocking it

echo ""
echo "🦭 Seal Pet — macOS Installer"
echo "=============================="
echo ""

APP_NAME="Seal Pet.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/$APP_NAME"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Could not find '$APP_NAME' in the same folder as this script."
    echo "   Make sure 'Seal Pet.app' and this script are in the same folder."
    exit 1
fi

echo "Removing security quarantine from '$APP_NAME'..."
xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Done! You can now open Seal Pet normally."
    echo "   Double-click 'Seal Pet.app' to launch your pet!"
    echo ""

    read -p "🚀 Launch Seal Pet now? (y/n): " choice
    if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
        open "$APP_PATH"
    fi
else
    echo ""
    echo "❌ Failed to remove quarantine. Try running with sudo:"
    echo "   sudo bash install-macos.sh"
fi
