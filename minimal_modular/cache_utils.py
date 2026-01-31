"""Caching utilities for extraction pipeline.

Caches:
- Surya PDF conversion results
- GPT extraction responses
- Schema inference results

Cache files are stored in ./cache/ directory with hash-based filenames.
"""
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Optional

CACHE_DIR = Path(__file__).parent / "cache"

# User context for sandboxed caching
_current_user_id: Optional[str] = None

# Granular cache control flags (read/write per API class)
_cache_flags = {
    "surya_read": True,
    "surya_write": True,
    "llm_read": True,
    "llm_write": True,
    "schema_read": True,
    "schema_write": True,
    "validation_read": True,
    "validation_write": True,
}

def set_cache_flags(
    surya_read: bool = True, surya_write: bool = True,
    llm_read: bool = True, llm_write: bool = True,
    schema_read: bool = True, schema_write: bool = True,
    validation_read: bool = True, validation_write: bool = True
) -> None:
    """Set granular cache control flags."""
    global _cache_flags
    _cache_flags = {
        "surya_read": surya_read,
        "surya_write": surya_write,
        "llm_read": llm_read,
        "llm_write": llm_write,
        "schema_read": schema_read,
        "schema_write": schema_write,
        "validation_read": validation_read,
        "validation_write": validation_write,
    }

def get_cache_flags() -> dict:
    """Get current cache control flags."""
    return _cache_flags.copy()

def can_read_cache(cache_type: str) -> bool:
    """Check if reading from a specific cache type is enabled."""
    return _cache_flags.get(f"{cache_type}_read", True)

def can_write_cache(cache_type: str) -> bool:
    """Check if writing to a specific cache type is enabled."""
    return _cache_flags.get(f"{cache_type}_write", True)

def set_cache_user(user_id: Optional[str]) -> None:
    """Set current user for cache sandboxing."""
    global _current_user_id
    _current_user_id = user_id

def get_cache_user() -> Optional[str]:
    """Get current user for cache sandboxing."""
    return _current_user_id

def _get_user_prefix() -> str:
    """Get user prefix for cache keys."""
    if _current_user_id:
        return _current_user_id[:8]
    return "global"


def _ensure_cache_dir(subdir: str = "") -> Path:
    """Ensure cache directory exists and return path."""
    cache_path = CACHE_DIR / subdir if subdir else CACHE_DIR
    cache_path.mkdir(parents=True, exist_ok=True)
    return cache_path


def _file_hash(filepath: str, include_user: bool = True) -> str:
    """Compute hash of file for cache key."""
    h = hashlib.sha256()
    # Include user prefix for sandboxing
    if include_user:
        h.update(_get_user_prefix().encode('utf-8'))
    h.update(filepath.encode('utf-8'))
    # Include file size and mtime for invalidation
    try:
        stat = os.stat(filepath)
        h.update(str(stat.st_size).encode())
        h.update(str(int(stat.st_mtime)).encode())
    except:
        pass
    return h.hexdigest()[:16]


def _file_bytes_hash(filepath: str, include_user: bool = True) -> str:
    """Compute hash of file bytes for cache key.

    This makes caching stable across different run directories (same content => same key).
    """
    h = hashlib.sha256()
    if include_user:
        h.update(_get_user_prefix().encode('utf-8'))
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()[:16]


def _content_hash(content: str) -> str:
    """Compute hash of content string."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]


# --- Surya PDF Cache ---

def get_surya_cache(pdf_path: str) -> Optional[str]:
    """Get cached Surya conversion result for PDF."""
    if not can_read_cache("surya"):
        return None
    cache_path = _ensure_cache_dir("surya")
    key = _file_bytes_hash(pdf_path)
    cache_file = cache_path / f"{key}.txt"
    
    if cache_file.exists():
        try:
            content = cache_file.read_text(encoding='utf-8')
            print(f"      [CACHE HIT] Surya: {os.path.basename(pdf_path)}")
            return content
        except:
            pass
    return None


def set_surya_cache(pdf_path: str, content: str) -> None:
    """Cache Surya conversion result for PDF."""
    if not can_write_cache("surya"):
        return
    cache_path = _ensure_cache_dir("surya")
    key = _file_bytes_hash(pdf_path)
    cache_file = cache_path / f"{key}.txt"
    
    try:
        cache_file.write_text(content, encoding='utf-8')
        # Also save metadata
        meta_file = cache_path / f"{key}.meta.json"
        meta = {
            "pdf_path": pdf_path,
            "pdf_name": os.path.basename(pdf_path),
            "content_length": len(content),
        }
        meta_file.write_text(json.dumps(meta, indent=2), encoding='utf-8')
    except Exception as e:
        print(f"      [CACHE WARN] Failed to cache Surya result: {e}")


# --- GPT Response Cache ---

def _gpt_cache_key(system_prompt: str, user_prompt: str, model: str) -> str:
    """Generate cache key for GPT request."""
    h = hashlib.sha256()
    # Include user prefix for sandboxing
    h.update(_get_user_prefix().encode('utf-8'))
    h.update(model.encode('utf-8'))
    h.update(system_prompt.encode('utf-8'))
    h.update(user_prompt.encode('utf-8'))
    return h.hexdigest()[:24]


def get_gpt_cache(system_prompt: str, user_prompt: str, model: str) -> Optional[dict]:
    """Get cached GPT response."""
    if not can_read_cache("llm"):
        return None
    cache_path = _ensure_cache_dir("gpt")
    key = _gpt_cache_key(system_prompt, user_prompt, model)
    cache_file = cache_path / f"{key}.json"
    
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding='utf-8'))
            print(f"      [CACHE HIT] GPT response")
            return data.get("response")
        except:
            pass
    return None


def set_gpt_cache(system_prompt: str, user_prompt: str, model: str, response: dict) -> None:
    """Cache GPT response."""
    if not can_write_cache("llm"):
        return
    cache_path = _ensure_cache_dir("gpt")
    key = _gpt_cache_key(system_prompt, user_prompt, model)
    cache_file = cache_path / f"{key}.json"
    
    try:
        data = {
            "model": model,
            "system_prompt_hash": _content_hash(system_prompt),
            "user_prompt_length": len(user_prompt),
            "response": response,
        }
        cache_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    except Exception as e:
        print(f"      [CACHE WARN] Failed to cache GPT response: {e}")


# --- Schema Cache ---

def get_schema_cache(excel_path: str) -> Optional[dict]:
    """Get cached schema for Excel file."""
    if not can_read_cache("schema"):
        return None
    cache_path = _ensure_cache_dir("schema")
    key = _file_hash(excel_path)
    cache_file = cache_path / f"{key}.json"
    
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding='utf-8'))
            print(f"[CACHE HIT] Schema: {os.path.basename(excel_path)}")
            return data.get("schema")
        except:
            pass
    return None


def set_schema_cache(excel_path: str, schema: dict) -> None:
    """Cache schema for Excel file."""
    if not can_write_cache("schema"):
        return
    cache_path = _ensure_cache_dir("schema")
    key = _file_hash(excel_path)
    cache_file = cache_path / f"{key}.json"
    
    try:
        data = {
            "excel_path": excel_path,
            "excel_name": os.path.basename(excel_path),
            "schema": schema,
        }
        cache_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    except Exception as e:
        print(f"[CACHE WARN] Failed to cache schema: {e}")


# --- Cache Management ---

def clear_cache(subdir: str = "") -> int:
    """Clear cache files. Returns count of files deleted."""
    cache_path = CACHE_DIR / subdir if subdir else CACHE_DIR
    if not cache_path.exists():
        return 0
    
    count = 0
    for f in cache_path.glob("*"):
        if f.is_file():
            try:
                f.unlink()
                count += 1
            except:
                pass
    return count


def get_cache_stats() -> dict:
    """Get cache statistics."""
    stats = {}
    for subdir in ["surya", "gpt", "schema"]:
        path = CACHE_DIR / subdir
        if path.exists():
            files = list(path.glob("*"))
            stats[subdir] = {
                "count": len([f for f in files if not f.name.endswith('.meta.json')]),
                "size_mb": round(sum(f.stat().st_size for f in files if f.is_file()) / 1024 / 1024, 2)
            }
        else:
            stats[subdir] = {"count": 0, "size_mb": 0}
    return stats
