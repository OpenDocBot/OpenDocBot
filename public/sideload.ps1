#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sideloads the OpenDocBot Office Add-in via an SMB shared folder catalog.
.DESCRIPTION
    Uses a machine-wide catalog in ProgramData so every local user can read it.
    Reconciles an existing misconfigured share (repoints path, fixes ACL) instead
    of blindly skipping it, then registers the trusted catalog in HKCU.
    Run as the user who will use the add-in in Office.
#>

$ErrorActionPreference = 'Stop'

$ManifestUrl = 'https://opendocbot.com/manifest.xml'

# Machine-wide catalog (avoids per-user profile collision)
$CatalogPath  = Join-Path $env:ProgramData 'OpenDocBot\Sideload'
$ManifestFile = Join-Path $CatalogPath 'manifest.xml'

$ShareName  = 'OpenDocBotSideload'
$CatalogUrl = "\\$env:COMPUTERNAME\$ShareName"

$Guid    = '{D5A7B2C1-9F4E-4A3D-8B6C-1E2F3A4B5C6D}'
$RegPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$Guid"

# 1. Download the manifest into the catalog
New-Item -ItemType Directory -Path $CatalogPath -Force | Out-Null
Invoke-WebRequest -Uri $ManifestUrl -OutFile $ManifestFile -UseBasicParsing

# 2. Reconcile the SMB share: create, or repair if it points at the wrong
#    folder or has a stale per-user ACL.
$share = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if ($share) {
    if ($share.Path -ne $CatalogPath) {
        Write-Host "Existing share $ShareName points to $($share.Path); repointing to $CatalogPath"
        Set-SmbShare -Name $ShareName -Path $CatalogPath -Force
    }
    if ('Everyone' -notin (Get-SmbShareAccess -Name $ShareName).AccountName) {
        Grant-SmbShareAccess -Name $ShareName -AccountName Everyone -AccessRight Read -Force
    }
} else {
    New-SmbShare -Name $ShareName -Path $CatalogPath -ReadAccess Everyone -FullAccess 'BUILTIN\Administrators' | Out-Null
}

# 3. Register the trusted catalog for the current user (HKCU)
New-Item -Path $RegPath -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Id'    -Value $Guid       -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Url'   -Value $CatalogUrl -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Flags' -Value 1           -PropertyType DWord  -Force | Out-Null

Write-Host "OpenDocBot Addin installed! Restart all Office apps and check Home > Add-ins > More Add-ins > SHARED FOLDER." -ForegroundColor Green
