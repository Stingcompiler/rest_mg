<#
    Run the monolith behind a Cloudflare tunnel.

    The tunnel gives the app a real hostname and real HTTPS, which means it is
    also on the open internet -- so this runs config.settings.tunnel (DEBUG off,
    secure cookies) rather than the dev settings, and binds to loopback only so
    nothing but cloudflared can reach the port.

        .\scripts\run-tunnel.ps1
        .\scripts\run-tunnel.ps1 -PublicHost other.example.com
#>
param(
    [string]$PublicHost = "wesam.stingdev.pro",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$api = Join-Path $PSScriptRoot "..\api" | Resolve-Path

# DEBUG is off here, so an unset SECRET_KEY would fall back to the shipped
# insecure one -- which signs the login tokens. Generate a real one once and
# keep it, so sessions survive a restart.
$keyFile = Join-Path $api ".secret-key"
if (-not (Test-Path $keyFile)) {
    $key = python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
    Set-Content -Path $keyFile -Value $key -Encoding utf8 -NoNewline
    Write-Host "Generated $keyFile"
}

$env:DJANGO_SETTINGS_MODULE = "config.settings.tunnel"
$env:DJANGO_SECRET_KEY      = (Get-Content $keyFile -Raw).Trim()
$env:ALLOWED_HOSTS          = "$PublicHost,127.0.0.1,localhost"
$env:CSRF_TRUSTED_ORIGINS   = "https://$PublicHost"

Set-Location $api
python manage.py migrate --noinput
python manage.py collectstatic --noinput | Out-Null

Write-Host ""
Write-Host "Serving https://$PublicHost  (local 127.0.0.1:$Port)" -ForegroundColor Green
Write-Host "Point the tunnel at http://127.0.0.1:$Port"
Write-Host ""

# Loopback only. The tunnel reaches it from this machine; nobody else can, which
# is what makes trusting X-Forwarded-Proto safe.
python manage.py runserver "127.0.0.1:$Port"
