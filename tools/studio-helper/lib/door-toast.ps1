# Windows notification for a door scan while the booth panel is not up (lib/doorwatch.mjs). The button opens the booth through the same
# launcher as the "Babson Radio Booth" Desktop shortcut. It stays until dismissed, and never opens the booth by itself.
param([string]$Launcher = 'C:\BabsonRadio\scripts\open-booth.vbs')
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$uri = 'file:///' + ($Launcher -replace '\\', '/')
$xml = @"
<toast activationType="protocol" launch="$uri" scenario="reminder">
  <visual><binding template="ToastGeneric">
    <text>Someone scanned the door code.</text>
    <text>Open the booth to sign them in.</text>
  </binding></visual>
  <actions>
    <action content="Open the booth" activationType="protocol" arguments="$uri"/>
    <action content="Dismiss" activationType="system" arguments="dismiss"/>
  </actions>
</toast>
"@
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
# Windows PowerShell's own app id, so no app has to be registered.
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
'shown'
