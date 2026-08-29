#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sideloads the OpenDocBot Office Add-in via SMB share.
#>

$ErrorActionPreference = 'Stop'

$ManifestUrl  = 'https://opendocbot.com/manifest.xml'
$CatalogPath  = Join-Path $env:LOCALAPPDATA 'OpenDocBot\Sideload'
$ManifestFile = Join-Path $CatalogPath 'manifest.xml'
$ShareName    = 'OpenDocBotSideload'
$CatalogUrl   = "\\$env:COMPUTERNAME\$ShareName"
$Guid         = '{D5A7B2C1-9F4E-4A3D-8B6C-1E2F3A4B5C6D}'
$RegPath      = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$Guid"

# 1. Download Manifest
New-Item -ItemType Directory -Path $CatalogPath -Force | Out-Null
Invoke-WebRequest -Uri $ManifestUrl -OutFile $ManifestFile -UseBasicParsing

# 2. Ensure SMB Share Exists
if (-not (Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue)) {
    New-SmbShare -Name $ShareName -Path $CatalogPath -FullAccess "$env:USERDOMAIN\$env:USERNAME" | Out-Null
}

# 3. Register Catalog in Registry
New-Item -Path $RegPath -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Id'    -Value $Guid       -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Url'   -Value $CatalogUrl -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Flags' -Value 1           -PropertyType DWord  -Force | Out-Null

Write-Host "OpenDocBot Addin installed! Restart all Office apps and check Home > Add-ins > More Add-ins > SHARED FOLDER." -ForegroundColor Green
