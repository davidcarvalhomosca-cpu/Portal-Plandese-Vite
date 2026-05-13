@echo off
title Portal Plandese - Deploy GitHub + Vercel
color 2F
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   PORTAL PLANDESE v2 — DEPLOY       ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0"

echo [1/4] A fazer build de producao...
call npm run build
if errorlevel 1 (
    echo ERRO no build! Verifique os erros acima.
    pause
    exit /b 1
)
echo Build OK!
echo.

echo [2/4] A adicionar ficheiros ao git...
git add .
echo.

set /p MSG="Mensagem do commit (Enter para data/hora automatica): "
if "%MSG%"=="" (
    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATEPT=%%a/%%b/%%c
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set HORA=%%a:%%b
    set MSG=deploy: %DATEPT% %HORA%
)

echo [3/4] Commit: %MSG%
git commit -m "%MSG%"
echo.

echo [4/4] A enviar para GitHub...
git push origin main
echo.
echo ╔══════════════════════════════════════╗
echo ║  Concluido! Vercel faz deploy auto  ║
echo ╚══════════════════════════════════════╝
echo.
pause
