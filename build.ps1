# Build with Vite
npm run vite-build

# Copy public files to dist with proper structure
if (Test-Path "dist") {
    # Copy public folder contents to dist (including index.html)
    Copy-Item -Path "public\*" -Destination "dist\" -Recurse -Force
    
    Write-Host "✓ Public files copied to dist/" -ForegroundColor Green
    
    # Verify files
    if (Test-Path "dist\index.html") {
        Write-Host "✓ index.html exists" -ForegroundColor Green
    } else {
        Write-Host "✗ index.html NOT found!" -ForegroundColor Red
        exit 1
    }
    
    if (Test-Path "dist\static") {
        Write-Host "✓ dist\static folder exists" -ForegroundColor Green
        Get-ChildItem "dist\static" | ForEach-Object { Write-Host "  - $($_.Name)" }
    } else {
        Write-Host "✗ dist\static folder NOT found!" -ForegroundColor Red
        exit 1
    }
    
    # Fix _routes.json for proper routing
    $routesJson = '{"version":1,"include":["/api/*"],"exclude":["/*"]}'
    Set-Content -Path "dist\_routes.json" -Value $routesJson -NoNewline
    Write-Host "✓ _routes.json configured: $routesJson" -ForegroundColor Green
    
} else {
    Write-Error "dist/ directory not found"
    exit 1
}

