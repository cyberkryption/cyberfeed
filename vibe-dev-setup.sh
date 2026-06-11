#!/usr/bin/env bash
# setup-dev-env.sh
# Installs Go 1.26.3, Node.js 22 (Maintenance LTS), and npm on Debian 13 (Trixie)
# Optionally installs VS Code and Go dev tools via flags.
#
# Usage: chmod +x setup-dev-env.sh && ./setup-dev-env.sh [--vscode] [--go-tools]
#   --vscode     Install VS Code and Go/Claude extensions
#   --go-tools   Install golangci-lint, gopls, dlv, goimports

set -euo pipefail

GO_VERSION="1.26.3"
GO_TARBALL="go${GO_VERSION}.linux-amd64.tar.gz"
GO_URL="https://go.dev/dl/${GO_TARBALL}"

INSTALL_VSCODE=false
INSTALL_GO_TOOLS=false

for arg in "$@"; do
  case "$arg" in
    --vscode)    INSTALL_VSCODE=true ;;
    --go-tools)  INSTALL_GO_TOOLS=true ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--vscode] [--go-tools]"
      exit 1
      ;;
  esac
done

# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────
info()    { echo -e "\n\033[1;34m[INFO]\033[0m $*"; }
success() { echo -e "\033[1;32m[OK]\033[0m $*"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m $*"; }

# ─────────────────────────────────────────
# 1. System update
# ─────────────────────────────────────────
info "Updating system packages..."
sudo apt update && sudo apt upgrade -y
success "System updated"

# ─────────────────────────────────────────
# 2. Install dependencies
# ─────────────────────────────────────────
info "Installing dependencies..."
sudo apt install -y curl gpg apt-transport-https wget
success "Dependencies installed"

# ─────────────────────────────────────────
# 3. VS Code (optional)
# ─────────────────────────────────────────
if [[ "${INSTALL_VSCODE}" == true ]]; then
  info "Adding Microsoft GPG key and VS Code repository..."
  curl -sSL https://packages.microsoft.com/keys/microsoft.asc \
    | gpg --dearmor \
    | sudo tee /etc/apt/trusted.gpg.d/microsoft.gpg > /dev/null

  echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] \
https://packages.microsoft.com/repos/code stable main" \
    | sudo tee /etc/apt/sources.list.d/vscode.list

  info "Installing VS Code..."
  sudo apt update && sudo apt install -y code
  success "VS Code installed: $(code --version | head -1)"
else
  info "Skipping VS Code installation (pass --vscode to install)"
fi

# ─────────────────────────────────────────
# 4. Go
# ─────────────────────────────────────────
info "Downloading Go ${GO_VERSION} from go.dev/dl/..."
wget -q --show-progress "${GO_URL}"

info "Verifying download..."
sha256sum "${GO_TARBALL}"
warn "Please cross-check the hash above against https://go.dev/dl/ before continuing."
read -rp "Hash looks correct? (y/n): " confirm
if [[ "${confirm}" != "y" ]]; then
  echo "Aborting. Please verify the download manually."
  rm -f "${GO_TARBALL}"
  exit 1
fi

info "Installing Go to /usr/local/go..."
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf "${GO_TARBALL}"
rm -f "${GO_TARBALL}"

# ─────────────────────────────────────────
# 5. Go environment variables
# ─────────────────────────────────────────
info "Configuring Go environment variables..."
SHELL_RC="${HOME}/.bashrc"
if [[ "${SHELL}" == */zsh ]]; then
  SHELL_RC="${HOME}/.zshrc"
fi

if ! grep -q '/usr/local/go/bin' "${SHELL_RC}"; then
  echo 'export PATH=$PATH:/usr/local/go/bin' >> "${SHELL_RC}"
  echo 'export PATH=$PATH:$HOME/go/bin' >> "${SHELL_RC}"
  success "PATH entries added to ${SHELL_RC}"
else
  warn "Go PATH entries already present in ${SHELL_RC}, skipping"
fi

export PATH=$PATH:/usr/local/go/bin
export PATH=$PATH:$HOME/go/bin

success "Go installed: $(go version)"

# ─────────────────────────────────────────
# 6. Go dev tools (optional)
# ─────────────────────────────────────────
if [[ "${INSTALL_GO_TOOLS}" == true ]]; then
  info "Installing Go dev tools..."
  go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
  go install golang.org/x/tools/gopls@latest
  go install github.com/go-delve/delve/cmd/dlv@latest
  go install golang.org/x/tools/cmd/goimports@latest
  success "Go tools installed"
else
  info "Skipping Go dev tools (pass --go-tools to install)"
fi

# ─────────────────────────────────────────
# 7. Node.js 22 (Maintenance LTS) + npm
# ─────────────────────────────────────────
info "Removing any existing Node.js installation..."
sudo apt remove -y nodejs npm 2>/dev/null || true

info "Adding NodeSource repository for Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -

info "Installing Node.js 22 and npm..."
sudo apt install -y nodejs
success "Node.js installed: $(node --version)"
success "npm installed: $(npm --version)"

# ─────────────────────────────────────────
# 8. VS Code extensions (optional)
# ─────────────────────────────────────────
if [[ "${INSTALL_VSCODE}" == true ]]; then
  info "Installing VS Code extensions..."
  code --install-extension golang.go
  code --install-extension anthropic.claude-code
  success "VS Code extensions installed"
fi

# ─────────────────────────────────────────
# 9. Summary
# ─────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Installation complete — version summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "${INSTALL_VSCODE}" == true ]]; then
  echo "  VS Code:        $(code --version | head -1)"
fi
echo "  Go:             $(go version)"
if [[ "${INSTALL_GO_TOOLS}" == true ]]; then
  echo "  golangci-lint:  $(golangci-lint --version)"
  echo "  gopls:          $(gopls version)"
  echo "  dlv:            $(dlv version | head -1)"
fi
echo "  Node.js:        $(node --version)"
echo "  npm:            $(npm --version)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo "  1. Run: source ${SHELL_RC}"
echo "  2. Clone your repo"
echo "  3. Add CLAUDE.md to the repo root"
if [[ "${INSTALL_VSCODE}" == true ]]; then
  echo "  4. Run: code ."
fi
echo ""
