Write-Host "🧪 Testing Meetings Vault UI locally" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Ejecutá este script desde la carpeta meetings-app/" -ForegroundColor Red
    exit 1
}

# Instalar dependencias si no existen
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

Write-Host "✅ Dependencias instaladas" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Iniciando servidor de desarrollo..." -ForegroundColor Cyan
Write-Host ""
Write-Host "La app usará datos mock (no requiere database)" -ForegroundColor Yellow
Write-Host "Abrí: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Presioná Ctrl+C para detener" -ForegroundColor Yellow
Write-Host ""

npm run dev
