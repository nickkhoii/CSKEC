param([string]$Email, [string]$Password, [string]$RouteList)

$ErrorActionPreference = 'Continue'
$Paths = $RouteList -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$base = 'http://localhost:3000'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# ---- 1. Fetch a CSRF token from the Auth.js endpoint -------------------
try {
  $csrfResp = Invoke-RestMethod -Uri "$base/api/auth/csrf" -WebSession $s -TimeoutSec 90
  $csrf = $csrfResp.csrfToken
} catch {
  Write-Output "RESULT CSRF_FAIL $($_.Exception.Message)"
  exit 2
}
if (-not $csrf) { Write-Output 'RESULT CSRF_EMPTY'; exit 2 }

# ---- 2. POST to the Auth.js credentials callback ------------------------
$body = @{ csrfToken = $csrf; email = $Email; password = $Password; callbackUrl = "$base/dashboard"; json = 'true' }
try {
  $resp = Invoke-WebRequest -Uri "$base/api/auth/callback/credentials" -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -WebSession $s -UseBasicParsing -TimeoutSec 90 -ErrorAction Stop
  $status = $resp.StatusCode
  $payload = $resp.Content
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  $payload = ''
}
$cookies = ($s.Cookies.GetCookies($base) | ForEach-Object { $_.Name }) -join ','
if ($cookies -notmatch 'authjs.session-token') {
  Write-Output "RESULT LOGIN_FAILED status=$status cookies=[$cookies] body=$payload"
  exit 1
}
Write-Output "RESULT LOGIN_OK status=$status cookies=[$cookies]"

# ---- 3. Walk every protected route --------------------------------------
$fail = @()
foreach ($p in $Paths) {
  $u = "$base$p"
  try {
    $r = Invoke-WebRequest -Uri $u -WebSession $s -UseBasicParsing -TimeoutSec 120
    $code = $r.StatusCode
    $len = $r.Content.Length
    $flag = 'OK'
    if ($code -ge 400 -or $code -ge 300) { $flag = 'REDIRECT/ERR' }
    Write-Output ("ROUTE {0,-34} {1,4} len={2,-8} {3}" -f $p, $code, $len, $flag)
    if ($code -ge 400) { $fail += $p }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Output ("ROUTE {0,-34} {1,4} EXCEPTION {2}" -f $p, $code, $_.Exception.Message)
    $fail += $p
  }
}
if ($fail.Count -gt 0) { Write-Output ("FAILED_COUNT " + $fail.Count) } else { Write-Output 'FAILED_COUNT 0' }
