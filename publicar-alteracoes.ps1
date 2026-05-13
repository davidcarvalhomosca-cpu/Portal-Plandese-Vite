Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Publicar alteracoes no GitHub/Vercel  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$status = git status --short
if (-not $status) {
    Write-Host "Nao ha alteracoes para publicar." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Prima Enter para sair"
    exit 0
}

Write-Host "Alteracoes encontradas:" -ForegroundColor Yellow
git status --short
Write-Host ""

$mensagem = Read-Host "Descricao das alteracoes (ou Enter para usar data/hora)"
if (-not $mensagem) {
    $mensagem = "Atualizacao " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

Write-Host ""
Write-Host "A publicar: $mensagem" -ForegroundColor Cyan
Write-Host ""

git add .
git commit -m $mensagem
git push origin main

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "Publicado com sucesso no GitHub!" -ForegroundColor Green
    Write-Host "A Vercel vai fazer deploy automaticamente." -ForegroundColor Green
} else {
    Write-Host "Erro ao publicar. Verifica a ligacao a internet ou credenciais do GitHub." -ForegroundColor Red
}

Write-Host ""
Read-Host "Prima Enter para sair"
