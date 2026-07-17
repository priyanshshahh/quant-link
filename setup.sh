#!/bin/bash

echo "======================================"
echo "QuantLink — Real-Time Financial Simulation"
echo "Setup Script"
echo "======================================"
echo ""

# Display summary of what the script will do
echo "This script will:"
echo "  • Check for and install Node.js (via nvm) if missing"
echo "  • Check for and install Rust if missing"
echo "  • Check for and install SpacetimeDB CLI if missing" 
echo "  • Set up the wasm32-unknown-unknown target for Rust"
echo "  • Install client dependencies (npm packages)"
echo "  • Build the server code (SpacetimeDB module)"
echo "  • Generate TypeScript bindings for client-server communication"
echo ""
echo "Note: Internet connection required. Some steps may require your password."
echo ""

# Ask for confirmation
read -p "Do you want to continue? [Y/n] " response
if [[ "$response" =~ ^([nN][oO]|[nN])$ ]]; then
  echo "Setup aborted."
  exit 0
fi

echo "Starting setup..."
echo ""

# Check for required tools - first try to install missing ones
echo "Checking and installing required tools if needed..."
echo ""

# Check and install Rust
echo "→ Checking for Rust..."
if command -v rustc &> /dev/null; then
  echo "✅ Rust $(rustc --version | cut -d' ' -f2) is already installed"
  rust_ok=0
else
  echo "❌ Rust not found. Installing Rust..."
  # Run rustup-init with default settings (-y flag)
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  
  # Source cargo environment
  source "$HOME/.cargo/env"
  
  if command -v rustc &> /dev/null; then
    echo "✅ Rust $(rustc --version | cut -d' ' -f2) installed successfully"
    rust_ok=0
  else
    echo "❌ Failed to install Rust. Please install manually."
    rust_ok=1
  fi
fi

# Check and install Node.js (which includes npm)
echo "→ Checking for Node.js..."
if command -v node &> /dev/null; then
  echo "✅ Node.js $(node -v) is already installed"
  node_ok=0
  npm_ok=0
else
  echo "❌ Node.js not found."
  
  # Check for NVM and install it if missing
  if [ -z "${NVM_DIR}" ] || [ ! -d "${NVM_DIR}" ]; then
    echo "❌ nvm not found. Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
    
    # Source nvm without restarting the shell
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    if ! command -v nvm &> /dev/null; then
      echo "❌ Failed to install nvm. Please install manually."
      node_ok=1
      npm_ok=1
    else
      echo "✅ nvm installed successfully"
    fi
  else
    echo "✅ nvm is already installed"
    # Ensure nvm is loaded
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
  
  # If nvm is available, install Node.js
  if command -v nvm &> /dev/null; then
    echo "Installing Node.js 22 via nvm..."
    nvm install 22
    nvm use 22
    
    if command -v node &> /dev/null; then
      echo "✅ Node.js $(node -v) installed successfully"
      node_ok=0
      npm_ok=0
    else
      echo "❌ Failed to install Node.js. Please install manually."
      node_ok=1
      npm_ok=1
    fi
  fi
fi

# Check for SpacetimeDB and install if missing
echo "→ Checking for SpacetimeDB..."
if command -v spacetime &> /dev/null; then
  echo "✅ SpacetimeDB is already installed"
  spacetime_ok=0
else
  echo "❌ SpacetimeDB not found. Installing now..."
  curl -sSf https://install.spacetimedb.com | sh
  
  # Check if installation was successful
  if ! command -v spacetime &> /dev/null; then
    # Try to source the path updates
    if [ -f "$HOME/.cargo/env" ]; then
      source "$HOME/.cargo/env"
    fi
    
    # Try to add ~/.local/bin to PATH if SpacetimeDB was installed there
    if [ -f "$HOME/.local/bin/spacetime" ]; then
      echo "SpacetimeDB found in ~/.local/bin, adding to PATH..."
      export PATH="$HOME/.local/bin:$PATH"
      
      # Also add to shell profile for future sessions
      if [ -f "$HOME/.bashrc" ]; then
        if ! grep -q "PATH=\"\$HOME/.local/bin:\$PATH\"" "$HOME/.bashrc"; then
          echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
          echo "Added ~/.local/bin to PATH in ~/.bashrc"
        fi
      elif [ -f "$HOME/.zshrc" ]; then
        if ! grep -q "PATH=\"\$HOME/.local/bin:\$PATH\"" "$HOME/.zshrc"; then
          echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
          echo "Added ~/.local/bin to PATH in ~/.zshrc"
        fi
      fi
    fi
    
    # Check again after PATH modification
    if ! command -v spacetime &> /dev/null; then
      echo "❌ Failed to install SpacetimeDB. Please install manually."
      spacetime_ok=1
    else
      echo "✅ SpacetimeDB installed successfully"
      spacetime_ok=0
    fi
  else
    echo "✅ SpacetimeDB installed successfully"
    spacetime_ok=0
  fi
fi

echo "  SpacetimeDB version: $(spacetime version list 2>/dev/null | head -1 || echo 'unknown')"

# Check for Rust WASM target
echo "→ Checking for wasm32 target..."
rustup target list | grep "wasm32-unknown-unknown (installed)" > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ wasm32-unknown-unknown target is installed"
  wasm_ok=0
else
  echo "❌ wasm32-unknown-unknown target not found. Installing now..."
  rustup target add wasm32-unknown-unknown
  if [ $? -eq 0 ]; then
    echo "✅ wasm32-unknown-unknown target installed successfully"
    wasm_ok=0
  else
    echo "❌ Failed to install wasm32-unknown-unknown target"
    wasm_ok=1
  fi
fi

# Exit if any required tool is missing
if [ "$npm_ok" = "1" ] || [ "$rust_ok" = "1" ] || [ "$spacetime_ok" = "1" ] || [ "$wasm_ok" = "1" ]; then
  echo ""
  echo "❌ Some tools couldn't be installed automatically. Please install them manually and try again."
  exit 1
fi

echo ""
echo "✅ All required tools are installed successfully!"
echo ""

# Install client dependencies
echo "======================================"
echo "Installing client dependencies..."
echo "======================================"
cd client
npm install
if [ $? -ne 0 ]; then
  echo "❌ Failed to install client dependencies"
  exit 1
fi
echo "✅ Client dependencies installed successfully"
cd ..

# Build server
echo ""
echo "======================================"
echo "Building server code..."
echo "======================================"
cd server
spacetime build
if [ $? -ne 0 ]; then
  echo "❌ Failed to build server code"
  exit 1
fi

echo "✅ Server code built successfully"
echo ""

# Generate TypeScript bindings
echo "======================================"
echo "Generating TypeScript bindings..."
echo "======================================"
spacetime generate --lang typescript --out-dir ../client/src/generated
if [ $? -ne 0 ]; then
  echo "❌ Failed to generate TypeScript bindings"
  exit 1
fi
echo "✅ TypeScript bindings generated successfully"
echo ""

echo ""
echo "✅ Setup complete!"
echo ""
echo "======================================"
echo "🎮 Getting Started"
echo "======================================"
echo ""
echo "1. Start the SpacetimeDB server:"
echo "   cd server"
echo "   spacetime start"
echo ""
echo "2. In a new terminal, publish the module:"
echo "   cd server"
echo "   spacetime publish quant-link"
echo ""
echo "3. In a new terminal, start the client:"
echo "   cd client"
echo "   npm run dev"
echo ""
echo "4. Open your browser to the URL shown in the client terminal (usually http://localhost:5173)"
echo ""
echo "📚 For more information, see README.md"
echo "======================================" 