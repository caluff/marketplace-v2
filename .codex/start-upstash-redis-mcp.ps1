$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $repositoryRoot ".env"

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "The repository root .env file is required to start the Upstash Redis MCP server."
}

$redisUrlLine = Get-Content -LiteralPath $environmentFile |
  Where-Object { $_ -match '^REDIS_URL=' } |
  Select-Object -First 1

if (-not $redisUrlLine) {
  throw "REDIS_URL is missing from the repository root .env file."
}

$redisUrl = $redisUrlLine.Substring("REDIS_URL=".Length).Trim().Trim('"').Trim("'")

if (-not $redisUrl.StartsWith("rediss://", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "REDIS_URL must use the rediss:// protocol for the Upstash Redis MCP server."
}

$env:UPSTASH_REDIS_TCP_URL = $redisUrl
& npx -y "@upstash/redis-mcp"
exit $LASTEXITCODE
