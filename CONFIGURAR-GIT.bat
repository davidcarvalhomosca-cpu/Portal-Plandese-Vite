@echo off
title Configurar Git - Portal Plandese Vite
color 3F
echo.
echo  =============================================
echo   CONFIGURAR GIT (executar 1x)
echo  =============================================
echo.
cd /d "%~dp0"

echo [0/5] A limpar pasta .git corrompida (se existir)...
if exist ".git" (
    attrib -r -h -s ".git" /s /d 2>nul
    rmdir /s /q ".git" 2>nul
    echo   .git removido.
) else (
    echo   Nenhuma pasta .git encontrada.
)

echo.
echo [1/5] A inicializar repositorio Git...
git init
if errorlevel 1 (
    echo ERRO: git init falhou.
    pause
    exit /b 1
)
git branch -M main

echo.
echo [2/5] A configurar identidade...
git config user.email "davidcarvalhomosca@gmail.com"
git config user.name "davidcarvalhomosca-cpu"

echo.
echo [3/5] A ligar ao GitHub...
git remote add origin https://github.com/davidcarvalhomosca-cpu/Portal-Plandese-Vite.git

echo.
echo [4/5] A adicionar todos os ficheiros...
git add -A

echo.
echo [5/5] Primeiro commit e push (force)...
git commit -m "fix: expor funcoes globais e corrigir chave Supabase"
git push -u origin main --force

echo.
echo  =============================================
echo   Concluido! Agora usa o DEPLOY.bat
echo  =============================================
echo.
pause
