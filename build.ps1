# Build with Vite
npm run vite-build

# Copy public files to dist
if (Test-Path "dist") {
    Copy-Item -Path "public\*" -Destination "dist\" -Recurse -Force
    Write-Host "✓ Public files copied to dist/" -ForegroundColor Green
} else {
    Write-Error "dist/ directory not found"
    exit 1
}
