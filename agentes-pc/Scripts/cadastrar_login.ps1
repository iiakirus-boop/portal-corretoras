# Cadastra (ou troca a senha de) um login de FATURAS de uma operadora: hapvida, sulamerica, amil...
# Guarda usuario e senha criptografados em %LOCALAPPDATA%\Shaddai\<op>_faturas_<apelido>.cred (so o seu usuario do Windows abre)
# e poe o apelido na lista logins.json (sem senha). O baixar_<op>.js percorre todos os logins ativos.
param([Parameter(Mandatory = $true)][string]$Operadora)
$dir = Join-Path $env:LOCALAPPDATA 'Shaddai'
New-Item -ItemType Directory -Force $dir | Out-Null
Write-Host "Cadastrar login de faturas: $Operadora"
Write-Host 'Logins ja cadastrados:'
node (Join-Path $PSScriptRoot 'logins.js') listar $Operadora
do {
  $apelido = Read-Host 'Apelido do login (ex.: grupo1, renata; so letras, numeros, - e _)'
} until ($apelido -match '^[A-Za-z0-9_-]+$')
$u = Read-Host 'Usuario'
$senha = Read-Host 'Senha (nao aparece enquanto digita)' -AsSecureString
if (-not $u -or $senha.Length -eq 0) { Write-Host 'Usuario e senha nao foram preenchidos. Rode o atalho de novo.'; exit 1 }
New-Object System.Management.Automation.PSCredential($u, $senha) | Export-Clixml (Join-Path $dir "$($Operadora)_faturas_$apelido.cred")
$mascara = if ($u.Length -gt 3) { $u.Substring(0, 3) + ('*' * ($u.Length - 3)) } else { '***' }
node (Join-Path $PSScriptRoot 'logins.js') cadastrar $Operadora $apelido $mascara
Write-Host 'Pronto. Para cadastrar outro, rode o atalho de novo.'
