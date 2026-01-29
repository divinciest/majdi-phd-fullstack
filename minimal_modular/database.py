"""
Database configuration and session management for SQLAlchemy ORM.
Includes migration helper for existing app.db data.
"""

import os
import json
import uuid
import sqlite3
from datetime import datetime, timezone
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from models import Base, Run, RunInput, RunOutput, RunStatusHistory, User, RunStatus, InputType

# Database path (same as original for backward compatibility)
DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Create engine with connection pooling disabled for SQLite thread safety
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False  # Set to True for SQL debugging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Get database session. Use as context manager or Flask dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Context manager for database session."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """Initialize database - create all tables."""
    Base.metadata.create_all(bind=engine)
    
    # Ensure system user exists
    with get_db_session() as db:
        system_user = db.query(User).filter(User.username == "system").first()
        if not system_user:
            system_user = User(
                id=str(uuid.uuid4()),
                username="system",
                email=None
            )
            db.add(system_user)
    
    # Check if migration needed (old tables exist but new ones are empty)
    migrate_legacy_data()


def migrate_legacy_data():
    """Migrate data from legacy SQLite schema to new ORM schema."""
    # Check if legacy runs table has data and new tables are empty
    with get_db_session() as db:
        # Check if we have any runs already
        run_count = db.query(Run).count()
        if run_count > 0:
            # Already migrated or fresh start
            return
    
    # Check for legacy data using raw SQLite
    if not os.path.exists(DB_PATH):
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Check if legacy runs table exists with old schema
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
        if not cur.fetchone():
            conn.close()
            return
        
        # Check for legacy column (start_date instead of created_at)
        cur.execute("PRAGMA table_info(runs)")
        columns = {row['name'] for row in cur.fetchall()}
        
        if 'start_date' not in columns:
            # Not legacy schema
            conn.close()
            return
        
        print("[DB Migration] Found legacy runs table, migrating...")
        
        # Fetch legacy runs
        cur.execute("SELECT * FROM runs")
        legacy_runs = cur.fetchall()
        
        conn.close()
        
        if not legacy_runs:
            return
        
        # Migrate to new schema
        with get_db_session() as db:
            system_user = db.query(User).filter(User.username == "system").first()
            
            for row in legacy_runs:
                row_dict = dict(row)
                
                # Map legacy fields to new schema
                run = Run(
                    id=row_dict.get('id'),
                    name=row_dict.get('name', 'Untitled Run'),
                    status=RunStatus(row_dict.get('status', 'PENDING')),
                    owner_id=system_user.id if system_user else None,
                    created_at=datetime.fromisoformat(row_dict.get('start_date', datetime.now(timezone.utc).isoformat()).replace('Z', '+00:00')) if row_dict.get('start_date') else datetime.now(timezone.utc),
                    llm_provider=row_dict.get('llm_provider'),
                    prompt=row_dict.get('prompt'),
                    pdfs_dir=row_dict.get('pdfs_dir'),
                    excel_path=row_dict.get('excel_path'),
                    output_dir=row_dict.get('output_dir'),
                    sources_count=row_dict.get('sources' + '_count', 0),
                    data_entries_count=row_dict.get('data_entries_count', 0),
                    search_methods=row_dict.get('search_methods'),
                    search_queries=row_dict.get('search_queries'),
                    links=row_dict.get('links'),
                    table_file_url=row_dict.get('table_file_url'),
                    per_link_prompt=row_dict.get('per_link_prompt'),
                )
                
                db.add(run)
                
                # Create RunInput records from paths
                if row_dict.get('pdfs_dir') and os.path.isdir(row_dict['pdfs_dir']):
                    # Count PDFs and create input record
                    pdf_files = [f for f in os.listdir(row_dict['pdfs_dir']) if f.lower().endswith('.pdf')]
                    run_input = RunInput(
                        run_id=run.id,
                        input_type=InputType.ZIP,
                        file_path=row_dict['pdfs_dir'],
                        file_name=f"{len(pdf_files)} PDF files",
                        metadata_json=json.dumps({"pdf_count": len(pdf_files)})
                    )
                    db.add(run_input)
                
                if row_dict.get('excel_path') and os.path.isfile(row_dict['excel_path']):
                    run_input = RunInput(
                        run_id=run.id,
                        input_type=InputType.EXCEL,
                        file_path=row_dict['excel_path'],
                        file_name=os.path.basename(row_dict['excel_path']),
                        file_size_bytes=os.path.getsize(row_dict['excel_path'])
                    )
                    db.add(run_input)
                
                # Create initial status history
                status_history = RunStatusHistory(
                    run_id=run.id,
                    old_status=None,
                    new_status=run.status,
                    changed_by_id=system_user.id if system_user else None,
                    reason="Migrated from legacy schema"
                )
                db.add(status_history)
        
        print(f"[DB Migration] Migrated {len(legacy_runs)} runs successfully")
        
    except Exception as e:
        print(f"[DB Migration] Warning: Could not migrate legacy data: {e}")


def drop_all_tables():
    """Drop all tables (use with caution!)."""
    Base.metadata.drop_all(bind=engine)
