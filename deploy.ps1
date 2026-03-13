# Mission Control Dashboard - Tailscale Deploy Script
# Run this to rebuild and redeploy via Tailscale

Write-Host "🔨 Building static export..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green

Write-Host "🔄 Restarting static file server..." -ForegroundColor Cyan

# Kill old serve process if running
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*serve out*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Start new serve process
Start-Process -FilePath "npx" -ArgumentList "--yes", "serve", "out", "-l", "3000", "--no-clipboard" -WindowStyle Hidden -WorkingDirectory $PWD

Start-Sleep -Seconds 2

Write-Host "✅ Server restarted on http://localhost:3000" -ForegroundColor Green

Write-Host "🌐 Dashboard available at:" -ForegroundColor Cyan
Write-Host "   https://desktop-uo3o1ri.tail0740c4.ts.net/" -ForegroundColor White

Write-Host ""
Write-Host "💡 Tip: Hard refresh browser (Ctrl+Shift+R) to see changes" -ForegroundColor Yellow
