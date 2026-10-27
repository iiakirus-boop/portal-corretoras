# Entrar na Bradesco: na 1a vez pede CPF e senha nesta janela e guarda criptografados (so o seu usuario do Windows abre).
# Para trocar a senha: apague %LOCALAPPDATA%\Shaddai\bradesco.cred e rode de novo.
$arq = Join-Path $env:LOCALAPPDATA 'Shaddai\bradesco.cred'
if (-not (Test-Path $arq)) {
  New-Item -ItemType Directory -Force (Split-Path $arq) | Out-Null
  Write-Host 'Primeira vez: digite o login do Portal de Negocios Bradesco (fica guardado criptografado).'
  $cpf = Read-Host 'CPF'
  $senha = Read-Host 'Senha (nao aparece enquanto digita)' -AsSecureString
  if (-not $cpf -or $senha.Length -eq 0) { Write-Host 'CPF e senha nao foram preenchidos. Rode o atalho de novo.'; exit 1 }
  New-Object System.Management.Automation.PSCredential($cpf, $senha) | Export-Clixml $arq
}
$c = Import-Clixml $arq
$env:BRAD_USER = $c.UserName
$env:BRAD_PASS = $c.GetNetworkCredential().Password
Write-Host 'Abrindo o portal da Bradesco...'
node (Join-Path $PSScriptRoot 'login_bradesco.js')
