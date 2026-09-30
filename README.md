# 💡 SaveIQ – AI-Powered Savings Goal Tracker

> **SaveIQ** is an intelligent personal finance and savings management platform designed to help users set, track, and achieve financial goals through personalized AI recommendations, real-time analytics, and automated deadline reminders.

---

## 🌟 Key Features

- 🎯 **Savings Goal Management**: Create, edit, and track goals (Emergency Fund, Tech Purchases, Vacations, etc.) with target amounts, current progress, deadlines, categories, and priority levels.
- 🤖 **AI-Powered Financial Insights**: Integrates with Groq Cloud (powered by **LLaMA 3.3-70B Versatile**) to generate actionable, tailored financial strategies, daily required savings calculations, and risk mitigation tips.
- ⏰ **Automated Daily Audits & Notifications**: Time-driven automation audits savings goals daily at 8:00 AM and dispatches proactive email reminders via Google Workspace / Gmail services.
- 📊 **Interactive Analytics Dashboard**: Visual breakdown of total savings, active goals, completion rates, monthly forecasts, and health statuses.
- 📄 **PDF Financial Health Reports**: Export publication-quality financial goal summaries and milestone progress statements.
- 🔒 **Enterprise-Grade Security**: Zero hardcoded secrets; API keys and database credentials are fully isolated using Google Apps Script **Script Properties** and server-side environment variables.

---

## 🏗️ Architecture & Tech Stack

```
SaveIQ Platform
├── Google Apps Script Deployment (Cloud-Native Serverless)
│   ├── Code.gs             <- Backend logic, Sheets DB connector, Groq API proxy, Cron Triggers
│   ├── Index.html          <- Responsive Material-inspired UI dashboard with glassmorphism
│   └── appsscript.json     <- Manifest with OAuth scopes (Sheets, Gmail, External Fetch)
│
├── Standalone FastAPI & Python Stack (Optional Local/Cloud Deployment)
│   ├── main.py             <- REST API routing with CORS & Swagger docs
│   ├── models.py           <- Pydantic schemas & SQLAlchemy ORM models
│   ├── database.py         <- SQLite / PostgreSQL engine & session management
│   ├── ai_engine.py        <- Groq AI client integration with caching
│   └── pdf_service.py      <- ReportLab PDF statement generation
│
└── Standalone Web Frontend
    ├── index.html          <- Pure modern HTML5 dashboard
    ├── styles.css          <- Custom CSS variables, dark-mode styling & responsive grid
    └── app.js              <- Client-side reactive state management & API client
```

---

## 🚀 Deployment Guide: Google Apps Script (Primary)

### 1. Create Google Apps Script Project
1. Navigate to [Google Apps Script](https://script.google.com/) and create a **New Project** (name it `SaveIQ`).
2. Alternatively, create a Google Sheet, click **Extensions > Apps Script** to bind the script directly to a spreadsheet.

### 2. Copy Project Files
Copy the contents of the files in `google-apps-script/` into your Apps Script project:
- Copy `google-apps-script/Code.gs` into `Code.gs`.
- Create an HTML file named `Index.html` and paste the contents of `google-apps-script/Index.html`.
- In Project Settings, enable **Show "appsscript.json" manifest file in editor**, then replace `appsscript.json` with `google-apps-script/appsscript.json`.

### 3. Securely Configure Groq API Key
1. Open your Apps Script project.
2. In the left sidebar, click **Project Settings** (gear icon ⚙️).
3. Scroll down to **Script Properties** and click **Add script property**.
4. Enter:
   - **Property**: `GROQ_API_KEY`
   - **Value**: `your_actual_groq_api_key_here` (obtained from [Groq Console](https://console.groq.com/keys))
5. Click **Save script properties**.

> ⚠️ **Security Warning**: Never commit your Groq API key or expose it in frontend code or repository commits.

### 4. Initialize Database & Automation Trigger
1. In the Apps Script code editor, select the function dropdown.
2. Select **`setupDatabaseSheets`** and click **Run**. Grant the required Google authorizations.
   - This creates and formats the `Goals`, `Transactions`, and `AuditLogs` sheets with proper schemas and starter data.
3. Select **`setupDailyAuditTrigger`** and click **Run**.
   - This sets up a daily time-driven trigger running between 8:00 AM – 9:00 AM to automatically audit deadlines and send reminder emails.

### 5. Deploy Web Application
1. Click **Deploy > New deployment** in the top right.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - **Description**: `SaveIQ Production v1.0`
   - **Execute as**: `Me (your_email@domain.com)`
   - **Who has access**: `Anyone` (or `Only myself` / domain users depending on preference)
4. Click **Deploy**. Copy the generated Web App URL to open the dashboard!

---

## 🐍 Standalone FastAPI Stack (Optional)

If you prefer running SaveIQ as a self-hosted Python service:

```bash
# Navigate to the backend directory
cd fastapi-backend

# Install dependencies
pip install -r requirements.txt

# Create environment configuration
copy .env.example .env
# Edit .env and supply your GROQ_API_KEY

# Run development server
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Access API docs at `http://127.0.0.1:8000/docs` and open `web-frontend/index.html` in your browser.

---

## 🛡️ Security & Privacy

- All sensitive keys are read via `PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY")` in Google Apps Script or `.env` in FastAPI.
- Frontend JavaScript makes secure RPC calls via `google.script.run` directly to server-side functions; the API key is never transmitted to the client browser.
- `.gitignore` prevents inadvertent tracking of virtual environments, cache files, local databases, and credentials.

---

## 📄 License
MIT License. Free for personal and educational use.
