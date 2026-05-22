$ErrorActionPreference = "Stop"

$port = 27017
$existing = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -First 1

if ($existing) {
  Write-Host "MongoDB is already listening on 127.0.0.1:$port (PID $($existing.OwningProcess))."
  exit 0
}

$mongod = Get-ChildItem "C:\tmp\mongodb-portable" -Recurse -Filter mongod.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (!$mongod) {
  throw "Portable MongoDB was not found under C:\tmp\mongodb-portable. Download and extract MongoDB ZIP first."
}

$dataPath = "C:\tmp\mongodb-data\car-collector"
$logPath = "C:\tmp\mongodb-data\mongod.log"

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null

Start-Process -FilePath $mongod.FullName -ArgumentList @(
  "--dbpath", $dataPath,
  "--bind_ip", "127.0.0.1",
  "--port", "$port",
  "--logpath", $logPath,
  "--logappend"
) -WindowStyle Hidden

Start-Sleep -Seconds 3

$started = Get-NetTCPConnection -LocalPort $port -ErrorAction Stop |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -First 1

Write-Host "MongoDB started on 127.0.0.1:$port (PID $($started.OwningProcess))."
