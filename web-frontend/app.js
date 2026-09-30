/**
 * SaveIQ Web Frontend Application Engine
 * Handles State, Backend Connectors (FastAPI / GAS / Local Storage), Groq AI, and Visual Analytics.
 */

// Application State
const state = {
  goals: [],
  kpis: {},
  categoryBreakdown: {},
  filter: 'all',
  searchQuery: '',
  backendMode: localStorage.getItem('saveiq_backend_mode') || 'local', // 'local' | 'fastapi' | 'gas'
  fastApiUrl: localStorage.getItem('saveiq_fastapi_url') || 'http://localhost:8000',
  gasWebAppUrl: localStorage.getItem('saveiq_gas_url') || '',
  groqApiKey: localStorage.getItem('saveiq_groq_api_key') || '',
  groqModel: 'llama-3.3-70b-versatile'
};

// Seed realistic demo goals if running for the first time
const defaultGoals = [
  {
    goalId: 'GOAL-1001',
    goalName: '6-Month Emergency Fund',
    category: 'Emergency Fund',
    targetAmount: 12000,
    currentSavings: 8400,
    remainingAmount: 3600,
    deadline: '2026-12-31',
    daysRemaining: 92,
    progressPct: 70.0,
    status: 'In Progress',
    emailAlertsEnabled: true,
    userEmail: 'user@example.com',
    purpose: 'Buffer covering 6 months of housing, nutrition, and fixed utilities.'
  },
  {
    goalId: 'GOAL-1002',
    goalName: 'M3 Max MacBook Pro',
    category: 'Gadget / Electronics',
    targetAmount: 3500,
    currentSavings: 3500,
    remainingAmount: 0,
    deadline: '2026-10-15',
    daysRemaining: 15,
    progressPct: 100.0,
    status: 'Completed',
    emailAlertsEnabled: true,
    userEmail: 'user@example.com',
    purpose: 'Workstation upgrade for local LLM inference and full-stack development.'
  },
  {
    goalId: 'GOAL-1003',
    goalName: 'Tokyo & Kyoto Vacation',
    category: 'Travel & Vacation',
    targetAmount: 5000,
    currentSavings: 1750,
    remainingAmount: 3250,
    deadline: '2026-11-20',
    daysRemaining: 51,
    progressPct: 35.0,
    status: 'In Progress',
    emailAlertsEnabled: true,
    userEmail: 'user@example.com',
    purpose: 'Autumn foliage tour across Tokyo, Kyoto ryokans, and Shinkansen rail pass.'
  },
  {
    goalId: 'GOAL-1004',
    goalName: 'AI Cloud Certifications',
    category: 'Education',
    targetAmount: 1500,
    currentSavings: 400,
    remainingAmount: 1100,
    deadline: '2026-10-09',
    daysRemaining: 9,
    progressPct: 26.67,
    status: 'Near Deadline',
    emailAlertsEnabled: true,
    userEmail: 'user@example.com',
    purpose: 'Professional cloud certification exams and specialized learning vouchers.'
  }
];

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  loadStoredSettings();
  loadData();
}

function loadStoredSettings() {
  const modeBadge = document.getElementById('backend-mode-badge');
  if (modeBadge) {
    modeBadge.innerText = state.backendMode.toUpperCase();
  }
}

// ============================================================================
// Data Synchronization & API Layer
// ============================================================================

async function loadData() {
  if (state.backendMode === 'fastapi') {
    try {
      const res = await fetch(`${state.fastApiUrl}/api/dashboard`);
      if (res.ok) {
        const data = await res.json();
        state.goals = data.goals.map(mapGoalFromBackend);
        state.kpis = data.kpis;
        state.categoryBreakdown = data.category_breakdown;
        renderAll();
        return;
      }
    } catch (e) {
      console.warn('FastAPI unavailable, falling back to local storage', e);
      notifyToast('FastAPI unreachable. Operating in Local Mode.');
    }
  }

  // Local Storage Mode
  const stored = localStorage.getItem('saveiq_goals_data');
  if (stored) {
    try {
      state.goals = JSON.parse(stored);
    } catch (e) {
      state.goals = [...defaultGoals];
    }
  } else {
    state.goals = [...defaultGoals];
    saveToLocalStorage();
  }

  computeLocalMetrics();
  renderAll();
}

function mapGoalFromBackend(g) {
  return {
    goalId: g.goal_id,
    goalName: g.goal_name,
    category: g.category,
    targetAmount: g.target_amount,
    currentSavings: g.current_savings,
    remainingAmount: g.remaining_amount,
    deadline: g.deadline,
    daysRemaining: g.days_remaining,
    progressPct: g.progress_pct,
    status: g.status,
    emailAlertsEnabled: g.email_alerts_enabled,
    userEmail: g.user_email,
    purpose: g.purpose
  };
}

function saveToLocalStorage() {
  localStorage.setItem('saveiq_goals_data', JSON.stringify(state.goals));
}

function computeLocalMetrics() {
  let totalTarget = 0;
  let totalSaved = 0;
  let active = 0, completed = 0, overdue = 0, nearDeadline = 0;
  const categories = {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  state.goals.forEach(g => {
    // Dynamic recalculation of days remaining & status
    if (g.deadline) {
      const targetDate = new Date(g.deadline);
      targetDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
      g.daysRemaining = isNaN(diff) ? 999 : diff;
    }

    g.remainingAmount = Math.max(0, g.targetAmount - g.currentSavings);
    g.progressPct = g.targetAmount > 0 ? parseFloat(((g.currentSavings / g.targetAmount) * 100).toFixed(1)) : 0;

    if (g.progressPct >= 100) {
      g.status = 'Completed';
      completed++;
    } else if (g.daysRemaining < 0) {
      g.status = 'Overdue';
      overdue++;
      active++;
    } else if (g.daysRemaining <= 14) {
      g.status = 'Near Deadline';
      nearDeadline++;
      active++;
    } else {
      g.status = 'In Progress';
      active++;
    }

    totalTarget += g.targetAmount;
    totalSaved += g.currentSavings;

    const cat = g.category || 'Other';
    if (!categories[cat]) categories[cat] = { count: 0, target: 0, saved: 0 };
    categories[cat].count++;
    categories[cat].target += g.targetAmount;
    categories[cat].saved += g.currentSavings;
  });

  const totalRemaining = Math.max(0, totalTarget - totalSaved);
  const overallProgress = totalTarget > 0 ? parseFloat(((totalSaved / totalTarget) * 100).toFixed(1)) : 0;

  state.kpis = {
    totalGoals: state.goals.length,
    totalTarget,
    totalSaved,
    totalRemaining,
    overallProgressPct: overallProgress,
    activeGoals: active,
    completedGoals: completed,
    overdueGoals: overdue,
    nearDeadlineGoals: nearDeadline
  };

  state.categoryBreakdown = categories;
  saveToLocalStorage();
}

// ============================================================================
// UI Rendering
// ============================================================================

function renderAll() {
  renderKpis();
  renderGoalsGrid();
  renderCategoryBreakdown();
  renderCanvasChart();
}

function renderKpis() {
  document.getElementById('kpi-total-goals').innerText = state.kpis.totalGoals || 0;
  document.getElementById('kpi-active-count').innerText = `Active: ${state.kpis.activeGoals || 0}`;
  document.getElementById('kpi-total-saved').innerText = `$${(state.kpis.totalSaved || 0).toLocaleString()}`;
  document.getElementById('kpi-overall-rate').innerText = `Overall Pace: ${state.kpis.overallProgressPct || 0}%`;
  document.getElementById('kpi-total-remaining').innerText = `$${(state.kpis.totalRemaining || 0).toLocaleString()}`;
  document.getElementById('kpi-total-target').innerText = `Target Pool: $${(state.kpis.totalTarget || 0).toLocaleString()}`;
  document.getElementById('kpi-completed-goals').innerText = state.kpis.completedGoals || 0;
  document.getElementById('kpi-overdue-count').innerText = `Overdue: ${state.kpis.overdueGoals || 0} • Near: ${state.kpis.nearDeadlineGoals || 0}`;
}

function renderGoalsGrid() {
  const container = document.getElementById('goals-container');
  container.innerHTML = '';

  const filtered = state.goals.filter(g => {
    const matchesFilter = state.filter === 'all' || g.status === state.filter;
    const matchesSearch = !state.searchQuery ||
      g.goalName.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      g.category.toLowerCase().includes(state.searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px; background: var(--card-bg); border-radius: var(--radius-lg); border: 1px dashed var(--card-border);">
        <div style="font-size: 32px; margin-bottom: 10px;">🎯</div>
        <h3 style="font-size: 16px; margin-bottom: 6px;">No goals match your criteria</h3>
        <p style="color: var(--text-secondary); font-size: 13px;">Create a new savings goal or clear the search filters.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(goal => {
    const card = document.createElement('div');
    card.className = 'goal-card';

    const statusClass = `status-${goal.status.replace(/\s+/g, '-')}`;
    const progressColor = goal.progressPct >= 100 ? '#10B981' : (goal.progressPct >= 50 ? '#3B82F6' : '#F59E0B');

    card.innerHTML = `
      <div>
        <div class="card-head">
          <div>
            <span class="card-cat-badge">${escapeHtml(goal.category)}</span>
            <h3 class="card-title">${escapeHtml(goal.goalName)}</h3>
          </div>
          <span class="status-badge ${statusClass}">${goal.status}</span>
        </div>

        <p class="card-purpose">${escapeHtml(goal.purpose || 'No description specified.')}</p>

        <div class="meter-row">
          <div class="meter-header">
            <span>Progress: <strong>${goal.progressPct}%</strong></span>
            <span>${goal.daysRemaining < 0 ? `<strong style="color: #EF4444">${Math.abs(goal.daysRemaining)}d Overdue</strong>` : `<strong>${goal.daysRemaining}d left</strong> (${goal.deadline})`}</span>
          </div>
          <div class="meter-track">
            <div class="meter-bar" style="width: ${Math.min(100, goal.progressPct)}%; background: ${progressColor};"></div>
          </div>
        </div>

        <div class="stats-bar">
          <div>
            <div class="stat-metric-title">Saved</div>
            <div class="stat-metric-val" style="color: #10B981;">$${goal.currentSavings.toLocaleString()}</div>
          </div>
          <div>
            <div class="stat-metric-title">Target</div>
            <div class="stat-metric-val">$${goal.targetAmount.toLocaleString()}</div>
          </div>
          <div>
            <div class="stat-metric-title">Remaining</div>
            <div class="stat-metric-val" style="color: #F59E0B;">$${goal.remainingAmount.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div class="card-foot">
        <button class="btn-action btn-deposit-action" onclick="openDepositModal('${goal.goalId}', '${escapeHtml(goal.goalName)}')">
          <span>+</span> Deposit
        </button>
        <button class="btn-action btn-ai-action" onclick="requestAiAdvisory('${goal.goalId}')">
          <span>🤖</span> AI Insights
        </button>
        <button class="btn-action btn-delete-action" title="Delete Goal" onclick="deleteGoal('${goal.goalId}')">
          &times;
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderCategoryBreakdown() {
  const container = document.getElementById('category-breakdown-list');
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
  let colorIdx = 0;

  for (const [cat, info] of Object.entries(state.categoryBreakdown)) {
    const item = document.createElement('div');
    item.className = 'category-item';
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    const pct = state.kpis.totalTarget > 0 ? ((info.target / state.kpis.totalTarget) * 100).toFixed(0) : 0;

    item.innerHTML = `
      <div class="cat-label">
        <span class="cat-dot" style="background: ${color};"></span>
        <span>${escapeHtml(cat)} (${pct}%)</span>
      </div>
      <div class="cat-amount">$${info.saved.toLocaleString()} / $${info.target.toLocaleString()}</div>
    `;
    container.appendChild(item);
  }
}

function renderCanvasChart() {
  const canvas = document.getElementById('projection-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Background Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = (h / 5) * i;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }

  // Draw Projected Savings vs Actual Progress trajectory curve
  const points = [
    { x: 30, y: h - 30 },
    { x: w * 0.25, y: h - (h * 0.25) },
    { x: w * 0.5, y: h - (h * 0.45) },
    { x: w * 0.75, y: h - (h * 0.65) },
    { x: w - 30, y: h - (h * 0.85) }
  ];

  // Draw Ideal Pace Line (Dotted Gray)
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#64748B';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[4].x, points[4].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Actual Velocity Line (Solid Gradient Glow)
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#3B82F6');
  grad.addColorStop(1, '#10B981');

  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Draw Data Points
  points.forEach((p, idx) => {
    ctx.fillStyle = idx === points.length - 1 ? '#10B981' : '#3B82F6';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// ============================================================================
// Actions: CRUD, Deposits, and Audit
// ============================================================================

function setFilter(filter, el) {
  state.filter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderGoalsGrid();
}

function handleSearch(val) {
  state.searchQuery = val;
  renderGoalsGrid();
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function openCreateModal() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  document.getElementById('new-deadline').value = d.toISOString().split('T')[0];
  openModal('modal-create-goal');
}

async function handleCreateGoalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-name').value;
  const cat = document.getElementById('new-category').value;
  const target = parseFloat(document.getElementById('new-target').value);
  const initial = parseFloat(document.getElementById('new-initial').value) || 0;
  const deadline = document.getElementById('new-deadline').value;
  const email = document.getElementById('new-email').value || 'user@example.com';
  const purpose = document.getElementById('new-purpose').value;
  const alerts = document.getElementById('new-alerts').checked;

  const newGoal = {
    goalId: 'GOAL-' + Math.floor(100000 + Math.random() * 900000),
    goalName: name,
    category: cat,
    targetAmount: target,
    currentSavings: initial,
    remainingAmount: Math.max(0, target - initial),
    deadline: deadline,
    daysRemaining: 90,
    progressPct: target > 0 ? parseFloat(((initial / target) * 100).toFixed(1)) : 0,
    status: 'In Progress',
    emailAlertsEnabled: alerts,
    userEmail: email,
    purpose: purpose
  };

  if (state.backendMode === 'fastapi') {
    try {
      const resp = await fetch(`${state.fastApiUrl}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_name: name,
          category: cat,
          target_amount: target,
          initial_savings: initial,
          deadline: deadline,
          user_email: email,
          purpose: purpose,
          email_alerts_enabled: alerts
        })
      });
      if (resp.ok) {
        notifyToast('Goal created on FastAPI Backend!');
        closeModal('modal-create-goal');
        document.getElementById('form-new-goal').reset();
        loadData();
        return;
      }
    } catch (err) {
      console.warn('FastAPI create failed, saving locally', err);
    }
  }

  // Local storage mode
  state.goals.unshift(newGoal);
  computeLocalMetrics();
  renderAll();
  closeModal('modal-create-goal');
  document.getElementById('form-new-goal').reset();
  notifyToast('Savings Goal created successfully!');
}

function openDepositModal(goalId, goalName) {
  document.getElementById('deposit-target-id').value = goalId;
  document.getElementById('deposit-target-name').innerText = `Target: ${goalName}`;
  document.getElementById('deposit-val').value = '';
  document.getElementById('deposit-note').value = '';
  openModal('modal-deposit');
}

async function handleDepositSubmit(e) {
  e.preventDefault();
  const goalId = document.getElementById('deposit-target-id').value;
  const amount = parseFloat(document.getElementById('deposit-val').value);
  const note = document.getElementById('deposit-note').value;

  if (isNaN(amount) || amount <= 0) {
    notifyToast('Please enter a valid deposit amount');
    return;
  }

  if (state.backendMode === 'fastapi') {
    try {
      const resp = await fetch(`${state.fastApiUrl}/api/goals/${goalId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note })
      });
      if (resp.ok) {
        notifyToast(`Deposited $${amount.toLocaleString()} successfully!`);
        closeModal('modal-deposit');
        loadData();
        return;
      }
    } catch (err) {
      console.warn('FastAPI deposit failed, applying locally', err);
    }
  }

  // Local update
  const goal = state.goals.find(g => g.goalId === goalId);
  if (goal) {
    goal.currentSavings += amount;
    computeLocalMetrics();
    renderAll();
    closeModal('modal-deposit');
    notifyToast(`Deposited $${amount.toLocaleString()} to ${goal.goalName}!`);
  }
}

async function deleteGoal(goalId) {
  if (!confirm('Are you sure you want to delete this financial goal?')) return;

  if (state.backendMode === 'fastapi') {
    try {
      await fetch(`${state.fastApiUrl}/api/goals/${goalId}`, { method: 'DELETE' });
    } catch (e) {}
  }

  state.goals = state.goals.filter(g => g.goalId !== goalId);
  computeLocalMetrics();
  renderAll();
  notifyToast('Goal deleted.');
}

// ============================================================================
// Groq AI Financial Recommendation Engine
// ============================================================================

async function requestAiAdvisory(goalId) {
  const goal = state.goals.find(g => g.goalId === goalId);
  if (!goal) return;

  document.getElementById('ai-modal-title').innerText = goal.goalName;
  const content = document.getElementById('ai-modal-body');
  content.innerHTML = `
    <div style="text-align: center; padding: 36px 0;">
      <div class="loader-spin"></div>
      <p style="color: var(--text-secondary); margin-top: 14px; font-size: 13px;">
        Groq LLaMA 3.3-70B analyzing savings velocity, budget allocation & deadline pace...
      </p>
    </div>
  `;
  openModal('modal-ai');

  // Try FastAPI backend if connected
  if (state.backendMode === 'fastapi') {
    try {
      const resp = await fetch(`${state.fastApiUrl}/api/goals/${goalId}/ai-insights`, { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        renderAiInsightContent(content, data.recommendation, data.model);
        return;
      }
    } catch (err) {
      console.warn('Backend AI failed, trying browser Groq call', err);
    }
  }

  // Direct Groq API call from browser if API key configured
  if (state.groqApiKey) {
    try {
      const aiAdvice = await callGroqApiDirect(goal);
      renderAiInsightContent(content, aiAdvice, state.groqModel);
      return;
    } catch (err) {
      console.warn('Direct Groq API call failed:', err);
    }
  }

  // Local Certified Financial Planner heuristic engine
  setTimeout(() => {
    const days = Math.max(1, goal.daysRemaining);
    const remaining = goal.remainingAmount;
    const daily = (remaining / days).toFixed(2);
    const weekly = (remaining / Math.ceil(days / 7)).toFixed(2);

    const advice = `
### 📊 SaveIQ AI Financial Guidance: ${goal.goalName}

**1. Executive Milestone & Velocity Assessment**
You have reached **${goal.progressPct}%** of your target with **${days} days** remaining before the ${goal.deadline} deadline. The remaining capital requirement is **$${remaining.toLocaleString()}**.

**2. Required Savings Pace**
To achieve full funding by your deadline:
• **Daily Savings Pace**: **$${daily} / day**
• **Weekly Savings Pace**: **$${weekly} / week**

**3. High-Impact Expense Trimming (Practical Budget Adjustments)**
• **The 50/30/20 Micro-Trim**: Allocate a 5% trim from variable entertainment and casual dining directly to this fund.
• **Recurring Audit**: Pausing two unused digital entertainment subscriptions unlocks ~$35/month in immediate savings velocity.

**4. Behavioral Discipline Habit**
• **The 72-Hour Rule**: Before making any discretionary purchase over $${daily}, wait 72 hours. If the urge passes, transfer that amount directly into this '${goal.goalName}' bucket!
• **Payday Automation**: Set up a recurring transfer of $${weekly} timed with your primary income cycle to remove decision friction.

**5. Motivation & Completion Roadmap**
Consistency compounds wealth. Celebrate your next 10% milestone!
    `;
    renderAiInsightContent(content, advice, 'SaveIQ Financial Heuristics Engine');
  }, 1000);
}

function renderAiInsightContent(container, markdownText, modelName) {
  document.getElementById('ai-model-label').innerText = `Engine: ${modelName || 'LLaMA 3.3-70B Versatile'}`;
  container.innerHTML = `<div class="ai-response-box">${escapeHtml(markdownText)}</div>`;
}

async function callGroqApiDirect(goal) {
  const days = Math.max(1, goal.daysRemaining);
  const remaining = goal.remainingAmount;
  const daily = (remaining / days).toFixed(2);
  const weekly = (remaining / Math.ceil(days / 7)).toFixed(2);

  const prompt = `Analyze this savings goal and provide actionable financial advice:
Goal: ${goal.goalName}, Target: $${goal.targetAmount}, Current: $${goal.currentSavings}, Remaining: $${remaining}, Deadline: ${goal.deadline} (${days} days left), Daily Pace Needed: $${daily}/day, Weekly: $${weekly}/week.
Give 5 structured sections: Velocity Assessment, Daily/Weekly Pace, Budget Cuts, Behavioral Discipline Rule, and Completion Strategy.`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${state.groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: state.groqModel,
      messages: [
        { role: 'system', content: 'You are SaveIQ Financial Advisor, an elite certified financial planner.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 800
    })
  });

  if (!resp.ok) throw new Error('Groq API error: ' + resp.status);
  const data = await resp.json();
  return data.choices[0].message.content;
}

// ============================================================================
// Automated Audit & Email Alert Simulator
// ============================================================================

function triggerAudit() {
  notifyToast('Auditing savings goals & deadline proximity...');
  computeLocalMetrics();
  renderAll();

  // Find any goal near deadline or overdue
  const urgent = state.goals.find(g => g.daysRemaining <= 14 && g.status !== 'Completed');
  if (urgent) {
    setTimeout(() => {
      openEmailPreview(urgent);
    }, 800);
  } else {
    notifyToast('Audit complete. All goals on track!');
  }
}

function openEmailPreview(goal) {
  const daily = (goal.remainingAmount / Math.max(1, goal.daysRemaining)).toFixed(2);
  const content = document.getElementById('email-preview-content');

  content.innerHTML = `
    <div style="background-color: #0F172A; border: 1px solid #334155; border-radius: 14px; padding: 20px; color: #F8FAFC;">
      <div style="background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 14px; border-radius: 8px; text-align: center; margin-bottom: 16px;">
        <h4 style="margin: 0; font-size: 16px; color: white;">SaveIQ Automated Deadline Alert</h4>
      </div>
      <p style="font-size: 13px; color: #94A3B8; margin-bottom: 12px;">Recipient: <strong>${goal.userEmail}</strong></p>
      <div style="background: #1E293B; padding: 14px; border-radius: 8px; margin-bottom: 14px;">
        <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #FCD34D;">⚠️ ${escapeHtml(goal.goalName)}</h3>
        <p style="margin: 0; font-size: 13px; color: #CBD5E1;">Category: ${goal.category} • Status: <strong>${goal.status}</strong></p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #F59E0B;">Deadline in <strong>${goal.daysRemaining} days</strong> (${goal.deadline})</p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; text-align: center;">
        <div style="background: #1E293B; padding: 10px; border-radius: 8px;">
          <div style="font-size: 10px; color: #94A3B8;">SAVED</div>
          <div style="font-size: 15px; font-weight: 700; color: #10B981;">$${goal.currentSavings.toLocaleString()}</div>
        </div>
        <div style="background: #1E293B; padding: 10px; border-radius: 8px;">
          <div style="font-size: 10px; color: #94A3B8;">REMAINING</div>
          <div style="font-size: 15px; font-weight: 700; color: #F59E0B;">$${goal.remainingAmount.toLocaleString()}</div>
        </div>
      </div>
      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px;">
        <div style="font-size: 12px; font-weight: 700; color: #93C5FD;">🤖 AI Action Pace:</div>
        <div style="font-size: 14px; color: #E2E8F0; margin-top: 4px;">Save <strong>$${daily} / day</strong> to reach your goal before the deadline.</div>
      </div>
    </div>
  `;

  openModal('modal-email-preview');
}

// ============================================================================
// PDF Statement Generation (Client-Side & Backend)
// ============================================================================

function exportPdfStatement() {
  if (state.backendMode === 'fastapi') {
    window.open(`${state.fastApiUrl}/api/reports/summary-pdf`, '_blank');
    return;
  }

  // Client-Side Printable Report
  const win = window.open('', '_blank');
  let tableRows = state.goals.map(g => `
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>${escapeHtml(g.goalName)}</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(g.category)}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">$${g.targetAmount.toLocaleString()}</td>
      <td style="padding: 10px; border: 1px solid #ddd; color: #10B981;"><strong>$${g.currentSavings.toLocaleString()}</strong></td>
      <td style="padding: 10px; border: 1px solid #ddd; color: #F59E0B;">$${g.remainingAmount.toLocaleString()}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${g.progressPct}%</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${g.deadline}</td>
      <td style="padding: 10px; border: 1px solid #ddd;"><strong>${g.status}</strong></td>
    </tr>
  `).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SaveIQ Financial Statement</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 30px; color: #1E293B; }
        h1 { margin-bottom: 4px; color: #0F172A; }
        .sub { color: #64748B; margin-bottom: 24px; font-size: 13px; }
        .kpi-row { display: flex; gap: 20px; margin-bottom: 24px; }
        .kpi-card { background: #F8FAFC; border: 1px solid #CBD5E1; padding: 14px; border-radius: 8px; flex: 1; text-align: center; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #1E293B; color: white; padding: 10px; text-align: left; }
      </style>
    </head>
    <body>
      <h1>SaveIQ Financial Goal Audit Statement</h1>
      <div class="sub">Generated on ${new Date().toLocaleDateString()} • Powered by Groq AI & SaveIQ Engine</div>
      <div class="kpi-row">
        <div class="kpi-card"><div>Total Goals</div><h2>${state.kpis.totalGoals}</h2></div>
        <div class="kpi-card"><div>Total Target</div><h2>$${state.kpis.totalTarget.toLocaleString()}</h2></div>
        <div class="kpi-card"><div>Total Saved</div><h2 style="color: #10B981;">$${state.kpis.totalSaved.toLocaleString()}</h2></div>
        <div class="kpi-card"><div>Remaining</div><h2 style="color: #F59E0B;">$${state.kpis.totalRemaining.toLocaleString()}</h2></div>
        <div class="kpi-card"><div>Overall Progress</div><h2>${state.kpis.overallProgressPct}%</h2></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Goal Name</th><th>Category</th><th>Target</th><th>Saved</th><th>Remaining</th><th>Progress</th><th>Deadline</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <script>window.onload = function() { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================================
// Settings & Backend Switcher
// ============================================================================

function openSettingsModal() {
  document.getElementById('settings-backend-mode').value = state.backendMode;
  document.getElementById('settings-fastapi-url').value = state.fastApiUrl;
  document.getElementById('settings-groq-key').value = state.groqApiKey;
  openModal('modal-settings');
}

function handleSaveSettings(e) {
  e.preventDefault();
  state.backendMode = document.getElementById('settings-backend-mode').value;
  state.fastApiUrl = document.getElementById('settings-fastapi-url').value.trim();
  state.groqApiKey = document.getElementById('settings-groq-key').value.trim();

  localStorage.setItem('saveiq_backend_mode', state.backendMode);
  localStorage.setItem('saveiq_fastapi_url', state.fastApiUrl);
  localStorage.setItem('saveiq_groq_api_key', state.groqApiKey);

  loadStoredSettings();
  closeModal('modal-settings');
  notifyToast('Settings saved. Refreshing data...');
  loadData();
}

// Helpers
function notifyToast(msg) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
