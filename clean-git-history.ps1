# Script para limpiar el commit con credenciales expuestas
# ADVERTENCIA: Esto reescribe el historial de Git

Write-Host "Este script eliminará el commit fcf91ce del historial" -ForegroundColor Yellow
Write-Host "ADVERTENCIA: Esto reescribe el historial y requiere force push" -ForegroundColor Red
Write-Host ""
$confirm = Read-Host "¿Continuar? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "Cancelado" -ForegroundColor Yellow
    exit
}

# Hacer backup del branch actual
Write-Host "Creando backup..." -ForegroundColor Cyan
git branch backup-before-rebase

# Hacer rebase interactivo eliminando el commit problemático
Write-Host "Iniciando rebase..." -ForegroundColor Cyan
$env:GIT_SEQUENCE_EDITOR = "powershell -Command `"(Get-Content `$args[0]) -replace 'pick fcf91ce', 'drop fcf91ce' | Set-Content `$args[0]`""
git rebase -i 7ad75b6

if ($LASTEXITCODE -eq 0) {
    Write-Host "Rebase exitoso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ahora ejecutá:" -ForegroundColor Yellow
    Write-Host "  git push --force" -ForegroundColor White
    Write-Host ""
    Write-Host "Si algo sale mal, restaurá con:" -ForegroundColor Yellow
    Write-Host "  git reset --hard backup-before-rebase" -ForegroundColor White
} else {
    Write-Host "Error en rebase. Restaurando..." -ForegroundColor Red
    git rebase --abort
    Write-Host "Rebase abortado. Tu repo está intacto." -ForegroundColor Yellow
}
