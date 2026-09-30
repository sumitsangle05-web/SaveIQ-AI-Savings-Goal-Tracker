import os
import httpx
from datetime import datetime
from typing import Dict, Any

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

async def get_financial_recommendation(goal_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calls Groq API (LLaMA 3.3-70B Versatile) or OpenAI API with domain-tailored prompts
    to generate personalized savings advice, discipline triggers, and budget pacing.
    """
    days = max(1, goal_dict.get("days_remaining", 1))
    weeks = max(1, (days + 6) // 7)
    remaining = float(goal_dict.get("remaining_amount", 0.0))
    daily_pace = round(remaining / days, 2) if remaining > 0 else 0.0
    weekly_pace = round(remaining / weeks, 2) if remaining > 0 else 0.0

    metrics = {
        "daily_pace": daily_pace,
        "weekly_pace": weekly_pace,
        "days_remaining": days,
        "remaining_amount": remaining,
        "progress_pct": goal_dict.get("progress_pct", 0.0)
    }

    # If neither Groq nor OpenAI API key is configured, use local intelligent heuristic engine
    if not GROQ_API_KEY and not OPENAI_API_KEY:
        advice = _generate_heuristic_recommendation(goal_dict, daily_pace, weekly_pace)
        return {
            "goal_id": goal_dict["goal_id"],
            "goal_name": goal_dict["goal_name"],
            "source": "local_heuristic",
            "model": "Heuristic Rule-Based Advisory Engine",
            "recommendation": advice,
            "financial_metrics": metrics
        }

    # Structured Prompt Engineering
    system_prompt = (
        "You are the SaveIQ Financial AI Engine, an elite Certified Financial Planner (CFP) "
        "and behavioral economics specialist. Your mission is to provide personalized, "
        "pragmatic, and mathematically precise financial guidance to help users systematically "
        "achieve their savings milestones before deadline. "
        "Structure your response with clear, markdown-formatted headings: "
        "1. Executive Milestone & Velocity Assessment\n"
        "2. Required Savings Pace (Daily & Weekly Targets)\n"
        "3. High-Impact Expense Trimming (Practical Budget Adjustments)\n"
        "4. Behavioral Discipline Habit (e.g. 72-Hour Rule, Habit Stacking)\n"
        "5. Motivation & Completion Roadmap.\n"
        "Maintain an encouraging, authoritative, and direct tone."
    )

    user_prompt = (
        f"Generate a customized financial action plan for this savings goal:\n\n"
        f"- Goal Name: {goal_dict.get('goal_name')}\n"
        f"- Category: {goal_dict.get('category')}\n"
        f"- Target Amount: ${goal_dict.get('target_amount'):,.2f}\n"
        f"- Current Savings: ${goal_dict.get('current_savings'):,.2f}\n"
        f"- Remaining Balance: ${remaining:,.2f}\n"
        f"- Progress: {goal_dict.get('progress_pct')}%\n"
        f"- Target Deadline: {goal_dict.get('deadline')} ({days} days remaining)\n"
        f"- Current Status: {goal_dict.get('status')}\n"
        f"- User Purpose / Notes: {goal_dict.get('purpose', 'N/A')}\n"
        f"- Required Daily Pace: ${daily_pace:,.2f}/day\n"
        f"- Required Weekly Pace: ${weekly_pace:,.2f}/week\n\n"
        f"Provide concrete financial advice to optimize daily cash flow and reach this target on time."
    )

    # Prioritize Groq API (LLaMA 3.3-70B Versatile)
    if GROQ_API_KEY:
        target_url = GROQ_API_URL
        api_key = GROQ_API_KEY
        model_name = DEFAULT_MODEL
        source_label = "groq_llama_3.3_70b"
    else:
        target_url = OPENAI_API_URL
        api_key = OPENAI_API_KEY
        model_name = "gpt-4o-mini"
        source_label = "openai_gpt4"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.6,
        "max_tokens": 800
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(target_url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                ai_text = data["choices"][0]["message"]["content"]
                return {
                    "goal_id": goal_dict["goal_id"],
                    "goal_name": goal_dict["goal_name"],
                    "source": source_label,
                    "model": model_name,
                    "recommendation": ai_text,
                    "financial_metrics": metrics
                }
            else:
                # Fallback on API failure
                fallback = _generate_heuristic_recommendation(goal_dict, daily_pace, weekly_pace)
                return {
                    "goal_id": goal_dict["goal_id"],
                    "goal_name": goal_dict["goal_name"],
                    "source": "fallback_api_error",
                    "model": f"{model_name} (HTTP {resp.status_code} Fallback)",
                    "recommendation": fallback,
                    "financial_metrics": metrics
                }
    except Exception as e:
        fallback = _generate_heuristic_recommendation(goal_dict, daily_pace, weekly_pace)
        return {
            "goal_id": goal_dict["goal_id"],
            "goal_name": goal_dict["goal_name"],
            "source": "fallback_exception",
            "model": "Fallback Heuristic",
            "recommendation": fallback,
            "financial_metrics": metrics
        }


def _generate_heuristic_recommendation(goal: Dict[str, Any], daily_pace: float, weekly_pace: float) -> str:
    """Intelligent fallback financial heuristic when AI key is offline or unconfigured."""
    name = goal.get("goal_name", "Goal")
    status = goal.get("status", "In Progress")
    days = goal.get("days_remaining", 0)
    remaining = float(goal.get("remaining_amount", 0.0))

    if status == "Completed":
        return (
            f"### 🎉 Goal Completed: {name}\n\n"
            f"- **Milestone Reached**: 100% of target funding achieved!\n"
            f"- **Next Step**: Protect this capital by moving it to an FDIC-insured high-yield account or execute your purchase.\n"
            f"- **Habit Momentum**: Redirect your daily savings habit toward your next priority bucket immediately."
        )

    return (
        f"### 📊 SaveIQ Financial Guidance for: {name}\n\n"
        f"**1. Executive Velocity Assessment**\n"
        f"You are currently **{goal.get('progress_pct')}%** toward your target. "
        f"To close the remaining **${remaining:,.2f}** within **{days} days**, steady discipline is vital.\n\n"
        f"**2. Required Savings Pace**\n"
        f"- Daily Target: **${daily_pace:,.2f} / day**\n"
        f"- Weekly Target: **${weekly_pace:,.2f} / week**\n\n"
        f"**3. Practical Budget Optimization Tactics**\n"
        f"- **Subscription Audit**: Audit unused streaming or SaaS subscriptions to recover $20-$40/month.\n"
        f"- **Discretionary Trimming**: Halve restaurant dining or impulse delivery orders this week to unlock cash flow.\n"
        f"- **Windfall Allocation**: Direct 80% of unexpected income (cashback, rebates, bonuses) directly into this fund.\n\n"
        f"**4. Behavioral Discipline Habit**\n"
        f"- **The 72-Hour Rule**: For any non-essential purchase exceeding ${daily_pace:,.2f}, wait 3 days. "
        f"If the desire fades, deposit that amount straight into this goal!\n"
        f"- **Automate Frictionless Transfers**: Schedule an automatic deposit of ${weekly_pace:,.2f} every payday.\n\n"
        f"**5. Motivational Finish Line**\n"
        f"Financial freedom is built on incremental consistency. Keep tracking your progress daily!"
    )
