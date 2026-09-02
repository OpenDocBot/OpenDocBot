#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$ManifestUrl = 'https://opendocbot.com/manifest.xml'
$CatalogPath  = Join-Path $env:ProgramData 'OpenDocBot\Sideload'
$ManifestFile = Join-Path $CatalogPath 'manifest.xml'
$ShareName  = 'OpenDocBotSideload'
$CatalogUrl = "\\$env:COMPUTERNAME\$ShareName"
$Guid    = '{D5A7B2C1-9F4E-4A3D-8B6C-1E2F3A4B5C6D}'
$RegPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$Guid"

# Well-known SIDs -> locale-correct account names (Everyone, Administrators)
$EveryoneName = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0').Translate([System.Security.Principal.NTAccount]).Value
$AdminName    = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544').Translate([System.Security.Principal.NTAccount]).Value

New-Item -ItemType Directory -Path $CatalogPath -Force | Out-Null
Invoke-WebRequest -Uri $ManifestUrl -OutFile $ManifestFile -UseBasicParsing

$share = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if ($share) {
    if ($share.Path -ne $CatalogPath) {
        Write-Host "Repointing $ShareName to $CatalogPath"
        Set-SmbShare -Name $ShareName -Path $CatalogPath -Force
    }
    Grant-SmbShareAccess -Name $ShareName -AccountName $EveryoneName -AccessRight Read -Force -ErrorAction SilentlyContinue
} else {
    New-SmbShare -Name $ShareName -Path $CatalogPath -ReadAccess $EveryoneName -FullAccess $AdminName | Out-Null
}

New-Item -Path $RegPath -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Id'    -Value $Guid       -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Url'   -Value $CatalogUrl -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name 'Flags' -Value 1           -PropertyType DWord  -Force | Out-Null

Write-Host "OpenDocBot Addin installed! Restart all Office apps and check Home > Add-ins > More Add-ins > SHARED FOLDER." -ForegroundColor Green
