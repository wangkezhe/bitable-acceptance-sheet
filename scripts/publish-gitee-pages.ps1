param(
  [string]$Remote = 'gitee',
  [string]$Branch = 'gh-pages'
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $repoRoot 'dist'

if (-not (Test-Path -LiteralPath (Join-Path $distPath 'index.html'))) {
  throw 'dist/index.html was not found. Run the production build before publishing.'
}

$remoteUrl = git -C $repoRoot remote get-url $Remote
if (-not $remoteUrl) {
  throw "Git remote '$Remote' was not found."
}

$name = git -C $repoRoot config user.name
$email = git -C $repoRoot config user.email
$publishPath = Join-Path $env:TEMP ("gitee-pages-" + [guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Path $publishPath | Out-Null
Copy-Item -Path (Join-Path $distPath '*') -Destination $publishPath -Recurse -Force

git -C $publishPath init | Out-Host
git -C $publishPath checkout -b $Branch | Out-Host
git -C $publishPath config user.name $name
git -C $publishPath config user.email $email
git -C $publishPath add .
git -C $publishPath commit -m 'deploy: static site' | Out-Host
git -C $publishPath remote add origin $remoteUrl
git -C $publishPath push --force -u origin $Branch | Out-Host

Write-Host "Published $Branch from $distPath"
