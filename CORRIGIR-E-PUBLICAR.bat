@echo off
title A corrigir e publicar portal...
color 1F
echo.
echo  ============================================
echo   CORRIGIR E PUBLICAR PORTAL PLANDESE
echo  ============================================
echo.

cd /d "%~dp0"

echo [1/5] A remover bloqueios git antigos...
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\COMMIT_EDITMSG.lock" del /f /q ".git\COMMIT_EDITMSG.lock"
echo       OK

echo [2/5] A verificar ligacao ao GitHub...
git remote -v
echo.

echo [3/5] A adicionar todas as alteracoes...
git add -A
echo       OK

echo [4/5] A criar commit...
git commit -m "fix: correcao login e novas funcionalidades fornecedores e mapas"
echo       OK

echo [5/5] A publicar no GitHub (Vercel vai atualizar automaticamente)...
git push origin main
echo.

if %ERRORLEVEL% == 0 (
    color 2F
    echo  ============================================
    echo   PUBLICADO COM SUCESSO!
    echo   O Vercel vai reimplantar em 1-2 minutos.
    echo   Atualize o browser apos esse tempo.
    echo  ============================================
) else (
    color 4F
    echo  ============================================
    echo   ERRO ao publicar. Verifique a ligacao
    echo   ao GitHub e tente novamente.
    echo  ============================================
)
echo.
pause
