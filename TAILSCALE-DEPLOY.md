# Tailscale Deployment - Mission Control Dashboard

## ⚡ Quick Deploy

**Simpelste manier:**
```powershell
.\deploy.ps1
```

## Manual Deploy Steps

1. **Build static export:**
   ```powershell
   npm run build
   ```

2. **Start static file server:**
   ```powershell
   npx serve out -l 3000 --no-clipboard
   ```

3. **Configure Tailscale Serve (eenmalig):**
   ```powershell
   tailscale serve --bg 3000
   ```

4. **Check status:**
   ```powershell
   tailscale serve status
   ```

## 🌐 URL
https://desktop-uo3o1ri.tail0740c4.ts.net/

## ✅ Waarom dit werkt:

**Probleem:**
- Next.js production server (`next start`) genereert dynamic asset URLs
- Tailscale Serve proxyt deze niet correct
- CSS/JS laden niet ondanks dat HTML wel laadt

**Oplossing:**
1. **Static export** (`output: 'export'` in next.config.ts)
   - Alle assets worden pre-built als static files
   - Geen runtime rendering nodig
   
2. **Static file server** (`npx serve`)
   - Serveert de `out/` folder met correcte MIME types
   - Simpele HTTP server zonder proxy complexiteit
   
3. **Tailscale proxy** naar localhost:3000
   - Alle requests gaan naar dezelfde server
   - Geen asset path issues

## 🔄 Bij code changes:

1. Run `.\deploy.ps1` (of manual build + restart server)
2. Hard refresh browser: `Ctrl + Shift + R`

## 🛠️ Troubleshooting:

**CSS laadt nog steeds niet:**
1. Check browser console (F12) voor 404 errors
2. Verify `out/` folder exists: `ls out`
3. Check serve process: `Get-Process -Name node`
4. Restart: `.\deploy.ps1`

**Serve process crasht:**
```powershell
# Kill all node processes
Get-Process node | Stop-Process -Force

# Restart
npx serve out -l 3000 --no-clipboard
```

**Tailscale niet bereikbaar:**
```powershell
tailscale serve status  # Check config
tailscale status        # Check Tailscale connection
```
