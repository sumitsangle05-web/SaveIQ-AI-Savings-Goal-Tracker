import io
from datetime import datetime
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

def generate_financial_summary_pdf(data: Dict[str, Any]) -> io.BytesIO:
    """
    Generates a professional executive PDF statement for all savings goals,
    KPIs, and financial progress tracking.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0F172A'),
        alignment=TA_LEFT
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748B'),
        alignment=TA_LEFT
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=12,
        spaceAfter=6
    )

    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1E293B')
    )

    cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )

    story = []

    # Header section
    story.append(Paragraph("SaveIQ Financial Statement & Audit", title_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')} • Powered by Groq AI & FastAPI", subtitle_style))
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#3B82F6'), spaceBefore=2, spaceAfter=14))

    # Executive KPI Table
    kpis = data.get("kpis", {})
    total_goals = kpis.get("total_goals", 0)
    total_target = kpis.get("total_target", 0.0)
    total_saved = kpis.get("total_saved", 0.0)
    total_remaining = kpis.get("total_remaining", 0.0)
    overall_progress = kpis.get("overall_progress_pct", 0.0)
    completed_goals = kpis.get("completed_goals", 0)
    active_goals = kpis.get("active_goals", 0)

    kpi_data = [
        [
            Paragraph("<b>Total Goals</b>", cell_style),
            Paragraph("<b>Total Target</b>", cell_style),
            Paragraph("<b>Total Saved</b>", cell_style),
            Paragraph("<b>Remaining</b>", cell_style),
            Paragraph("<b>Progress %</b>", cell_style)
        ],
        [
            Paragraph(f"<font size=13><b>{total_goals}</b></font><br/>({active_goals} Active, {completed_goals} Done)", cell_style),
            Paragraph(f"<font size=13><b>${total_target:,.2f}</b></font>", cell_style),
            Paragraph(f"<font size=13 color='#10B981'><b>${total_saved:,.2f}</b></font>", cell_style),
            Paragraph(f"<font size=13 color='#F59E0B'><b>${total_remaining:,.2f}</b></font>", cell_style),
            Paragraph(f"<font size=13 color='#3B82F6'><b>{overall_progress}%</b></font>", cell_style)
        ]
    ]

    kpi_table = Table(kpi_data, colWidths=[108, 108, 108, 108, 108])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#F8FAFC')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 18))

    # Goal Breakdown Table
    story.append(Paragraph("Goal Portfolio Breakdown", section_heading))
    goals = data.get("goals", [])

    table_data = [
        [
            Paragraph("<b>Goal Name</b>", cell_style),
            Paragraph("<b>Category</b>", cell_style),
            Paragraph("<b>Target</b>", cell_style),
            Paragraph("<b>Saved</b>", cell_style),
            Paragraph("<b>Deadline</b>", cell_style),
            Paragraph("<b>Progress</b>", cell_style),
            Paragraph("<b>Status</b>", cell_style)
        ]
    ]

    for g in goals:
        progress_val = g.get("progress_pct", 0.0)
        status_val = g.get("status", "In Progress")

        # Status badge color representation
        status_color = "#3B82F6"
        if status_val == "Completed":
            status_color = "#10B981"
        elif status_val == "Near Deadline":
            status_color = "#F59E0B"
        elif status_val == "Overdue":
            status_color = "#EF4444"

        table_data.append([
            Paragraph(f"<b>{g.get('goal_name')}</b>", cell_style),
            Paragraph(g.get("category", ""), cell_style),
            Paragraph(f"${g.get('target_amount', 0):,.2f}", cell_style),
            Paragraph(f"${g.get('current_savings', 0):,.2f}", cell_style),
            Paragraph(f"{g.get('deadline', '')}<br/><font size=7 color='#64748B'>({g.get('days_remaining', 0)}d left)</font>", cell_style),
            Paragraph(f"{progress_val}%", cell_bold),
            Paragraph(f"<font color='{status_color}'><b>{status_val}</b></font>", cell_style)
        ])

    goal_table = Table(table_data, colWidths=[120, 85, 75, 75, 75, 55, 55])
    goal_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(goal_table)
    story.append(Spacer(1, 20))

    # Notes & AI Disclaimer
    notice_text = (
        "<b>Notice:</b> This statement is an automated financial report generated by SaveIQ. "
        "Savings forecasts and recommendations are generated via AI and behavioral economics models "
        "to assist discipline and are intended for personal guidance."
    )
    story.append(Paragraph(notice_text, subtitle_style))

    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_single_goal_pdf(goal: Dict[str, Any], ai_insight: str) -> io.BytesIO:
    """
    Generates an in-depth audit report for a single financial goal,
    including AI financial coaching recommendations.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F172A')
    )
    
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#334155')
    )

    story = []
    story.append(Paragraph(f"SaveIQ Goal Audit: {goal.get('goal_name')}", title_style))
    story.append(Paragraph(f"Category: {goal.get('category')} • Status: {goal.get('status')}", styles['Normal']))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#3B82F6'), spaceBefore=2, spaceAfter=12))

    # Goal metrics overview
    metrics_data = [
        [Paragraph("<b>Target Amount</b>", styles['Normal']), Paragraph(f"${goal.get('target_amount', 0):,.2f}", styles['Normal'])],
        [Paragraph("<b>Current Savings</b>", styles['Normal']), Paragraph(f"${goal.get('current_savings', 0):,.2f}", styles['Normal'])],
        [Paragraph("<b>Remaining Balance</b>", styles['Normal']), Paragraph(f"${goal.get('remaining_amount', 0):,.2f}", styles['Normal'])],
        [Paragraph("<b>Progress Completed</b>", styles['Normal']), Paragraph(f"{goal.get('progress_pct', 0)}%", styles['Normal'])],
        [Paragraph("<b>Deadline Date</b>", styles['Normal']), Paragraph(f"{goal.get('deadline', '')} ({goal.get('days_remaining', 0)} days remaining)", styles['Normal'])],
        [Paragraph("<b>User Purpose / Note</b>", styles['Normal']), Paragraph(f"{goal.get('purpose', 'N/A')}", styles['Normal'])],
    ]
    
    t = Table(metrics_data, colWidths=[150, 380])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F1F5F9')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 16))

    # AI Recommendation Section
    story.append(Paragraph("<b>Groq AI Financial Advisory & Action Plan</b>", styles['Heading2']))
    story.append(Spacer(1, 6))

    formatted_insight = ai_insight.replace("\n", "<br/>").replace("**", "<b>").replace("### ", "<b>").replace("• ", "&bull; ")
    story.append(Paragraph(formatted_insight, body_style))

    doc.build(story)
    buffer.seek(0)
    return buffer
