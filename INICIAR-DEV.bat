@echo off
title Portal Plandese - Servidor de Desenvolvimento
color 1F
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   PORTAL PLANDESE v2 — VITE DEV     ║
echo  ╚══════════════════════════════════════╝
echo.
echo  A iniciar servidor de desenvolvimento...
echo  Abre o browser em: http://localhost:3000
echo.
cd /d "%~dp0"
npm run dev
pause
