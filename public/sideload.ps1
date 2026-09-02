#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$ManifestUrl = 'https://opendocbot.com/manifest.xml'
$CatalogPath  = Join-Path $env:ProgramData 'OpenDocBot\Sideload'
$ManifestFile = Join-Path $CatalogPath 'manifest.xml'
$ShareName  = 'OpenDocBotSideload'
$CatalogUrl = "\\$env:COMPUTERNAME\$ShareName"
$Guid    = '{D5A7B2C1-9F4E-4A3D-8B6C-1E2F3A4B5C6D}'
$RegPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$Guid"

New-Item -ItemType Directory -Path $CatalogPath -Force | Out-Null
Invoke-WebRequest -Uri $ManifestUrl -OutFile $ManifestFile -UseBasicParsing

$share = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if ($share) {
    if ($share.Path -ne $CatalogPath) {
        Write-Host "Repointing $ShareName to $CatalogPath"
        Set-SmbShare -Name $ShareName -Path $CatalogPath -Force
    }
    # Everyone read, using the locale-independent SID
    Grant-SmbShareAccess -Name $ShareName -AccountName 'S-1-1-0' -AccessRight Read -Force -ErrorAction SilentlyContinue
} else {
    # SIDs: S-1-1-0 = Everyone (read), S-1-5-32-544 = Administrators (full)
    New-SmbShare -Name $ShareName -Path $CatalogPath -ReadAccess 'S-1-1-0' -FullAccess 'S-1-5-32-544' | Out-Null
}

New-Item -Path $RegPath -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Id'    -Value $Guid       -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Url'   -Value $CatalogUrl -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Flags' -Value 1           -PropertyType DWord  -Force | Out-Null

Write-Host "OpenDocBot Addin installed! Restart all Office apps and check Home > Add-ins > More Add-ins > SHARED FOLDER." -ForegroundColor Green
