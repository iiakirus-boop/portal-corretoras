# Entrar na Porto: na 1a vez pede CPF, senha e codigo de acesso nesta janela e guarda criptografados (so o seu usuario do Windows abre).
# Para trocar a senha: apague %LOCALAPPDATA%\Shaddai\porto.cred e rode de novo.
$arq = Join-Path $env:LOCALAPPDATA 'Shaddai\porto.cred'
if (-not (Test-Path $arq)) {
  New-Item -ItemType Directory -Force (Split-Path $arq) | Out-Null
  Write-Host 'Primeira vez: digite o login do Corretor Online da Porto (fica guardado criptografado).'
  $cpf = Read-Host 'CPF'
  $senha = Read-Host 'Senha (nao aparece enquanto digita)' -AsSecureString
  $cod = Read-Host 'Codigo de acesso (Enter para deixar em branco)' -AsSecureString
  if (-not $cpf -or $senha.Length -eq 0) { Write-Host 'CPF e senha nao foram preenchidos. Rode o atalho de novo.'; exit 1 }
  @{ cred = New-Object System.Management.Automation.PSCredential($cpf, $senha); cod = $cod } | Export-Clixml $arq
}
$c = Import-Clixml $arq
$env:PORTO_USER = $c.cred.UserName
$env:PORTO_PASS = $c.cred.GetNetworkCredential().Password
$env:PORTO_COD = (New-Object System.Management.Automation.PSCredential('x', $c.cod)).GetNetworkCredential().Password
Write-Host 'Abrindo o Corretor Online da Porto...'
node (Join-Path $PSScriptRoot 'login_porto.js')
