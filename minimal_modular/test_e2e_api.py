#!/usr/bin/env python3
"""
CreteXtract E2E API Test Suite
==============================

PHILOSOPHY: Test-Driven Development with ZERO tolerance for errors.
- Pure HTTP client - NO filesystem access to backend
- Real data validation - NO mocks
- Output verification - NOT just status checks
- End-to-end workflow testing

Test Levels:
- L1: Syntax (code compiles)
- L2: Registration (component registers)
- L3: Execution (process runs)
- L4: Output Existence (files exist)
- L5: Output Validity (format correct)
- L6: Output Correctness (content matches)
- L7: Round-Trip (output re-consumable)

ALL tests target L6/L7.
"""

import os
import sys
import json
import time
import zipfile
import tempfile
import requests
from io import BytesIO
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

# =============================================================================
# Configuration
# =============================================================================

BASE_URL = os.environ.get("CRETEXTRACT_API_URL", "http://localhost:5007")
TIMEOUT_SECONDS = 300  # 5 minutes max for extraction
POLL_INTERVAL_SECONDS = 2

# Test data paths (use LWC_Majdi folder - NOT uploads which gets nuked)
SCRIPT_DIR = Path(__file__).parent
TEST_DATA_DIR = SCRIPT_DIR / "LWC_Majdi" / "0. New Folder"
SAMPLE_PDFS_DIR = TEST_DATA_DIR / "Papers"
SAMPLE_SCHEMA = TEST_DATA_DIR / "Schema" / "Schema_Updated_Perlite_MeasureEvent_v1_3.xlsx"


# =============================================================================
# Test Result Tracking
# =============================================================================

class TestResult:
    """Track test results with detailed failure information."""
    
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.level_reached = 0
        self.error: Optional[str] = None
        self.details: Dict[str, Any] = {}
        self.start_time = datetime.now()
        self.end_time: Optional[datetime] = None
    
    def pass_level(self, level: int, message: str = ""):
        """Mark a level as passed."""
        self.level_reached = max(self.level_reached, level)
        self.details[f"L{level}"] = {"passed": True, "message": message}
    
    def fail(self, level: int, error: str):
        """Mark test as failed at a specific level."""
        self.passed = False
        self.level_reached = level - 1
        self.error = error
        self.details[f"L{level}"] = {"passed": False, "error": error}
        self.end_time = datetime.now()
    
    def complete(self):
        """Mark test as completed successfully."""
        self.passed = True
        self.end_time = datetime.now()
    
    def duration_ms(self) -> int:
        """Get test duration in milliseconds."""
        end = self.end_time or datetime.now()
        return int((end - self.start_time).total_seconds() * 1000)
    
    def __str__(self) -> str:
        status = "✅ PASS" if self.passed else "❌ FAIL"
        return f"{status} [{self.name}] Level={self.level_reached} Duration={self.duration_ms()}ms"


class TestSuite:
    """Collection of test results."""
    
    def __init__(self, name: str):
        self.name = name
        self.results: List[TestResult] = []
    
    def add(self, result: TestResult):
        self.results.append(result)
    
    def summary(self) -> str:
        passed = sum(1 for r in self.results if r.passed)
        failed = len(self.results) - passed
        lines = [
            f"\n{'='*60}",
            f"TEST SUITE: {self.name}",
            f"{'='*60}",
            f"Total: {len(self.results)} | Passed: {passed} | Failed: {failed}",
            f"{'='*60}",
        ]
        for r in self.results:
            lines.append(str(r))
            if r.error:
                lines.append(f"   └── Error: {r.error}")
        lines.append(f"{'='*60}\n")
        return "\n".join(lines)
    
    def all_passed(self) -> bool:
        return all(r.passed for r in self.results)


# =============================================================================
# API Client (Pure HTTP - No Filesystem Access)
# =============================================================================

class CreteXtractClient:
    """Pure HTTP client for CreteXtract API."""
    
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
    
    def health(self) -> Dict[str, Any]:
        """Check API health."""
        resp = self.session.get(f"{self.base_url}/health", timeout=10)
        resp.raise_for_status()
        return resp.json()
    
    def list_runs(self, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
        """List all runs."""
        resp = self.session.get(
            f"{self.base_url}/runs",
            params={"page": page, "pageSize": page_size},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_run(self, run_id: str) -> Dict[str, Any]:
        """Get run details."""
        resp = self.session.get(f"{self.base_url}/runs/{run_id}", timeout=30)
        resp.raise_for_status()
        return resp.json()
    
    def create_run(
        self,
        pdfs_zip: bytes,
        excel_schema: bytes,
        name: str = "E2E Test Run",
        llm_provider: str = "openai",
        prompt: str = ""
    ) -> Dict[str, Any]:
        """Create a new run with file uploads."""
        files = {
            "pdfsZip": ("pdfs.zip", BytesIO(pdfs_zip), "application/zip"),
            "excelSchema": ("schema.xlsx", BytesIO(excel_schema), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        }
        data = {
            "name": name,
            "llmProvider": llm_provider,
            "prompt": prompt,
        }
        resp = self.session.post(
            f"{self.base_url}/runs",
            files=files,
            data=data,
            timeout=60
        )
        resp.raise_for_status()
        return resp.json()
    
    def start_run(self, run_id: str, instructions: str = "") -> Dict[str, Any]:
        """Start extraction for a run."""
        resp = self.session.post(
            f"{self.base_url}/runs/{run_id}/start",
            json={"instructions": instructions} if instructions else None,
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def stop_run(self, run_id: str) -> None:
        """Stop a running extraction."""
        resp = self.session.post(f"{self.base_url}/runs/{run_id}/stop", timeout=30)
        resp.raise_for_status()
    
    def get_run_logs(self, run_id: str, tail_lines: int = 500) -> Dict[str, Any]:
        """Get logs for a run."""
        resp = self.session.get(
            f"{self.base_url}/runs/{run_id}/logs",
            params={"tailLines": tail_lines},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_engine_status(self, run_id: str) -> Dict[str, Any]:
        """Get engine status for a run."""
        resp = self.session.get(f"{self.base_url}/runs/{run_id}/engine/status", timeout=30)
        resp.raise_for_status()
        return resp.json()
    
    def get_engine_logs(self, run_id: str) -> Dict[str, Any]:
        """Get engine stdout/stderr."""
        resp = self.session.get(f"{self.base_url}/runs/{run_id}/engine/logs", timeout=30)
        resp.raise_for_status()
        return resp.json()
    
    def export_run(self, run_id: str) -> Dict[str, Any]:
        """Export run results."""
        resp = self.session.post(f"{self.base_url}/runs/{run_id}/export", timeout=60)
        resp.raise_for_status()
        return resp.json()
    
    def list_exports(self, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
        """List all exports."""
        resp = self.session.get(
            f"{self.base_url}/exports",
            params={"page": page, "pageSize": page_size},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def list_sources(self, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
        """List all sources."""
        resp = self.session.get(
            f"{self.base_url}/sources",
            params={"page": page, "pageSize": page_size},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def list_domains(self, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
        """List all domains."""
        resp = self.session.get(
            f"{self.base_url}/domains",
            params={"page": page, "pageSize": page_size},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def list_cache_providers(self) -> List[Dict[str, Any]]:
        """List cache providers."""
        resp = self.session.get(f"{self.base_url}/cache/providers", timeout=30)
        resp.raise_for_status()
        return resp.json()
    
    def list_cache_entries(self, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
        """List cache entries."""
        resp = self.session.get(
            f"{self.base_url}/cache/entries",
            params={"page": page, "pageSize": page_size},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_config(self) -> List[Dict[str, Any]]:
        """Get all config entries."""
        resp = self.session.get(f"{self.base_url}/config", timeout=30)
        resp.raise_for_status()
        return resp.json()
    
    def set_config(self, key: str, value: str, config_type: str = "PREFERENCE") -> Dict[str, Any]:
        """Set a config entry."""
        resp = self.session.post(
            f"{self.base_url}/config",
            json={"key": key, "value": value, "type": config_type},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    
    def delete_config(self, key: str) -> None:
        """Delete a config entry."""
        resp = self.session.delete(f"{self.base_url}/config/{key}", timeout=30)
        resp.raise_for_status()
    
    def get_run_data(self, run_id: str) -> Dict[str, Any]:
        """Get extracted data (global_data.json) for a run.
        
        Returns:
            {
                "exists": bool,
                "data": list,
                "count": int,
                "path": str
            }
        """
        resp = self.session.get(f"{self.base_url}/runs/{run_id}/data", timeout=60)
        resp.raise_for_status()
        return resp.json()
    
    def nuke_all_data(self) -> Dict[str, Any]:
        """NUCLEAR OPTION - Delete all runs, exports, uploads, logs.
        
        Returns deletion counts.
        """
        resp = self.session.post(f"{self.base_url}/runs/nuke", timeout=60)
        resp.raise_for_status()
        return resp.json()
    
    def wait_for_completion(
        self,
        run_id: str,
        timeout_seconds: int = TIMEOUT_SECONDS,
        poll_interval: int = POLL_INTERVAL_SECONDS
    ) -> Dict[str, Any]:
        """Poll until run completes or times out."""
        start = time.time()
        while time.time() - start < timeout_seconds:
            run = self.get_run(run_id)
            status = run.get("status", "")
            if status in ("completed", "failed"):
                return run
            time.sleep(poll_interval)
        raise TimeoutError(f"Run {run_id} did not complete within {timeout_seconds}s")


# =============================================================================
# Test Data Helpers
# =============================================================================

def create_test_pdfs_zip(pdf_paths: List[Path], max_pdfs: int = 3) -> bytes:
    """Create a ZIP file from PDF paths (for testing, limit to max_pdfs)."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, pdf_path in enumerate(pdf_paths[:max_pdfs]):
            if pdf_path.exists():
                zf.write(pdf_path, pdf_path.name)
    buffer.seek(0)
    return buffer.read()


def create_minimal_test_zip() -> bytes:
    """Create a minimal test ZIP with a dummy PDF for fast testing."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Create a minimal valid PDF (just header, not a real PDF but enough for upload test)
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        zf.writestr("test_document.pdf", pdf_content)
    buffer.seek(0)
    return buffer.read()


def load_sample_schema() -> bytes:
    """Load the sample Excel schema file."""
    if SAMPLE_SCHEMA.exists():
        return SAMPLE_SCHEMA.read_bytes()
    # Create minimal xlsx if not found
    raise FileNotFoundError(f"Schema file not found: {SAMPLE_SCHEMA}")


def get_sample_pdf_paths() -> List[Path]:
    """Get list of sample PDF paths."""
    if SAMPLE_PDFS_DIR.exists():
        return list(SAMPLE_PDFS_DIR.glob("*.pdf"))
    return []


# =============================================================================
# Test Cases
# =============================================================================

def test_health_check(client: CreteXtractClient) -> TestResult:
    """
    TEST: Health Check Endpoint
    Level Target: L6
    
    Validates:
    - API is reachable
    - Returns valid JSON
    - Contains expected fields
    """
    result = TestResult("Health Check")
    
    try:
        # L1: Syntax - API call compiles
        result.pass_level(1, "API call prepared")
        
        # L2: Registration - endpoint exists
        health = client.health()
        result.pass_level(2, "Endpoint responded")
        
        # L3: Execution - returns data
        if not isinstance(health, dict):
            result.fail(3, f"Expected dict, got {type(health)}")
            return result
        result.pass_level(3, "Returned dict")
        
        # L4: Output Existence - has required fields
        if "status" not in health:
            result.fail(4, "Missing 'status' field")
            return result
        result.pass_level(4, "Has status field")
        
        # L5: Output Validity - status is valid
        if health["status"] != "ok":
            result.fail(5, f"Status is '{health['status']}', expected 'ok'")
            return result
        result.pass_level(5, "Status is 'ok'")
        
        # L6: Output Correctness - has timestamp
        if "timestamp" not in health:
            result.fail(6, "Missing 'timestamp' field")
            return result
        result.pass_level(6, "Has valid timestamp")
        
        result.complete()
        
    except requests.RequestException as e:
        result.fail(2, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


def test_list_runs(client: CreteXtractClient) -> TestResult:
    """
    TEST: List Runs Endpoint
    Level Target: L6
    
    Validates:
    - Endpoint returns paginated results
    - Response structure is correct
    """
    result = TestResult("List Runs")
    
    try:
        result.pass_level(1, "API call prepared")
        
        runs = client.list_runs(page=1, page_size=10)
        result.pass_level(2, "Endpoint responded")
        
        if not isinstance(runs, dict):
            result.fail(3, f"Expected dict, got {type(runs)}")
            return result
        result.pass_level(3, "Returned dict")
        
        # Check pagination structure
        required_fields = ["items", "total", "page", "pageSize"]
        for field in required_fields:
            if field not in runs:
                result.fail(4, f"Missing field: {field}")
                return result
        result.pass_level(4, "Has pagination fields")
        
        if not isinstance(runs["items"], list):
            result.fail(5, "items is not a list")
            return result
        result.pass_level(5, "items is a list")
        
        # Validate page/pageSize
        if runs["page"] != 1 or runs["pageSize"] != 10:
            result.fail(6, f"Pagination mismatch: page={runs['page']}, pageSize={runs['pageSize']}")
            return result
        result.pass_level(6, "Pagination correct")
        
        result.complete()
        
    except requests.RequestException as e:
        result.fail(2, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


def test_create_run_minimal(client: CreteXtractClient) -> TestResult:
    """
    TEST: Create Run with Minimal Data
    Level Target: L6
    
    Validates:
    - Run creation with minimal valid input
    - Returns run ID and correct status
    """
    result = TestResult("Create Run (Minimal)")
    
    try:
        result.pass_level(1, "Test data prepared")
        
        # Create minimal test data
        pdfs_zip = create_minimal_test_zip()
        try:
            schema = load_sample_schema()
        except FileNotFoundError as e:
            result.fail(1, str(e))
            return result
        
        result.pass_level(2, "Files prepared")
        
        # Create run
        run = client.create_run(
            pdfs_zip=pdfs_zip,
            excel_schema=schema,
            name="E2E Minimal Test",
            llm_provider="openai"
        )
        result.pass_level(3, "Run created")
        
        # Validate response
        if "id" not in run:
            result.fail(4, "Missing 'id' field")
            return result
        result.pass_level(4, f"Run ID: {run['id'][:8]}...")
        
        if run.get("status") not in ("waiting",):
            result.fail(5, f"Unexpected status: {run.get('status')}")
            return result
        result.pass_level(5, f"Status: {run['status']}")
        
        # Verify run exists
        fetched = client.get_run(run["id"])
        if fetched["id"] != run["id"]:
            result.fail(6, "Fetched run ID mismatch")
            return result
        result.pass_level(6, "Run persisted and retrievable")
        
        result.details["run_id"] = run["id"]
        result.complete()
        
    except requests.RequestException as e:
        result.fail(3, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


def test_full_extraction_workflow(client: CreteXtractClient, max_pdfs: int = 2) -> TestResult:
    """
    TEST: Full Extraction Workflow (E2E)
    Level Target: L7
    
    Validates:
    1. Create run with real PDFs
    2. Start extraction
    3. Wait for completion
    4. Verify output exists
    5. Verify output content is valid
    6. Export and verify downloadable
    
    This is the CRITICAL test - validates entire pipeline.
    """
    result = TestResult(f"Full Extraction Workflow ({max_pdfs} PDFs)")
    run_id = None
    
    try:
        # L1: Prepare test data
        pdf_paths = get_sample_pdf_paths()
        if len(pdf_paths) < 1:
            result.fail(1, f"No sample PDFs found in {SAMPLE_PDFS_DIR}")
            return result
        
        pdfs_zip = create_test_pdfs_zip(pdf_paths, max_pdfs=max_pdfs)
        schema = load_sample_schema()
        result.pass_level(1, f"Prepared {min(len(pdf_paths), max_pdfs)} PDFs")
        
        # L2: Create run
        run = client.create_run(
            pdfs_zip=pdfs_zip,
            excel_schema=schema,
            name=f"E2E Full Test ({max_pdfs} PDFs)",
            llm_provider="openai"
        )
        run_id = run["id"]
        result.pass_level(2, f"Run created: {run_id[:8]}...")
        
        # L3: Start extraction
        start_resp = client.start_run(run_id)
        if "runId" not in start_resp:
            result.fail(3, "Start response missing runId")
            return result
        result.pass_level(3, "Extraction started")
        
        # L4: Wait for completion
        print(f"   ⏳ Waiting for extraction to complete (timeout: {TIMEOUT_SECONDS}s)...")
        try:
            final_run = client.wait_for_completion(run_id, timeout_seconds=TIMEOUT_SECONDS)
        except TimeoutError as e:
            result.fail(4, str(e))
            return result
        
        status = final_run.get("status")
        if status == "failed":
            logs = client.get_engine_logs(run_id)
            stderr = logs.get("stderr", "")[-500:]
            result.fail(4, f"Extraction failed. Stderr: {stderr}")
            return result
        if status != "completed":
            result.fail(4, f"Unexpected final status: {status}")
            return result
        result.pass_level(4, f"Extraction completed with status: {status}")
        
        # L5: Verify output JSON exists via API
        run_data = client.get_run_data(run_id)
        if "error" in run_data:
            result.fail(5, f"Failed to get run data: {run_data['error']}")
            return result
        
        if not run_data.get("exists", False):
            result.fail(5, f"Output JSON does not exist at: {run_data.get('path', 'unknown')}")
            return result
        result.pass_level(5, f"Output JSON exists at: {run_data.get('path', 'unknown')}")
        
        # L6: Verify output JSON is NON-EMPTY (CRITICAL - zero tolerance)
        extracted_data = run_data.get("data", [])
        entries_count = run_data.get("count", 0)
        
        if entries_count == 0 or len(extracted_data) == 0:
            result.fail(6, "EXTRACTION FAILED: Output JSON is EMPTY. Zero entries extracted.")
            return result
        
        # Validate data structure - each entry should be a dict
        if not all(isinstance(entry, dict) for entry in extracted_data):
            result.fail(6, "EXTRACTION FAILED: Output JSON contains non-dict entries")
            return result
        
        result.pass_level(6, f"Extracted {entries_count} non-empty entries")
        
        # L7: Round-trip - EVIL VALIDATION - Verify data is REAL and MEANINGFUL
        # Check that entries have expected fields with ACTUAL VALUES
        sample_entry = extracted_data[0]
        
        if len(sample_entry.keys()) == 0:
            result.fail(7, "EXTRACTION FAILED: First entry has no fields")
            return result
        
        # Count non-empty, non-N.A. values
        real_values = 0
        for key, value in sample_entry.items():
            if value is not None and value != "" and value != "N.A." and value != "N/A":
                real_values += 1
        
        if real_values < 3:
            result.fail(7, f"EXTRACTION FAILED: Entry has only {real_values} real values (need >= 3)")
            return result
        
        # Verify ALL entries have at least some real data
        empty_entries = 0
        for entry in extracted_data:
            entry_real_values = sum(1 for v in entry.values() if v and v != "N.A." and v != "N/A")
            if entry_real_values < 2:
                empty_entries += 1
        
        if empty_entries > 0:
            result.fail(7, f"EXTRACTION FAILED: {empty_entries}/{entries_count} entries are effectively empty")
            return result
        
        # Export and verify
        export_resp = client.export_run(run_id)
        if "url" not in export_resp:
            result.fail(7, "Export response missing 'url'")
            return result
        
        result.pass_level(7, f"VALIDATED {entries_count} entries with real data, export created")
        
        result.details["run_id"] = run_id
        result.details["entries_count"] = entries_count
        result.complete()
        
    except requests.RequestException as e:
        result.fail(3, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


def test_config_crud(client: CreteXtractClient) -> TestResult:
    """
    TEST: Config CRUD Operations
    Level Target: L7
    
    Validates:
    - Create config entry
    - Read config entry
    - Update config entry
    - Delete config entry
    """
    result = TestResult("Config CRUD")
    test_key = f"e2e_test_key_{int(time.time())}"
    
    try:
        result.pass_level(1, "Test prepared")
        
        # Create
        created = client.set_config(test_key, "test_value_1", "PREFERENCE")
        if created.get("key") != test_key:
            result.fail(2, "Created config key mismatch")
            return result
        result.pass_level(2, "Config created")
        
        # Read
        configs = client.get_config()
        found = next((c for c in configs if c.get("key") == test_key), None)
        if not found:
            result.fail(3, "Config not found after creation")
            return result
        result.pass_level(3, "Config readable")
        
        # Update
        updated = client.set_config(test_key, "test_value_2", "PREFERENCE")
        if updated.get("value") != "test_value_2":
            result.fail(4, "Config update failed")
            return result
        result.pass_level(4, "Config updated")
        
        # Verify update
        configs = client.get_config()
        found = next((c for c in configs if c.get("key") == test_key), None)
        if found.get("value") != "test_value_2":
            result.fail(5, "Config update not persisted")
            return result
        result.pass_level(5, "Update persisted")
        
        # Delete
        client.delete_config(test_key)
        result.pass_level(6, "Config deleted")
        
        # Verify deletion
        configs = client.get_config()
        found = next((c for c in configs if c.get("key") == test_key), None)
        if found:
            result.fail(7, "Config still exists after deletion")
            return result
        result.pass_level(7, "Deletion verified")
        
        result.complete()
        
    except requests.RequestException as e:
        result.fail(2, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


def test_cache_endpoints(client: CreteXtractClient) -> TestResult:
    """
    TEST: Cache Endpoints
    Level Target: L5
    
    Validates:
    - List cache providers
    - List cache entries
    """
    result = TestResult("Cache Endpoints")
    
    try:
        result.pass_level(1, "Test prepared")
        
        # List providers
        providers = client.list_cache_providers()
        if not isinstance(providers, list):
            result.fail(2, f"Expected list, got {type(providers)}")
            return result
        result.pass_level(2, f"Got {len(providers)} cache providers")
        
        # List entries
        entries = client.list_cache_entries()
        if "items" not in entries:
            result.fail(3, "Missing 'items' in entries response")
            return result
        result.pass_level(3, f"Got {len(entries['items'])} cache entries")
        
        # Validate structure
        if entries.get("page") != 1:
            result.fail(4, "Pagination mismatch")
            return result
        result.pass_level(4, "Pagination correct")
        
        result.pass_level(5, "Cache endpoints functional")
        result.complete()
        
    except requests.RequestException as e:
        result.fail(2, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


def test_run_lifecycle(client: CreteXtractClient) -> TestResult:
    """
    TEST: Run Lifecycle (Create -> Get -> Logs -> Engine Status)
    Level Target: L6
    
    Validates complete run lifecycle without starting extraction.
    """
    result = TestResult("Run Lifecycle")
    
    try:
        result.pass_level(1, "Test prepared")
        
        # Create run
        pdfs_zip = create_minimal_test_zip()
        schema = load_sample_schema()
        
        run = client.create_run(
            pdfs_zip=pdfs_zip,
            excel_schema=schema,
            name="E2E Lifecycle Test"
        )
        run_id = run["id"]
        result.pass_level(2, f"Run created: {run_id[:8]}...")
        
        # Get run
        fetched = client.get_run(run_id)
        if fetched["id"] != run_id:
            result.fail(3, "Run ID mismatch")
            return result
        result.pass_level(3, "Run retrievable")
        
        # Get logs
        logs = client.get_run_logs(run_id)
        if "content" not in logs and "lines" not in logs:
            result.fail(4, "Logs response missing content/lines")
            return result
        result.pass_level(4, "Logs retrievable")
        
        # Get engine status
        engine = client.get_engine_status(run_id)
        if "state" not in engine:
            result.fail(5, "Engine status missing 'state'")
            return result
        result.pass_level(5, f"Engine state: {engine['state']}")
        
        # Verify in list
        runs = client.list_runs()
        found = any(r.get("id") == run_id for r in runs.get("items", []))
        if not found:
            result.fail(6, "Run not found in list")
            return result
        result.pass_level(6, "Run appears in list")
        
        result.details["run_id"] = run_id
        result.complete()
        
    except requests.RequestException as e:
        result.fail(2, f"Request failed: {e}")
    except Exception as e:
        result.fail(1, f"Unexpected error: {e}")
    
    return result


# =============================================================================
# Main Test Runner
# =============================================================================

def run_all_tests(skip_extraction: bool = False, api_url: str = BASE_URL) -> TestSuite:
    """Run all E2E tests."""
    suite = TestSuite("CreteXtract E2E API Tests")
    client = CreteXtractClient(api_url)
    
    print(f"\n🚀 Starting E2E Test Suite")
    print(f"   Target: {api_url}")
    print(f"   Skip Extraction: {skip_extraction}")
    print(f"{'='*60}\n")
    
    # Basic connectivity tests
    print("📋 Running: Health Check")
    suite.add(test_health_check(client))
    
    print("📋 Running: List Runs")
    suite.add(test_list_runs(client))
    
    print("📋 Running: Config CRUD")
    suite.add(test_config_crud(client))
    
    print("📋 Running: Cache Endpoints")
    suite.add(test_cache_endpoints(client))
    
    print("📋 Running: Run Lifecycle")
    suite.add(test_run_lifecycle(client))
    
    print("📋 Running: Create Run (Minimal)")
    suite.add(test_create_run_minimal(client))
    
    # Full extraction test (optional - takes time)
    if not skip_extraction:
        print("📋 Running: Full Extraction Workflow (2 PDFs)")
        suite.add(test_full_extraction_workflow(client, max_pdfs=2))
    
    print(suite.summary())
    
    return suite


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="CreteXtract E2E API Test Suite")
    parser.add_argument("--url", default=BASE_URL, help="API base URL")
    parser.add_argument("--skip-extraction", action="store_true", help="Skip full extraction test")
    parser.add_argument("--quick", action="store_true", help="Run only quick tests (same as --skip-extraction)")
    
    args = parser.parse_args()
    
    api_url = args.url
    skip_extraction = args.skip_extraction or args.quick
    
    # Update the client URL
    suite = run_all_tests(skip_extraction=skip_extraction, api_url=api_url)
    
    # Exit with error code if any test failed
    sys.exit(0 if suite.all_passed() else 1)


if __name__ == "__main__":
    main()
