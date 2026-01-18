# DockForLife Proxy Agent - Build System
# Cross-platform compilation for desktop agent

.PHONY: all build clean help linux windows macos

# Default target
all: build

# Build for all platforms
build: linux windows macos
	@echo "Build complete for all platforms"

# Build for Linux
linux:
	@echo "Building for Linux..."
	GOOS=linux GOARCH=amd64 go build -o bin/linux/agent main.go
	@echo "Linux binary: bin/linux/agent"

# Build for Windows
windows:
	@echo "Building for Windows..."
	GOOS=windows GOARCH=amd64 go build -o bin/win/agent.exe main.go
	@echo "Windows binary: bin/win/agent.exe"

# Build for macOS
macos:
	@echo "Building for macOS..."
	GOOS=darwin GOARCH=amd64 go build -o bin/macos/agent main.go
	@echo "macOS binary: bin/macos/agent"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/*
	@echo "Clean complete"

# Show help
help:
	@echo "DockForLife Proxy Agent Build System"
	@echo "====================================="
	@echo ""
	@echo "Targets:"
	@echo "  all      - Build for all platforms (default)"
	@echo "  linux    - Build for Linux (amd64)"
	@echo "  windows  - Build for Windows (amd64)"
	@echo "  macos    - Build for macOS (amd64)"
	@echo "  clean    - Remove all build artifacts"
	@echo "  help     - Show this help message"
	@echo ""
	@echo "Examples:"
	@echo "  make           # Build all platforms"
	@echo "  make linux     # Build only Linux"
	@echo "  make clean     # Clean binaries"
