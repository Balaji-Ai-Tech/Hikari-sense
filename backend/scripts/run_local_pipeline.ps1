$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
Push-Location $backendRoot
try {
    if (-not $env:TEST_DATABASE_URL) {
        throw "Set TEST_DATABASE_URL to the isolated local hikari_test database first."
    }
    if ($env:HIKARI_TEST_DATABASE_DISPOSABLE -ne "1" -or -not $env:HIKARI_TEST_DATABASE_SYSTEM_IDENTIFIER) {
        throw "Set the disposable-database guard and approved cluster identifier before starting."
    }

    @'
from app.core.database_safety import (
    validated_test_database_system_identifier,
    validated_test_database_url,
    verify_test_database_identity,
)
url = validated_test_database_url()
verify_test_database_identity(url, validated_test_database_system_identifier())
print("Verified isolated disposable database identity.")
'@ | & .\.venv\Scripts\python.exe -
    if ($LASTEXITCODE -ne 0) {
        throw "Refusing to start the local pipeline because database identity validation failed."
    }

    $env:DATABASE_URL = $env:TEST_DATABASE_URL
    if (-not $env:INGESTION_CONNECTORS) {
        $env:INGESTION_CONNECTORS = "SRC-OPEN-METEO,SRC-SACHET"
    }
    if (-not $env:INGESTION_POLL_SECONDS) {
        $env:INGESTION_POLL_SECONDS = "900"
    }
    $env:INGESTION_START_DELAY_SECONDS = "0"

    & .\.venv\Scripts\python.exe -m app.workers.local_pipeline_worker
    if ($LASTEXITCODE -ne 0) {
        throw "The supervised local pipeline exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}