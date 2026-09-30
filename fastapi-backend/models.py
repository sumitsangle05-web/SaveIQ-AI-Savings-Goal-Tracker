from datetime import datetime, date
from typing import Optional, List, Dict, Any
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, Text, ForeignKey
from sqlalchemy.orm import relationship
from pydantic import BaseModel, Field
from database import Base

# ============================================================================
# SQLAlchemy ORM Models (Database Tables)
# ============================================================================

class GoalModel(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(String(50), unique=True, index=True, nullable=False)
    user_email = Column(String(150), default="user@example.com", nullable=False)
    goal_name = Column(String(200), nullable=False)
    category = Column(String(100), default="General Savings", nullable=False)
    target_amount = Column(Float, nullable=False)
    current_savings = Column(Float, default=0.0, nullable=False)
    remaining_amount = Column(Float, default=0.0, nullable=False)
    deadline = Column(String(50), nullable=False) # Stored as YYYY-MM-DD string
    days_remaining = Column(Integer, default=0)
    progress_pct = Column(Float, default=0.0)
    status = Column(String(50), default="In Progress")
    email_alerts_enabled = Column(Boolean, default=True)
    purpose = Column(Text, nullable=True)
    last_alert_sent = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    transactions = relationship("TransactionModel", back_populates="goal", cascade="all, delete-orphan")
    ai_logs = relationship("AILogModel", back_populates="goal", cascade="all, delete-orphan")


class TransactionModel(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(50), unique=True, index=True)
    goal_id = Column(String(50), ForeignKey("goals.goal_id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    amount = Column(Float, nullable=False)
    note = Column(String(255), nullable=True)
    previous_balance = Column(Float, default=0.0)
    new_balance = Column(Float, default=0.0)

    goal = relationship("GoalModel", back_populates="transactions")


class AILogModel(Base):
    __tablename__ = "ai_logs"

    id = Column(Integer, primary_key=True, index=True)
    log_id = Column(String(50), unique=True, index=True)
    goal_id = Column(String(50), ForeignKey("goals.goal_id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    prompt = Column(Text, nullable=False)
    recommendation = Column(Text, nullable=False)
    model = Column(String(100), default="llama-3.3-70b-versatile")

    goal = relationship("GoalModel", back_populates="ai_logs")


# ============================================================================
# Pydantic Schemas for Request & Response Serialization
# ============================================================================

class GoalBase(BaseModel):
    goal_name: str = Field(..., example="Emergency Reserve")
    category: str = Field(default="Emergency Fund", example="Emergency Fund")
    target_amount: float = Field(..., gt=0, example=10000.0)
    initial_savings: float = Field(default=0.0, ge=0, example=1500.0)
    deadline: str = Field(..., example="2026-12-31")
    user_email: Optional[str] = Field(default="user@example.com", example="user@example.com")
    purpose: Optional[str] = Field(default="", example="6 months buffer for unexpected expenses")
    email_alerts_enabled: bool = Field(default=True, example=True)


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    goal_name: Optional[str] = None
    category: Optional[str] = None
    target_amount: Optional[float] = None
    current_savings: Optional[float] = None
    deadline: Optional[str] = None
    user_email: Optional[str] = None
    purpose: Optional[str] = None
    email_alerts_enabled: Optional[bool] = None


class GoalResponse(BaseModel):
    goal_id: str
    user_email: str
    goal_name: str
    category: str
    target_amount: float
    current_savings: float
    remaining_amount: float
    deadline: str
    days_remaining: int
    progress_pct: float
    status: str
    email_alerts_enabled: bool
    purpose: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DepositCreate(BaseModel):
    amount: float = Field(..., gt=0, example=250.0)
    note: Optional[str] = Field(default="Scheduled deposit", example="Paycheck allocation")


class DepositResponse(BaseModel):
    success: bool
    goal_id: str
    amount: float
    previous_savings: float
    new_savings: float
    remaining_amount: float
    progress_pct: float
    status: str


class AIInsightResponse(BaseModel):
    goal_id: str
    goal_name: str
    source: str
    model: str
    recommendation: str
    financial_metrics: Dict[str, Any]


class DashboardKPIs(BaseModel):
    total_goals: int
    total_target: float
    total_saved: float
    total_remaining: float
    overall_progress_pct: float
    active_goals: int
    completed_goals: int
    overdue_goals: int
    near_deadline_goals: int


class DashboardResponse(BaseModel):
    kpis: DashboardKPIs
    category_breakdown: Dict[str, Dict[str, Any]]
    goals: List[GoalResponse]
