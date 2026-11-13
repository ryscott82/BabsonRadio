# Studio browser window: find the Chrome window of the BabsonRadioBrowser profile, put it on the right half (split) or right of the booth's
# rail (full), and keep it on top of the booth. Prints the process id that owns the window, or 0. Run by the helper (lib/browser.mjs).
param([int]$ProcessId = 0, [string]$Layout = 'split', [int]$RailPx = 260)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class BW {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
}
"@
function Win($id) { $p = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { return $p } return $null }
$p = $null
for ($i = 0; $i -lt 40 -and -not $p; $i++) {
  if ($ProcessId) { $p = Win $ProcessId }
  if (-not $p -and $i -ge 4) {
    # The launcher handed the page to a browser that was already running with this profile: find that one.
    $main = Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*BabsonRadioBrowser*' -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1
    if ($main) { $p = Win $main.ProcessId }
  }
  if (-not $p) { Start-Sleep -Milliseconds 250 }
}
if (-not $p) { '0'; exit }
$h = $p.MainWindowHandle
$w = [BW]::GetSystemMetrics(0); $ht = [BW]::GetSystemMetrics(1)
if ($Layout -eq 'full') { $x = $RailPx } else { $x = [int]($w / 2) }
[void][BW]::ShowWindow($h, 9)   # restore (not maximized), so it can be placed
[void][BW]::SetWindowPos($h, [IntPtr](-1), $x, 0, $w - $x, $ht, 0x0040)   # on top, shown
[BW]::keybd_event(0x12, 0, 0, 0); [BW]::keybd_event(0x12, 0, 2, 0)
[void][BW]::SetForegroundWindow($h)
$p.Id
