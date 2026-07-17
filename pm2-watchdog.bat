@echo off
rem pm2-watchdog.bat
rem Runs via a Windows Scheduled Task (as SYSTEM) so it works independent of any
rem user login session -- survives sign-out, not just reboot. Explicitly points
rem PM2_HOME at the interactive user's existing pm2 data so it resurrects the
rem same saved process list regardless of which account context invokes it.
rem Safe to run repeatedly: "pm2 resurrect" is a no-op if htn-bot is already running.
set PM2_HOME=C:\Users\HTN-BANDIT\.pm2
call "C:\Users\HTN-BANDIT\AppData\Roaming\npm\pm2.cmd" resurrect < nul >> "E:\discoardhtn\watchdog-log.txt" 2>&1
