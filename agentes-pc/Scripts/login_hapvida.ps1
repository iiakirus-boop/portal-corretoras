# Entrar na Hapvida (comissao): na 1a vez pede usuario e senha de cada login do webhap (045K, 045L, 02JZ) nesta janela e guarda
# criptografados (so o seu usuario do Windows abre). Enter no usuario pula aquele login.
# Os logins de FATURAS (Portal Empresa) sao outros: cadastre no atalho "Cadastrar login Hapvida"; o baixar_hapvida.js entra sozinho.
# Para trocar uma senha: apague %LOCALAPPDATA%\Shaddai\hapvida_<login>.cred e rode de novo.
$dir = Join-Path $env:LOCALAPPDATA 'Shaddai'
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($l in '045K', '045L', '02JZ') {
  $arq = Join-Path $dir "hapvida_$l.cred"
  if (-not (Test-Path $arq)) {
    Write-Host "Primeira vez: digite o login $l do webhap (fica guardado criptografado). Enter no usuario pula."
    $u = Read-Host 'Usuario'
    if (-not $u) { continue }
    $senha = Read-Host 'Senha (nao aparece enquanto digita)' -AsSecureString
    if ($senha.Length -eq 0) { Write-Host 'Senha nao foi preenchida; esse login fica para a proxima vez.'; continue }
    New-Object System.Management.Automation.PSCredential($u, $senha) | Export-Clixml $arq
  }
  $c = Import-Clixml $arq
  Set-Item "env:HAP_$($l.ToUpper())_USER" $c.UserName
  Set-Item "env:HAP_$($l.ToUpper())_PASS" $c.GetNetworkCredential().Password
}
Write-Host 'Abrindo o webhap da Hapvida...'
node (Join-Path $PSScriptRoot 'login_hapvida.js')
