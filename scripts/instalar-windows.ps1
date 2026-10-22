$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
node --version
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilação.' }
npm.cmd run setup
Write-Host 'Abra .env, configure a credencial e execute npm run engine. Consulte PRIMEIRO-TESTE.md.'
