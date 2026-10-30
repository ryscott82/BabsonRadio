@echo off
rem Opens the go-live page full screen. Put a shortcut to this in shell:startup after start-helper.cmd.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\BabsonRadioKiosk" https://babsonradio.com/booth
