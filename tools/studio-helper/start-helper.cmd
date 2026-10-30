@echo off
rem Starts the studio helper. Put a shortcut to this in shell:startup so it runs at sign-in.
cd /d "%~dp0"
title Babson Radio studio helper
:loop
node helper.mjs
echo Helper stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
