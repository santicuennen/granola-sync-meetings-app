Write-Host "🚀 Meetings Vault - Setup Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Ejecutá este script desde la carpeta meetings-app/" -ForegroundColor Red
    exit 1
}

# Inicializar git si no existe
if (-not (Test-Path ".git")) {
    Write-Host "📦 Inicializando git..." -ForegroundColor Yellow
    git init
    git branch -M main
}

# Verificar .gitignore
if (-not (Test-Path ".gitignore")) {
    Write-Host "❌ Error: .gitignore no encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "✅ .gitignore verificado" -ForegroundColor Green

# Verificar que no hay archivos .env en staging
$envFiles = git ls-files | Select-String "\.env"
if ($envFiles) {
    Write-Host "⚠️  ADVERTENCIA: Hay archivos .env en staging!" -ForegroundColor Red
    Write-Host "   Ejecutá: git rm --cached .env*" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ No hay archivos .env en staging" -ForegroundColor Green

# Agregar remote si no existe
$remotes = git remote
if ($remotes -notcontains "origin") {
    Write-Host "" 
    Write-Host "📡 Configurando remote..." -ForegroundColor Yellow
    git remote add origin https://github.com/santicuennen/granola-sync-meetings-app.git
    Write-Host "✅ Remote configurado" -ForegroundColor Green
}

# Agregar archivos
Write-Host ""
Write-Host "📝 Agregando archivos..." -ForegroundColor Yellow
git add .

# Mostrar status
Write-Host ""
Write-Host "📊 Git status:" -ForegroundColor Cyan
git status

Write-Host ""
Write-Host "✅ Setup completo!" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Revisar los archivos que se van a subir (arriba)"
Write-Host "2. Commit: git commit -m 'Initial commit'"
Write-Host "3. Push: git push -u origin main"
Write-Host ""
Write-Host "Después:" -ForegroundColor Cyan
Write-Host "4. Deploy en Vercel: https://vercel.com/new"
Write-Host "5. Configurar env vars en Vercel Dashboard"
Write-Host "6. Ver DEPLOYMENT.md para más detalles"
