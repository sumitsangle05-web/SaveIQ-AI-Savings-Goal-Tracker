/**
 * ============================================================================
 * SaveIQ – AI Savings Goal Tracker
 * Google Apps Script Core Engine
 * ============================================================================
 * Platform: Google Apps Script + Google Sheets + Groq API (LLaMA 3.3-70B) + Gmail
 * Version: 2.0.0
 * 
 * Features:
 *  - Full CRUD for Savings Goals & Deposit Transactions
 *  - Cloud Database in Google Sheets with Automated Schema & Validations
 *  - Groq AI Integration (LLaMA 3.3-70B Versatile) for Financial Recommendations
 *  - Real-time Dashboard Analytics & Financial Progress Metrics
 *  - Automated Daily Audit Engine with Proactive Deadline & Behind-Schedule Alerts
 *  - High-impact HTML Email Notification Services via Gmail
 *  - Web App Deployment Endpoints (doGet/doPost) for Standalone Web UI
 * ============================================================================
 */

// Global Configuration & Sheet Names
var CONFIG = {
  SHEET_GOALS: 'SaveIQ_Goals',
  SHEET_TRANSACTIONS: 'SaveIQ_Transactions',
  SHEET_AI_LOGS: 'SaveIQ_AI_Logs',
  DEFAULT_MODEL: 'llama-3.3-70b-versatile',
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  APP_NAME: 'SaveIQ AI Savings Goal Tracker',
  DAYS_NEAR_DEADLINE: 14 // Threshold in days for 'Near Deadline' status
};

/**
 * Web App entry point for serving the frontend UI or handling REST GET requests.
 */
function doGet(e) {
  // If requesting REST API data
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest(e.parameter.action, e.parameter);
  }
  
  // Default: Serve the responsive Web App HTML template
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('SaveIQ – AI Savings Goal Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Web App entry point for handling REST POST requests.
 */
function doPost(e) {
  try {
    var payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    var action = payload.action || (e.parameter ? e.parameter.action : '');
    return handleApiPostRequest(action, payload);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Router for GET API calls
 */
function handleApiRequest(action, params) {
  var result = { success: false };
  try {
    switch (action) {
      case 'getDashboard':
        result = { success: true, data: getDashboardData() };
        break;
      case 'getGoals':
        result = { success: true, data: getAllGoals() };
        break;
      case 'getGoal':
        result = { success: true, data: getGoalById(params.id) };
        break;
      case 'getAiInsight':
        result = { success: true, data: generateAiRecommendation(params.id) };
        break;
      default:
        result = { success: false, error: 'Unknown GET action: ' + action };
    }
  } catch (error) {
    result = { success: false, error: error.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Router for POST API calls
 */
function handleApiPostRequest(action, payload) {
  var result = { success: false };
  try {
    switch (action) {
      case 'createGoal':
        result = { success: true, data: createSavingsGoal(payload.goalData) };
        break;
      case 'updateGoal':
        result = { success: true, data: updateSavingsGoal(payload.goalId, payload.goalData) };
        break;
      case 'deleteGoal':
        result = { success: true, data: deleteSavingsGoal(payload.goalId) };
        break;
      case 'addDeposit':
        result = { success: true, data: addDeposit(payload.goalId, payload.amount, payload.note) };
        break;
      case 'triggerAudit':
        result = { success: true, data: runDailyFinancialAudit() };
        break;
      default:
        result = { success: false, error: 'Unknown POST action: ' + action };
    }
  } catch (error) {
    result = { success: false, error: error.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// 1. ENVIRONMENT SETUP & DATABASE INITIALIZATION
// ============================================================================

/**
 * Safely resolves the active container-bound or linked Google Spreadsheet database
 */
function getDatabaseSpreadsheet() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    // Non-container bound context
  }
  
  if (ss) {
    try {
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    } catch (err) {}
    return ss;
  }
  
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      Logger.log('Could not open spreadsheet by SPREADSHEET_ID: ' + savedId);
    }
  }
  
  // Create a new spreadsheet if none exists and save ID
  var newSs = SpreadsheetApp.create('SaveIQ_Database');
  props.setProperty('SPREADSHEET_ID', newSs.getId());
  return newSs;
}

/**
 * One-click initialization for Google Sheets database structure and formatting.
 * Run this function from the Apps Script editor upon setup.
 */
function setupDatabaseSheets() {
  var ss = getDatabaseSpreadsheet();
  
  // Setup Goals Sheet
  var goalsSheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!goalsSheet) {
    goalsSheet = ss.insertSheet(CONFIG.SHEET_GOALS);
  }
  
  var goalsHeaders = [
    'Goal ID', 'User Email', 'Goal Name', 'Category', 'Target Amount',
    'Current Savings', 'Remaining Amount', 'Deadline', 'Days Remaining',
    'Progress %', 'Status', 'Email Alerts Enabled', 'Purpose / Notes',
    'Last Alert Sent', 'Created At', 'Updated At'
  ];
  
  if (goalsSheet.getLastRow() === 0) {
    goalsSheet.appendRow(goalsHeaders);
    formatHeaderRow(goalsSheet, goalsHeaders.length);
    seedSampleGoals(goalsSheet);
  }
  
  // Setup Transactions Sheet
  var txSheet = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);
  if (!txSheet) {
    txSheet = ss.insertSheet(CONFIG.SHEET_TRANSACTIONS);
  }
  var txHeaders = [
    'Transaction ID', 'Goal ID', 'Date', 'Amount', 'Note', 'Previous Balance', 'New Balance'
  ];
  if (txSheet.getLastRow() === 0) {
    txSheet.appendRow(txHeaders);
    formatHeaderRow(txSheet, txHeaders.length);
  }
  
  // Setup AI Logs Sheet
  var aiSheet = ss.getSheetByName(CONFIG.SHEET_AI_LOGS);
  if (!aiSheet) {
    aiSheet = ss.insertSheet(CONFIG.SHEET_AI_LOGS);
  }
  var aiHeaders = [
    'Log ID', 'Goal ID', 'Timestamp', 'Prompt Tokens', 'Recommendation', 'Model'
  ];
  if (aiSheet.getLastRow() === 0) {
    aiSheet.appendRow(aiHeaders);
    formatHeaderRow(aiSheet, aiHeaders.length);
  }
  
  var result = {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    goalsCount: goalsSheet.getLastRow() - 1,
    message: 'SaveIQ Database setup verified successfully!'
  };
  Logger.log('SaveIQ Database setup completed successfully! URL: ' + ss.getUrl());
  return result;
}

/**
 * Formats table header row with brand styling
 */
function formatHeaderRow(sheet, numCols) {
  var range = sheet.getRange(1, 1, 1, numCols);
  range.setBackground('#1E293B') // Deep Slate Navy
       .setFontColor('#FFFFFF')
       .setFontWeight('bold')
       .setFontSize(10)
       .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * Seeds initial sample data for instant dashboard visualization
 */
function seedSampleGoals(sheet) {
  var userEmail = Session.getActiveUser().getEmail() || 'user@example.com';
  var today = new Date();
  
  function getFutureDate(days) {
    var d = new Date(today);
    d.setDate(d.getDate() + days);
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
  }
  
  var samples = [
    [
      'GOAL-1001', userEmail, '6-Month Emergency Fund', 'Emergency Fund', 12000,
      8400, 3600, getFutureDate(90), 90, 70.0, 'In Progress', true,
      'Maintain 6 months of living expenses in high-yield savings for safety.',
      '', new Date(), new Date()
    ],
    [
      'GOAL-1002', userEmail, 'M3 Max MacBook Pro', 'Gadget / Electronics', 3500,
      3500, 0, getFutureDate(15), 15, 100.0, 'Completed', true,
      'Workstation upgrade for high-performance development and AI engineering.',
      '', new Date(), new Date()
    ],
    [
      'GOAL-1003', userEmail, 'Tokyo & Kyoto Vacation', 'Travel & Vacation', 5000,
      1750, 3250, getFutureDate(45), 45, 35.0, 'In Progress', true,
      'Autumn foliage tour, flight tickets, ryokan accommodations.',
      '', new Date(), new Date()
    ],
    [
      'GOAL-1004', userEmail, 'Certifications & Upskilling', 'Education', 1500,
      400, 1100, getFutureDate(8), 8, 26.67, 'Near Deadline', true,
      'Cloud Architecture and AI Engineering professional certifications.',
      '', new Date(), new Date()
    ]
  ];
  
  samples.forEach(function(row) {
    sheet.appendRow(row);
  });
}

/**
 * Store Groq API key securely in Apps Script PropertiesService
 */
function setGroqApiKey(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Groq API Key cannot be empty');
  }
  PropertiesService.getScriptProperties().setProperty('GROQ_API_KEY', apiKey.trim());
  Logger.log('GROQ_API_KEY stored securely in Script Properties.');
  return 'GROQ_API_KEY updated successfully.';
}

/**
 * Retrieve Groq API key
 */
function getGroqApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY') || '';
}

// ============================================================================
// 2. SAVINGS GOAL CRUD MANAGEMENT
// ============================================================================

/**
 * Create a new savings goal
 */
function createSavingsGoal(goalData) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!sheet) {
    setupDatabaseSheets();
    sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  }
  
  var goalId = 'GOAL-' + Math.floor(100000 + Math.random() * 900000);
  var userEmail = (goalData.userEmail && goalData.userEmail.trim()) || Session.getActiveUser().getEmail() || 'user@example.com';
  var goalName = goalData.goalName || 'Untitled Goal';
  var category = goalData.category || 'General Savings';
  var targetAmount = parseFloat(goalData.targetAmount) || 0;
  var initialSavings = parseFloat(goalData.initialSavings) || 0;
  var remainingAmount = Math.max(0, targetAmount - initialSavings);
  var deadline = goalData.deadline || ''; // YYYY-MM-DD
  
  var daysRemaining = calculateDaysRemaining(deadline);
  var progressPct = targetAmount > 0 ? Math.min(100, (initialSavings / targetAmount) * 100) : 0;
  var status = evaluateGoalStatus(progressPct, daysRemaining);
  var emailAlerts = goalData.emailAlerts === true || goalData.emailAlerts === 'true';
  var purpose = goalData.purpose || '';
  var now = new Date();
  
  var newRow = [
    goalId,
    userEmail,
    goalName,
    category,
    targetAmount,
    initialSavings,
    remainingAmount,
    deadline,
    daysRemaining,
    parseFloat(progressPct.toFixed(2)),
    status,
    emailAlerts,
    purpose,
    '', // Last alert sent
    now,
    now
  ];
  
  sheet.appendRow(newRow);
  
  // If initial savings > 0, log transaction
  if (initialSavings > 0) {
    logTransaction(goalId, initialSavings, 'Initial deposit upon goal creation', 0, initialSavings);
  }
  
  return {
    goalId: goalId,
    goalName: goalName,
    targetAmount: targetAmount,
    currentSavings: initialSavings,
    remainingAmount: remainingAmount,
    progressPct: progressPct,
    status: status
  };
}

/**
 * Retrieve all goals as array of clean objects
 */
function getAllGoals() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var goals = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // Skip empty row
    
    var deadlineVal = row[7];
    var deadlineStr = '';
    if (deadlineVal instanceof Date) {
      deadlineStr = Utilities.formatDate(deadlineVal, Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
    } else {
      deadlineStr = String(deadlineVal || '');
    }
    
    var daysRemaining = calculateDaysRemaining(deadlineStr);
    var target = parseFloat(row[4]) || 0;
    var current = parseFloat(row[5]) || 0;
    var remaining = Math.max(0, target - current);
    var progress = target > 0 ? (current / target) * 100 : 0;
    var status = evaluateGoalStatus(progress, daysRemaining);
    
    goals.push({
      rowIndex: i + 1,
      goalId: String(row[0]),
      userEmail: String(row[1]),
      goalName: String(row[2]),
      category: String(row[3]),
      targetAmount: target,
      currentSavings: current,
      remainingAmount: remaining,
      deadline: deadlineStr,
      daysRemaining: daysRemaining,
      progressPct: parseFloat(progress.toFixed(2)),
      status: status,
      emailAlerts: row[11] === true || String(row[11]).toLowerCase() === 'true',
      purpose: String(row[12] || ''),
      lastAlertSent: row[13] ? String(row[13]) : '',
      createdAt: row[14] ? String(row[14]) : '',
      updatedAt: row[15] ? String(row[15]) : ''
    });
  }
  
  return goals;
}

/**
 * Get single goal by ID
 */
function getGoalById(goalId) {
  var allGoals = getAllGoals();
  for (var i = 0; i < allGoals.length; i++) {
    if (allGoals[i].goalId === goalId) {
      return allGoals[i];
    }
  }
  return null;
}

/**
 * Update an existing savings goal
 */
function updateSavingsGoal(goalId, goalData) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!sheet) throw new Error('Goals sheet not found');
  
  var data = sheet.getDataRange().getValues();
  var targetRow = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(goalId)) {
      targetRow = i + 1;
      break;
    }
  }
  
  if (targetRow === -1) {
    throw new Error('Goal not found with ID: ' + goalId);
  }
  
  var existing = data[targetRow - 1];
  var userEmail = goalData.userEmail !== undefined ? goalData.userEmail : existing[1];
  var goalName = goalData.goalName !== undefined ? goalData.goalName : existing[2];
  var category = goalData.category !== undefined ? goalData.category : existing[3];
  var targetAmount = goalData.targetAmount !== undefined ? parseFloat(goalData.targetAmount) : parseFloat(existing[4]);
  var currentSavings = goalData.currentSavings !== undefined ? parseFloat(goalData.currentSavings) : parseFloat(existing[5]);
  var deadline = goalData.deadline !== undefined ? goalData.deadline : existing[7];
  var emailAlerts = goalData.emailAlerts !== undefined ? (goalData.emailAlerts === true || goalData.emailAlerts === 'true') : existing[11];
  var purpose = goalData.purpose !== undefined ? goalData.purpose : existing[12];
  
  var remainingAmount = Math.max(0, targetAmount - currentSavings);
  var daysRemaining = calculateDaysRemaining(deadline);
  var progressPct = targetAmount > 0 ? (currentSavings / targetAmount) * 100 : 0;
  var status = evaluateGoalStatus(progressPct, daysRemaining);
  var now = new Date();
  
  sheet.getRange(targetRow, 2).setValue(userEmail);
  sheet.getRange(targetRow, 3).setValue(goalName);
  sheet.getRange(targetRow, 4).setValue(category);
  sheet.getRange(targetRow, 5).setValue(targetAmount);
  sheet.getRange(targetRow, 6).setValue(currentSavings);
  sheet.getRange(targetRow, 7).setValue(remainingAmount);
  sheet.getRange(targetRow, 8).setValue(deadline);
  sheet.getRange(targetRow, 9).setValue(daysRemaining);
  sheet.getRange(targetRow, 10).setValue(parseFloat(progressPct.toFixed(2)));
  sheet.getRange(targetRow, 11).setValue(status);
  sheet.getRange(targetRow, 12).setValue(emailAlerts);
  sheet.getRange(targetRow, 13).setValue(purpose);
  sheet.getRange(targetRow, 16).setValue(now);
  
  return {
    goalId: goalId,
    success: true,
    message: 'Goal updated successfully'
  };
}

/**
 * Delete a goal by ID
 */
function deleteSavingsGoal(goalId) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!sheet) throw new Error('Goals sheet not found');
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(goalId)) {
      sheet.deleteRow(i + 1);
      return { success: true, goalId: goalId };
    }
  }
  throw new Error('Goal not found for deletion: ' + goalId);
}

/**
 * Add a deposit to an existing goal and recalculate progress
 */
function addDeposit(goalId, amount, note) {
  var depositAmount = parseFloat(amount);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    throw new Error('Deposit amount must be a positive number');
  }
  
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!sheet) throw new Error('Goals sheet not found');
  
  var data = sheet.getDataRange().getValues();
  var targetRow = -1;
  var currentSavings = 0;
  var targetAmount = 0;
  var deadline = '';
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(goalId)) {
      targetRow = i + 1;
      targetAmount = parseFloat(data[i][4]) || 0;
      currentSavings = parseFloat(data[i][5]) || 0;
      deadline = data[i][7];
      break;
    }
  }
  
  if (targetRow === -1) {
    throw new Error('Goal not found: ' + goalId);
  }
  
  var newSavings = currentSavings + depositAmount;
  var remainingAmount = Math.max(0, targetAmount - newSavings);
  var daysRemaining = calculateDaysRemaining(deadline);
  var progressPct = targetAmount > 0 ? (newSavings / targetAmount) * 100 : 0;
  var status = evaluateGoalStatus(progressPct, daysRemaining);
  var now = new Date();
  
  sheet.getRange(targetRow, 6).setValue(newSavings);
  sheet.getRange(targetRow, 7).setValue(remainingAmount);
  sheet.getRange(targetRow, 9).setValue(daysRemaining);
  sheet.getRange(targetRow, 10).setValue(parseFloat(progressPct.toFixed(2)));
  sheet.getRange(targetRow, 11).setValue(status);
  sheet.getRange(targetRow, 16).setValue(now);
  
  // Log transaction
  logTransaction(goalId, depositAmount, note || 'Manual deposit', currentSavings, newSavings);
  
  return {
    success: true,
    goalId: goalId,
    previousSavings: currentSavings,
    newSavings: newSavings,
    remainingAmount: remainingAmount,
    progressPct: parseFloat(progressPct.toFixed(2)),
    status: status
  };
}

/**
 * Log transaction in the Transactions Sheet
 */
function logTransaction(goalId, amount, note, previousBalance, newBalance) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);
  if (!sheet) return;
  
  var txId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
  sheet.appendRow([
    txId,
    goalId,
    new Date(),
    amount,
    note || '',
    previousBalance,
    newBalance
  ]);
}

// ============================================================================
// 3. FINANCIAL CALCULATIONS & STATUS EVALUATION
// ============================================================================

/**
 * Calculates remaining days until deadline
 */
function calculateDaysRemaining(deadlineStr) {
  if (!deadlineStr) return 999;
  var target = new Date(deadlineStr);
  if (isNaN(target.getTime())) return 999;
  
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  
  var diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine goal status based on progress and remaining days
 */
function evaluateGoalStatus(progressPct, daysRemaining) {
  if (progressPct >= 100) {
    return 'Completed';
  }
  if (daysRemaining < 0) {
    return 'Overdue';
  }
  if (daysRemaining <= CONFIG.DAYS_NEAR_DEADLINE) {
    return 'Near Deadline';
  }
  return 'In Progress';
}

/**
 * Aggregates dashboard KPI metrics and distribution data
 */
function getDashboardData() {
  var goals = getAllGoals();
  
  var totalGoals = goals.length;
  var totalTarget = 0;
  var totalSaved = 0;
  var activeCount = 0;
  var completedCount = 0;
  var overdueCount = 0;
  var nearDeadlineCount = 0;
  var categoryBreakdown = {};
  
  goals.forEach(function(g) {
    totalTarget += g.targetAmount;
    totalSaved += g.currentSavings;
    
    if (g.status === 'Completed') {
      completedCount++;
    } else if (g.status === 'Overdue') {
      overdueCount++;
      activeCount++;
    } else if (g.status === 'Near Deadline') {
      nearDeadlineCount++;
      activeCount++;
    } else {
      activeCount++;
    }
    
    // Category aggregation
    var cat = g.category || 'Other';
    if (!categoryBreakdown[cat]) {
      categoryBreakdown[cat] = { count: 0, target: 0, saved: 0 };
    }
    categoryBreakdown[cat].count++;
    categoryBreakdown[cat].target += g.targetAmount;
    categoryBreakdown[cat].saved += g.currentSavings;
  });
  
  var totalRemaining = Math.max(0, totalTarget - totalSaved);
  var overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
  
  return {
    kpis: {
      totalGoals: totalGoals,
      totalTarget: totalTarget,
      totalSaved: totalSaved,
      totalRemaining: totalRemaining,
      overallProgressPct: parseFloat(overallProgress.toFixed(1)),
      activeGoals: activeCount,
      completedGoals: completedCount,
      overdueGoals: overdueCount,
      nearDeadlineGoals: nearDeadlineCount
    },
    categoryBreakdown: categoryBreakdown,
    goals: goals
  };
}

// ============================================================================
// 4. GROQ AI & LLAMA 3.3-70B RECOMMENDATION ENGINE
// ============================================================================

/**
 * Generates personalized financial advice using Groq API and LLaMA 3.3-70B Versatile
 */
function generateAiRecommendation(goalId) {
  var goal = getGoalById(goalId);
  if (!goal) {
    throw new Error('Goal not found for AI recommendation: ' + goalId);
  }
  
  var apiKey = getGroqApiKey();
  
  // Calculate financial pace
  var days = Math.max(1, goal.daysRemaining);
  var weeks = Math.max(1, Math.ceil(days / 7));
  var dailyPace = goal.remainingAmount > 0 ? (goal.remainingAmount / days).toFixed(2) : 0;
  var weeklyPace = goal.remainingAmount > 0 ? (goal.remainingAmount / weeks).toFixed(2) : 0;
  
  // If no Groq API Key is configured, return explicit configuration alert with heuristic baseline
  if (!apiKey) {
    var missingNotice = 
      "⚠️ [GROQ AI KEY REQUIRED]: GROQ_API_KEY is not set in Google Apps Script Properties.\n\n" +
      "To enable live LLaMA 3.3-70B Versatile AI insights:\n" +
      "1. Open Apps Script Editor > Project Settings (gear icon on left).\n" +
      "2. Under 'Script Properties', click 'Add script property'.\n" +
      "3. Property: GROQ_API_KEY | Value: (your Groq API key from console.groq.com/keys).\n" +
      "4. Click 'Save script properties'.\n\n" +
      "--------------------------------------------------\n" +
      "📊 BASELINE FINANCIAL GUIDANCE (Rule-Based Engine):\n\n" +
      generateHeuristicAdvice(goal, dailyPace, weeklyPace);
      
    logAiRecommendation(goalId, 'Configuration Alert', 'GROQ_API_KEY missing in Script Properties', 'Heuristic Fallback');
    return {
      goalId: goalId,
      source: 'missing_api_key_configuration',
      recommendation: missingNotice,
      financialMetrics: {
        dailyPace: dailyPace,
        weeklyPace: weeklyPace,
        daysRemaining: goal.daysRemaining
      }
    };
  }
  
  // Prompt engineering for Groq LLaMA 3.3-70B Versatile
  var systemPrompt = 
    "You are SaveIQ Financial Advisor, an elite certified financial planner (CFP) and behavioral economist. " +
    "Your objective is to provide actionable, psychologically motivating, and mathematically sound financial advice " +
    "to help users achieve their savings goals before their deadlines. " +
    "Structure your response with clear sections: " +
    "1. Executive Status & Velocity Assessment " +
    "2. Required Savings Pace (Daily & Weekly Breakdown) " +
    "3. Practical Budget Optimization Tactics (Actionable Expense Cuts) " +
    "4. Behavioral Discipline Habit (Habit Stacking / Micro-saving rule) " +
    "5. Motivational Finish Line Strategy. " +
    "Keep your tone empowering, professional, concise, and direct.";
    
  var userPrompt = 
    "Analyze the following user savings goal and generate personalized financial guidance:\n\n" +
    "- Goal Name: " + goal.goalName + "\n" +
    "- Category: " + goal.category + "\n" +
    "- Target Amount: $" + goal.targetAmount.toLocaleString() + "\n" +
    "- Current Savings: $" + goal.currentSavings.toLocaleString() + "\n" +
    "- Remaining Amount: $" + goal.remainingAmount.toLocaleString() + "\n" +
    "- Current Progress: " + goal.progressPct + "%\n" +
    "- Deadline: " + goal.deadline + " (" + goal.daysRemaining + " days remaining)\n" +
    "- Current Status: " + goal.status + "\n" +
    "- Purpose / Context: " + (goal.purpose || 'None provided') + "\n" +
    "- Calculated Daily Pace Needed: $" + dailyPace + " / day\n" +
    "- Calculated Weekly Pace Needed: $" + weeklyPace + " / week\n\n" +
    "Provide specific financial discipline tips, budgeting micro-adjustments, and a completion game plan.";

  try {
    var payload = {
      model: CONFIG.DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 800
    };
    
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(CONFIG.GROQ_API_URL, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    if (statusCode !== 200) {
      Logger.log('Groq API Error: ' + responseText);
      // Fallback to heuristic advice if API returns error (e.g. rate limit)
      var fallback = generateHeuristicAdvice(goal, dailyPace, weeklyPace);
      return {
        goalId: goalId,
        source: 'fallback_error',
        recommendation: fallback + "\n\n*(Note: Groq API returned status " + statusCode + ". Fallback guidance provided.)*",
        financialMetrics: { dailyPace: dailyPace, weeklyPace: weeklyPace, daysRemaining: goal.daysRemaining }
      };
    }
    
    var json = JSON.parse(responseText);
    var aiText = json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : 'No response from AI.';
    
    logAiRecommendation(goalId, userPrompt, aiText, CONFIG.DEFAULT_MODEL);
    
    return {
      goalId: goalId,
      source: 'groq_llama_3.3_70b',
      recommendation: aiText,
      financialMetrics: {
        dailyPace: dailyPace,
        weeklyPace: weeklyPace,
        daysRemaining: goal.daysRemaining
      }
    };
  } catch (err) {
    Logger.log('AI Generation Exception: ' + err.toString());
    var fallbackAdv = generateHeuristicAdvice(goal, dailyPace, weeklyPace);
    return {
      goalId: goalId,
      source: 'fallback_exception',
      recommendation: fallbackAdv,
      financialMetrics: { dailyPace: dailyPace, weeklyPace: weeklyPace, daysRemaining: goal.daysRemaining }
    };
  }
}

/**
 * Intelligent heuristic fallback recommendation generator
 */
function generateHeuristicAdvice(goal, dailyPace, weeklyPace) {
  var advice = "### 📊 SaveIQ AI Financial Guidance for: " + goal.goalName + "\n\n";
  
  if (goal.status === 'Completed') {
    advice += "🎉 **Congratulations! You have reached 100% of your target!**\n";
    advice += "- **Next Step**: Consider locking this capital into a short-term yield instrument or transferring it directly to your designated purchase fund.\n";
    advice += "- **Habit Momentum**: Redirect your daily savings energy towards your next milestone to build continuous wealth momentum.";
    return advice;
  }
  
  advice += "**1. Velocity & Pace Assessment**\n";
  if (goal.daysRemaining < 0) {
    advice += "⚠️ This goal is currently **Overdue** by " + Math.abs(goal.daysRemaining) + " days. You have $" + goal.remainingAmount.toLocaleString() + " left to save. Immediate re-baselining is recommended.\n\n";
  } else {
    advice += "You are **" + goal.progressPct + "%** complete with **" + goal.daysRemaining + " days** remaining.\n";
    advice += "- Daily Target: **$" + dailyPace + " / day**\n";
    advice += "- Weekly Target: **$" + weeklyPace + " / week**\n\n";
  }
  
  advice += "**2. Budget Optimization & Micro-Savings**\n";
  if (parseFloat(dailyPace) > 50) {
    advice += "- **High-Pace Strategy**: To hit $" + dailyPace + "/day, audit recurring monthly subscriptions, cut dining out by 50% this month, and allocate any freelance or unexpected cash windfalls straight to this fund.\n";
  } else {
    advice += "- **Micro-Saving Strategy**: Setting aside $" + dailyPace + "/day is equivalent to substituting one specialty beverage or casual lunch. Automate an daily recurring transfer to eliminate decision fatigue.\n";
  }
  
  advice += "\n**3. Behavioral Discipline Trigger**\n";
  advice += "- **The 72-Hour Rule**: Before making any non-essential purchase exceeding $" + dailyPace + ", wait 72 hours. If the urge passes, transfer that amount immediately into this '" + goal.goalName + "' bucket.\n";
  advice += "- **Visualization**: Track this goal visually. Celebrate every 10% progress milestone.";
  
  return advice;
}

/**
 * Logs AI recommendations to the Google Sheet audit trail
 */
function logAiRecommendation(goalId, prompt, recommendation, model) {
  try {
    var ss = getDatabaseSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_AI_LOGS);
    if (!sheet) return;
    
    var logId = 'AI-' + Math.floor(100000 + Math.random() * 900000);
    sheet.appendRow([
      logId,
      goalId,
      new Date(),
      prompt.length,
      recommendation.substring(0, 2000), // Cap length for sheet cell
      model
    ]);
  } catch (e) {
    Logger.log('Could not log AI recommendation: ' + e.message);
  }
}

// ============================================================================
// 5. AUTOMATED DAILY AUDIT & GMAIL ALERT SYSTEM
// ============================================================================

/**
 * Daily Financial Audit Engine
 * Evaluates all goals, updates statuses, and sends targeted email alerts via Gmail Services.
 */
function runDailyFinancialAudit() {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
  if (!sheet || sheet.getLastRow() < 2) {
    return { success: true, processedCount: 0, alertsSent: 0 };
  }
  
  var goals = getAllGoals();
  var alertsSent = 0;
  var auditLogs = [];
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
  
  goals.forEach(function(g) {
    var days = calculateDaysRemaining(g.deadline);
    var progress = g.targetAmount > 0 ? (g.currentSavings / g.targetAmount) * 100 : 0;
    var currentStatus = evaluateGoalStatus(progress, days);
    
    // Update Sheet row with fresh calculations
    sheet.getRange(g.rowIndex, 9).setValue(days);
    sheet.getRange(g.rowIndex, 10).setValue(parseFloat(progress.toFixed(2)));
    sheet.getRange(g.rowIndex, 11).setValue(currentStatus);
    sheet.getRange(g.rowIndex, 16).setValue(new Date());
    
    // Evaluate if alert should be sent
    var shouldAlert = false;
    var alertReason = '';
    
    if (g.emailAlerts && g.status !== 'Completed') {
      // Condition 1: Overdue
      if (days < 0) {
        shouldAlert = true;
        alertReason = 'Overdue by ' + Math.abs(days) + ' days';
      }
      // Condition 2: Near Deadline (within 14 days)
      else if (days <= CONFIG.DAYS_NEAR_DEADLINE) {
        shouldAlert = true;
        alertReason = 'Approaching deadline in ' + days + ' days';
      }
      // Condition 3: Halfway through time but less than 30% saved
      else if (days <= 30 && progress < 40) {
        shouldAlert = true;
        alertReason = 'Behind schedule pace warning';
      }
    }
    
    // Prevent duplicate emails on the same calendar day
    var lastAlertDate = g.lastAlertSent ? g.lastAlertSent.split('T')[0] : '';
    if (shouldAlert && lastAlertDate !== todayStr) {
      var sent = sendGoalAlertEmail(g, alertReason, days);
      if (sent) {
        alertsSent++;
        sheet.getRange(g.rowIndex, 14).setValue(new Date());
        auditLogs.push({ goalId: g.goalId, reason: alertReason, email: g.userEmail });
      }
    }
  });
  
  Logger.log('Daily Audit finished. Processed: ' + goals.length + ' goals. Alerts sent: ' + alertsSent);
  return {
    success: true,
    processedCount: goals.length,
    alertsSent: alertsSent,
    auditLogs: auditLogs
  };
}

/**
 * Dispatches a stylized HTML email alert to the user via Gmail/MailApp
 */
function sendGoalAlertEmail(goal, alertReason, daysRemaining) {
  if (!goal.userEmail || goal.userEmail.indexOf('@') === -1) {
    Logger.log('Invalid recipient email for goal: ' + goal.goalId);
    return false;
  }
  
  var dailyPace = daysRemaining > 0 ? (goal.remainingAmount / daysRemaining).toFixed(2) : goal.remainingAmount.toFixed(2);
  var subject = '⚠️ SaveIQ Alert: [' + goal.goalName + '] – ' + alertReason;
  
  var progressColor = goal.progressPct >= 75 ? '#10B981' : (goal.progressPct >= 40 ? '#3B82F6' : '#F59E0B');
  if (daysRemaining < 0) progressColor = '#EF4444';
  
  var htmlBody = 
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0F172A; color: #F8FAFC; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">' +
      // Header
      '<div style="background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%); padding: 28px 24px; text-align: center;">' +
        '<h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">SaveIQ Financial Discipline Audit</h1>' +
        '<p style="margin: 6px 0 0 0; font-size: 14px; color: #E0E7FF;">Your Automated AI Savings Goal Tracker</p>' +
      '</div>' +
      
      // Main Body
      '<div style="padding: 28px 24px;">' +
        '<div style="background-color: #1E293B; border-radius: 12px; padding: 20px; border-left: 4px solid ' + progressColor + '; margin-bottom: 24px;">' +
          '<span style="display: inline-block; font-size: 12px; font-weight: 600; text-transform: uppercase; color: ' + progressColor + '; letter-spacing: 0.5px;">Alert Notification</span>' +
          '<h2 style="margin: 4px 0 10px 0; font-size: 20px; color: #FFFFFF;">' + goal.goalName + '</h2>' +
          '<p style="margin: 0; font-size: 14px; color: #94A3B8;">Category: <strong style="color: #E2E8F0;">' + goal.category + '</strong> | Reason: <strong style="color: #F87171;">' + alertReason + '</strong></p>' +
        '</div>' +
        
        // Progress Bar
        '<div style="margin-bottom: 24px;">' +
          '<div style="display: flex; justify-content: space-between; font-size: 13px; color: #94A3B8; margin-bottom: 8px;">' +
            '<span>Current Progress (' + goal.progressPct + '%)</span>' +
            '<span>Target: $' + goal.targetAmount.toLocaleString() + '</span>' +
          '</div>' +
          '<div style="background-color: #334155; border-radius: 9999px; height: 12px; overflow: hidden;">' +
            '<div style="background-color: ' + progressColor + '; width: ' + Math.min(100, goal.progressPct) + '%; height: 100%; border-radius: 9999px;"></div>' +
          '</div>' +
        '</div>' +
        
        // Metric Grid
        '<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">' +
          '<tr>' +
            '<td style="background-color: #1E293B; padding: 14px; border-radius: 8px; text-align: center; width: 33%; border: 1px solid #334155;">' +
              '<div style="font-size: 11px; text-transform: uppercase; color: #94A3B8; font-weight: 600;">Saved So Far</div>' +
              '<div style="font-size: 18px; font-weight: 700; color: #10B981; margin-top: 4px;">$' + goal.currentSavings.toLocaleString() + '</div>' +
            '</td>' +
            '<td style="width: 10px;"></td>' +
            '<td style="background-color: #1E293B; padding: 14px; border-radius: 8px; text-align: center; width: 33%; border: 1px solid #334155;">' +
              '<div style="font-size: 11px; text-transform: uppercase; color: #94A3B8; font-weight: 600;">Remaining</div>' +
              '<div style="font-size: 18px; font-weight: 700; color: #F59E0B; margin-top: 4px;">$' + goal.remainingAmount.toLocaleString() + '</div>' +
            '</td>' +
            '<td style="width: 10px;"></td>' +
            '<td style="background-color: #1E293B; padding: 14px; border-radius: 8px; text-align: center; width: 33%; border: 1px solid #334155;">' +
              '<div style="font-size: 11px; text-transform: uppercase; color: #94A3B8; font-weight: 600;">Days Left</div>' +
              '<div style="font-size: 18px; font-weight: 700; color: ' + (daysRemaining < 0 ? '#EF4444' : '#60A5FA') + '; margin-top: 4px;">' + daysRemaining + '</div>' +
            '</td>' +
          '</tr>' +
        '</table>' +
        
        // AI Action Recommendation
        '<div style="background-color: #1E293B; border-radius: 12px; padding: 20px; border: 1px solid #3B82F6; margin-bottom: 24px;">' +
          '<h3 style="margin: 0 0 10px 0; font-size: 15px; color: #60A5FA;">🤖 SaveIQ AI Pace Recommendation</h3>' +
          '<p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.5; color: #CBD5E1;">To hit your goal by <strong>' + goal.deadline + '</strong>, your recommended savings speed is:</p>' +
          '<div style="font-size: 20px; font-weight: 700; color: #F8FAFC; margin-bottom: 8px;">$' + dailyPace + ' <span style="font-size: 13px; font-weight: 400; color: #94A3B8;">/ day</span></div>' +
          '<p style="margin: 0; font-size: 13px; color: #94A3B8;">Tip: Automate this transfer now to eliminate friction and protect your savings streak.</p>' +
        '</div>' +
        
        // Purpose/Notes if any
        (goal.purpose ? '<p style="font-size: 13px; color: #64748B; margin-bottom: 20px; font-style: italic;">Purpose: &ldquo;' + goal.purpose + '&rdquo;</p>' : '') +
      '</div>' +
      
      // Footer
      '<div style="background-color: #0B0F19; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #334155;">' +
        'Sent automatically by SaveIQ Daily Audit Engine &bull; Built with Google Apps Script & Groq AI' +
      '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({
      to: goal.userEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    Logger.log('Alert email dispatched to ' + goal.userEmail + ' for ' + goal.goalName);
    return true;
  } catch (err) {
    Logger.log('Failed to send email to ' + goal.userEmail + ': ' + err.toString());
    return false;
  }
}

// ============================================================================
// 6. TRIGGER MANAGEMENT (AUTOMATION)
// ============================================================================

/**
 * Installs daily automated trigger running at 8:00 AM every day
 */
function setupDailyAuditTrigger() {
  // Clear any existing audit triggers first
  removeAuditTriggers();
  
  ScriptApp.newTrigger('runDailyFinancialAudit')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
    
  Logger.log('Daily audit trigger scheduled successfully for 8:00 AM daily.');
  return 'Daily audit trigger scheduled successfully for 8:00 AM daily.';
}

/**
 * Removes all instances of the daily audit trigger
 */
function removeAuditTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyFinancialAudit') {
      ScriptApp.deleteTrigger(triggers[i]);
      count++;
    }
  }
  Logger.log('Removed ' + count + ' existing audit trigger(s).');
  return count;
}

// ============================================================================
// 7. COMPREHENSIVE AUTOMATED TESTING & DIAGNOSTICS
// ============================================================================

/**
 * Diagnostic test suite for verifying SaveIQ end-to-end functionality.
 * Run this function from the Apps Script editor to validate database,
 * metrics, triggers, and Groq configuration.
 */
function runSaveIQDiagnostics() {
  var report = {
    timestamp: new Date().toISOString(),
    tests: {},
    summary: { passed: 0, warnings: 0, failed: 0 }
  };
  
  // Test 1: Database Spreadsheet & Sheets Validation
  try {
    var ss = getDatabaseSpreadsheet();
    var goalsSheet = ss.getSheetByName(CONFIG.SHEET_GOALS);
    var txSheet = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);
    var aiSheet = ss.getSheetByName(CONFIG.SHEET_AI_LOGS);
    
    if (goalsSheet && txSheet && aiSheet) {
      report.tests.database = {
        status: 'PASSED',
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        goalsRowCount: goalsSheet.getLastRow(),
        transactionsRowCount: txSheet.getLastRow(),
        aiLogsRowCount: aiSheet.getLastRow()
      };
      report.summary.passed++;
    } else {
      report.tests.database = {
        status: 'FAILED',
        error: 'One or more database sheets are missing. Run setupDatabaseSheets() to provision.'
      };
      report.summary.failed++;
    }
  } catch (err) {
    report.tests.database = { status: 'FAILED', error: err.toString() };
    report.summary.failed++;
  }
  
  // Test 2: Goals Retrieval & Calculation
  try {
    var goals = getAllGoals();
    var dashboard = getDashboardData();
    report.tests.dashboardMetrics = {
      status: 'PASSED',
      goalsCount: goals.length,
      totalTarget: dashboard.kpis.totalTarget,
      totalSaved: dashboard.kpis.totalSaved,
      overallProgress: dashboard.kpis.overallProgressPct + '%'
    };
    report.summary.passed++;
  } catch (err) {
    report.tests.dashboardMetrics = { status: 'FAILED', error: err.toString() };
    report.summary.failed++;
  }
  
  // Test 3: Groq API Key Configuration Check
  try {
    var apiKey = getGroqApiKey();
    if (apiKey && apiKey.length > 5) {
      report.tests.groqApiKey = {
        status: 'PASSED',
        configured: true,
        model: CONFIG.DEFAULT_MODEL
      };
      report.summary.passed++;
    } else {
      report.tests.groqApiKey = {
        status: 'WARNING',
        configured: false,
        message: 'GROQ_API_KEY is not set in Script Properties. Heuristic rules engine active.'
      };
      report.summary.warnings++;
    }
  } catch (err) {
    report.tests.groqApiKey = { status: 'FAILED', error: err.toString() };
    report.summary.failed++;
  }
  
  // Test 4: Daily Audit Trigger Validation
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var auditTriggerFound = false;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runDailyFinancialAudit') {
        auditTriggerFound = true;
        break;
      }
    }
    if (auditTriggerFound) {
      report.tests.auditTrigger = {
        status: 'PASSED',
        installed: true,
        handler: 'runDailyFinancialAudit'
      };
      report.summary.passed++;
    } else {
      report.tests.auditTrigger = {
        status: 'WARNING',
        installed: false,
        message: 'Daily audit trigger not yet installed. Run setupDailyAuditTrigger() to schedule.'
      };
      report.summary.warnings++;
    }
  } catch (err) {
    report.tests.auditTrigger = { status: 'FAILED', error: err.toString() };
    report.summary.failed++;
  }
  
  Logger.log('=== SaveIQ Diagnostic Report ===\n' + JSON.stringify(report, null, 2));
  return report;
}
