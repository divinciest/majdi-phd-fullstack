"""
SQLAlchemy ORM Models for Run Management
Full tracing of inputs, outputs, ownership, and status
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Column, String, Integer, Text, DateTime, ForeignKey, Enum, Boolean, JSON
)
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column
import enum


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class RunStatus(enum.Enum):
    """Run status enum."""
    PENDING = "PENDING"
    INITIALIZING = "INITIALIZING"
    PROCESSING = "PROCESSING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ENGINE_CRASHED = "ENGINE_CRASHED"


class InputType(enum.Enum):
    """Run input types."""
    PDF = "PDF"
    EXCEL = "EXCEL"
    PROMPT = "PROMPT"
    CONFIG = "CONFIG"
    ZIP = "ZIP"


class OutputType(enum.Enum):
    """Run output types."""
    JSON = "JSON"
    EXCEL = "EXCEL"
    LOG = "LOG"
    CSV = "CSV"


class User(Base):
    """User model for ownership tracking."""
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    runs: Mapped[List["Run"]] = relationship("Run", back_populates="owner")
    status_changes: Mapped[List["RunStatusHistory"]] = relationship("RunStatusHistory", back_populates="changed_by")


class Run(Base):
    """Run model with full tracing."""
    __tablename__ = "runs"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Untitled Run")
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.PENDING)
    
    # Ownership
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Configuration
    llm_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Paths (for backward compatibility)
    pdfs_dir: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    excel_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_dir: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Counts
    sources_count: Mapped[int] = mapped_column(Integer, default=0)
    data_entries_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Legacy fields (JSON stored as text for backward compatibility)
    search_methods: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    search_queries: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    links: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    table_file_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    per_link_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Relationships
    owner: Mapped[Optional["User"]] = relationship("User", back_populates="runs")
    inputs: Mapped[List["RunInput"]] = relationship("RunInput", back_populates="run", cascade="all, delete-orphan")
    outputs: Mapped[List["RunOutput"]] = relationship("RunOutput", back_populates="run", cascade="all, delete-orphan")
    status_history: Mapped[List["RunStatusHistory"]] = relationship("RunStatusHistory", back_populates="run", cascade="all, delete-orphan", order_by="RunStatusHistory.changed_at")
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value if self.status else None,
            "ownerId": self.owner_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "llmProvider": self.llm_provider,
            "prompt": self.prompt,
            "pdfsDir": self.pdfs_dir,
            "excelPath": self.excel_path,
            "outputDir": self.output_dir,
            "sourcesCount": self.sources_count,
            "dataEntriesCount": self.data_entries_count,
            "errorMessage": self.error_message,
            "searchMethods": self.search_methods,
            "searchQueries": self.search_queries,
            "links": self.links,
            "tableFileUrl": self.table_file_url,
            "perLinkPrompt": self.per_link_prompt,
        }


class RunInput(Base):
    """Track all inputs to a run."""
    __tablename__ = "run_inputs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id"), nullable=False)
    
    input_type: Mapped[InputType] = mapped_column(Enum(InputType), nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # SHA256
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    run: Mapped["Run"] = relationship("Run", back_populates="inputs")
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "runId": self.run_id,
            "inputType": self.input_type.value if self.input_type else None,
            "filePath": self.file_path,
            "fileName": self.file_name,
            "contentHash": self.content_hash,
            "fileSizeBytes": self.file_size_bytes,
            "metadataJson": self.metadata_json,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
    
    @staticmethod
    def compute_file_hash(file_path: str) -> str:
        """Compute SHA256 hash of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()


class RunOutput(Base):
    """Track all outputs from a run."""
    __tablename__ = "run_outputs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id"), nullable=False)
    
    output_type: Mapped[OutputType] = mapped_column(Enum(OutputType), nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    entries_count: Mapped[int] = mapped_column(Integer, default=0)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    run: Mapped["Run"] = relationship("Run", back_populates="outputs")
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "runId": self.run_id,
            "outputType": self.output_type.value if self.output_type else None,
            "filePath": self.file_path,
            "fileName": self.file_name,
            "entriesCount": self.entries_count,
            "fileSizeBytes": self.file_size_bytes,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class RunStatusHistory(Base):
    """Track status changes for a run."""
    __tablename__ = "run_status_history"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id"), nullable=False)
    
    old_status: Mapped[Optional[RunStatus]] = mapped_column(Enum(RunStatus), nullable=True)
    new_status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), nullable=False)
    
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    changed_by_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Relationships
    run: Mapped["Run"] = relationship("Run", back_populates="status_history")
    changed_by: Mapped[Optional["User"]] = relationship("User", back_populates="status_changes")
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "runId": self.run_id,
            "oldStatus": self.old_status.value if self.old_status else None,
            "newStatus": self.new_status.value if self.new_status else None,
            "changedAt": self.changed_at.isoformat() if self.changed_at else None,
            "changedById": self.changed_by_id,
            "reason": self.reason,
        }
