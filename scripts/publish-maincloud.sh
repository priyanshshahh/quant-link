#!/bin/bash
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

echo "=== SpacetimeDB login check ==="
spacetime login show

echo ""
echo "=== Publishing quant-link to maincloud ==="
cd "$(dirname "$0")/../server"
spacetime build
spacetime publish quant-link --server maincloud -y

echo ""
echo "=== Done! Module live at maincloud.spacetimedb.com / quant-link ==="
spacetime list --server maincloud -y
