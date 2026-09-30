import os
import random
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import (
    GoalModel, TransactionModel, AILogModel,
    GoalCreate, GoalUpdate, GoalResponse,
    DepositCreate, DepositResponse,
    AIInsightResponse, DashboardResponse, DashboardKPIs
)
from ai_engine import get_financial_recommendation
from pdf_service import generate_financial_summary_pdf, generate_single_goal_pdf

# Initialize Database Schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SaveIQ – AI Savings Goal Tracker API",
    description="Backend API engine powered by FastAPI, SQLite/PostgreSQL, Groq AI (LLaMA 3.3-70B), and ReportLab PDF Services.",
    version="2.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def calculate_days_remaining(deadline_str: str) -> int:
    """Calculates days between today and target deadline date."""
    try:
        target = datetime.strptime(deadline_str, "%Y-%m-%d").date()
        today = date.today()
        return (target - today).days
    except Exception:
        return 999

def evaluate_status(progress_pct: float, days_remaining: int) -> str:
    """Evaluates goal status: Completed, Overdue, Near Deadline, or In Progress."""
    if progress_pct >= 100.0:
        return "Completed"
    if days_remaining < 0:
        return "Overdue"
    if days_remaining <= 14:
        return "Near Deadline"
    return "In Progress"

def seed_sample_goals_if_empty(db: Session):
    """Auto-seeds realistic sample savings goals on first startup."""
    count = db.query(GoalModel).count()
    if count > 0:
        return

    today = date.today()
    sample_goals = [
        {
            "goal_id": "GOAL-1001",
            "user_email": "user@example.com",
            "goal_name": "6-Month Emergency Fund",
            "category": "Emergency Fund",
            "target_amount": 12000.0,
            "current_savings": 8400.0,
            "remaining_amount": 3600.0,
            "deadline": (today + timedelta(days=90)).strftime("%Y-%m-%d"),
            "days_remaining": 90,
            "progress_pct": 70.0,
            "status": "In Progress",
            "email_alerts_enabled": True,
            "purpose": "Maintain 6 months of living expenses in high-yield savings for safety."
        },
        {
            "goal_id": "GOAL-1002",
            "user_email": "user@example.com",
            "goal_name": "M3 Max MacBook Pro",
            "category": "Gadget / Electronics",
            "target_amount": 3500.0,
            "current_savings": 3500.0,
            "remaining_amount": 0.0,
            "deadline": (today + timedelta(days=15)).strftime("%Y-%m-%d"),
            "days_remaining": 15,
            "progress_pct": 100.0,
            "status": "Completed",
            "email_alerts_enabled": True,
            "purpose": "Workstation upgrade for AI engineering and development."
        },
        {
            "goal_id": "GOAL-1003",
            "user_email": "user@example.com",
            "goal_name": "Tokyo & Kyoto Vacation",
            "category": "Travel & Vacation",
            "target_amount": 5000.0,
            "current_savings": 1750.0,
            "remaining_amount": 3250.0,
            "deadline": (today + timedelta(days=45)).strftime("%Y-%m-%d"),
            "days_remaining": 45,
            "progress_pct": 35.0,
            "status": "In Progress",
            "email_alerts_enabled": True,
            "purpose": "Autumn foliage tour, flight tickets, and ryokan accommodations."
        },
        {
            "goal_id": "GOAL-1004",
            "user_email": "user@example.com",
            "goal_name": "Certifications & Upskilling",
            "category": "Education",
            "target_amount": 1500.0,
            "current_savings": 400.0,
            "remaining_amount": 1100.0,
            "deadline": (today + timedelta(days=8)).strftime("%Y-%m-%d"),
            "days_remaining": 8,
            "progress_pct": 26.67,
            "status": "Near Deadline",
            "email_alerts_enabled": True,
            "purpose": "Cloud Architecture and AI Engineering professional certifications."
        }
    ]

    for data in sample_goals:
        goal_obj = GoalModel(**data)
        db.add(goal_obj)
    db.commit()

# Seed database on startup
with Session(engine) as db_session:
    seed_sample_goals_if_empty(db_session)

# ============================================================================
# Core API Endpoints
# ============================================================================

@app.get("/")
def root():
    return {
        "app": "SaveIQ – AI Savings Goal Tracker API",
        "version": "2.0.0",
        "documentation": "/docs",
        "health": "/api/health"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected"
    }

@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    """Fetches high-level KPIs, category allocations, and list of goals."""
    goals = db.query(GoalModel).all()

    total_target = 0.0
    total_saved = 0.0
    active_count = 0
    completed_count = 0
    overdue_count = 0
    near_deadline_count = 0
    category_map: Dict[str, Dict[str, Any]] = {}

    for g in goals:
        # Re-verify days and status dynamically
        days = calculate_days_remaining(g.deadline)
        g.days_remaining = days
        g.remaining_amount = max(0.0, g.target_amount - g.current_savings)
        g.progress_pct = round((g.current_savings / g.target_amount) * 100.0, 2) if g.target_amount > 0 else 0.0
        g.status = evaluate_status(g.progress_pct, days)

        total_target += g.target_amount
        total_saved += g.current_savings

        if g.status == "Completed":
            completed_count += 1
        elif g.status == "Overdue":
            overdue_count += 1
            active_count += 1
        elif g.status == "Near Deadline":
            near_deadline_count += 1
            active_count += 1
        else:
            active_count += 1

        cat = g.category or "General Savings"
        if cat not in category_map:
            category_map[cat] = {"count": 0, "target": 0.0, "saved": 0.0}
        category_map[cat]["count"] += 1
        category_map[cat]["target"] += g.target_amount
        category_map[cat]["saved"] += g.current_savings

    db.commit()

    total_remaining = max(0.0, total_target - total_saved)
    overall_progress = round((total_saved / total_target) * 100.0, 1) if total_target > 0 else 0.0

    kpis = DashboardKPIs(
        total_goals=len(goals),
        total_target=round(total_target, 2),
        total_saved=round(total_saved, 2),
        total_remaining=round(total_remaining, 2),
        overall_progress_pct=overall_progress,
        active_goals=active_count,
        completed_goals=completed_count,
        overdue_goals=overdue_count,
        near_deadline_goals=near_deadline_count
    )

    return DashboardResponse(
        kpis=kpis,
        category_breakdown=category_map,
        goals=[GoalResponse.from_orm(g) for g in goals]
    )

@app.get("/api/goals", response_model=List[GoalResponse])
def get_all_goals(db: Session = Depends(get_db)):
    goals = db.query(GoalModel).all()
    return [GoalResponse.from_orm(g) for g in goals]

@app.post("/api/goals", response_model=GoalResponse)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    goal_id = f"GOAL-{random.randint(100000, 999999)}"
    days = calculate_days_remaining(payload.deadline)
    initial_savings = payload.initial_savings or 0.0
    remaining = max(0.0, payload.target_amount - initial_savings)
    progress = round((initial_savings / payload.target_amount) * 100.0, 2) if payload.target_amount > 0 else 0.0
    status = evaluate_status(progress, days)

    goal_obj = GoalModel(
        goal_id=goal_id,
        user_email=payload.user_email or "user@example.com",
        goal_name=payload.goal_name,
        category=payload.category,
        target_amount=payload.target_amount,
        current_savings=initial_savings,
        remaining_amount=remaining,
        deadline=payload.deadline,
        days_remaining=days,
        progress_pct=progress,
        status=status,
        email_alerts_enabled=payload.email_alerts_enabled,
        purpose=payload.purpose
    )
    db.add(goal_obj)
    db.commit()
    db.refresh(goal_obj)

    # If initial deposit made, record transaction
    if initial_savings > 0:
        tx = TransactionModel(
            transaction_id=f"TX-{random.randint(100000, 999999)}",
            goal_id=goal_id,
            amount=initial_savings,
            note="Initial deposit upon goal creation",
            previous_balance=0.0,
            new_balance=initial_savings
        )
        db.add(tx)
        db.commit()

    return GoalResponse.from_orm(goal_obj)

@app.get("/api/goals/{goal_id}", response_model=GoalResponse)
def get_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return GoalResponse.from_orm(goal)

@app.put("/api/goals/{goal_id}", response_model=GoalResponse)
def update_goal(goal_id: str, payload: GoalUpdate, db: Session = Depends(get_db)):
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(goal, field, val)

    # Recalculate
    days = calculate_days_remaining(goal.deadline)
    goal.days_remaining = days
    goal.remaining_amount = max(0.0, goal.target_amount - goal.current_savings)
    goal.progress_pct = round((goal.current_savings / goal.target_amount) * 100.0, 2) if goal.target_amount > 0 else 0.0
    goal.status = evaluate_status(goal.progress_pct, days)
    goal.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(goal)
    return GoalResponse.from_orm(goal)

@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    db.delete(goal)
    db.commit()
    return {"success": True, "goal_id": goal_id, "message": "Goal deleted successfully"}

@app.post("/api/goals/{goal_id}/deposit", response_model=DepositResponse)
def record_deposit(goal_id: str, payload: DepositCreate, db: Session = Depends(get_db)):
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    prev_savings = goal.current_savings
    new_savings = prev_savings + payload.amount
    remaining = max(0.0, goal.target_amount - new_savings)
    days = calculate_days_remaining(goal.deadline)
    progress = round((new_savings / goal.target_amount) * 100.0, 2) if goal.target_amount > 0 else 0.0
    status = evaluate_status(progress, days)

    goal.current_savings = new_savings
    goal.remaining_amount = remaining
    goal.progress_pct = progress
    goal.status = status
    goal.days_remaining = days
    goal.updated_at = datetime.utcnow()

    # Log transaction
    tx = TransactionModel(
        transaction_id=f"TX-{random.randint(100000, 999999)}",
        goal_id=goal_id,
        amount=payload.amount,
        note=payload.note or "Manual deposit",
        previous_balance=prev_savings,
        new_balance=new_savings
    )
    db.add(tx)
    db.commit()
    db.refresh(goal)

    return DepositResponse(
        success=True,
        goal_id=goal_id,
        amount=payload.amount,
        previous_savings=prev_savings,
        new_savings=new_savings,
        remaining_amount=remaining,
        progress_pct=progress,
        status=status
    )

@app.post("/api/goals/{goal_id}/ai-insights", response_model=AIInsightResponse)
async def generate_ai_insights(goal_id: str, db: Session = Depends(get_db)):
    """Calls Groq API (LLaMA 3.3-70B) to deliver actionable savings advice."""
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal_dict = {
        "goal_id": goal.goal_id,
        "goal_name": goal.goal_name,
        "category": goal.category,
        "target_amount": goal.target_amount,
        "current_savings": goal.current_savings,
        "remaining_amount": goal.remaining_amount,
        "deadline": goal.deadline,
        "days_remaining": goal.days_remaining,
        "progress_pct": goal.progress_pct,
        "status": goal.status,
        "purpose": goal.purpose
    }

    ai_result = await get_financial_recommendation(goal_dict)

    # Log recommendation in database
    ai_log = AILogModel(
        log_id=f"AI-{random.randint(100000, 999999)}",
        goal_id=goal_id,
        prompt="API request for financial advice",
        recommendation=ai_result["recommendation"][:2000],
        model=ai_result.get("model", "llama-3.3-70b-versatile")
    )
    db.add(ai_log)
    db.commit()

    return AIInsightResponse(
        goal_id=goal_id,
        goal_name=goal.goal_name,
        source=ai_result["source"],
        model=ai_result.get("model", "llama-3.3-70b-versatile"),
        recommendation=ai_result["recommendation"],
        financial_metrics=ai_result["financial_metrics"]
    )

# ============================================================================
# PDF Generation Endpoints (ReportLab Service)
# ============================================================================

@app.get("/api/reports/summary-pdf")
def download_summary_pdf(db: Session = Depends(get_db)):
    """Generates and streams executive financial statement PDF."""
    dashboard = get_dashboard(db)
    pdf_buffer = generate_financial_summary_pdf(dashboard.dict())

    filename = f"SaveIQ_Statement_{date.today().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/reports/goal-pdf/{goal_id}")
async def download_goal_pdf(goal_id: str, db: Session = Depends(get_db)):
    """Generates and streams in-depth single goal audit report PDF with AI insights."""
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal_dict = {
        "goal_id": goal.goal_id,
        "goal_name": goal.goal_name,
        "category": goal.category,
        "target_amount": goal.target_amount,
        "current_savings": goal.current_savings,
        "remaining_amount": goal.remaining_amount,
        "deadline": goal.deadline,
        "days_remaining": goal.days_remaining,
        "progress_pct": goal.progress_pct,
        "status": goal.status,
        "purpose": goal.purpose
    }
    ai_result = await get_financial_recommendation(goal_dict)
    pdf_buffer = generate_single_goal_pdf(goal_dict, ai_result["recommendation"])

    filename = f"SaveIQ_Audit_{goal.goal_id}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============================================================================
# Automated Daily Audit Trigger
# ============================================================================

@app.post("/api/audit-trigger")
def execute_daily_audit(db: Session = Depends(get_db)):
    """Simulates or runs automated financial audit for all active goals."""
    goals = db.query(GoalModel).all()
    processed = len(goals)
    alerts_triggered = []

    for g in goals:
        days = calculate_days_remaining(g.deadline)
        g.days_remaining = days
        g.status = evaluate_status(g.progress_pct, days)

        if g.email_alerts_enabled and g.status != "Completed":
            if days < 0:
                alerts_triggered.append({"goal_id": g.goal_id, "reason": "Overdue", "email": g.user_email})
            elif days <= 14:
                alerts_triggered.append({"goal_id": g.goal_id, "reason": f"Near deadline ({days} days left)", "email": g.user_email})

    db.commit()

    return {
        "success": True,
        "timestamp": datetime.utcnow().isoformat(),
        "goals_processed": processed,
        "alerts_triggered_count": len(alerts_triggered),
        "alerts": alerts_triggered
    }
