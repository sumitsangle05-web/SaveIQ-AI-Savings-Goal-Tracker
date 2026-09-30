# SaveIQ FastAPI Backend & Microservices

This backend provides high-performance REST APIs, database persistence (SQLite/PostgreSQL/Supabase), AI financial reasoning via Groq (LLaMA 3.3-70B Versatile), and ReportLab PDF statement generation matching the system architecture diagram.

---

## 🏗️ Architecture

```
[Web Frontend (HTML/JS)] <--- HTTP / JSON ---> [FastAPI Backend]
                                                   |
                     +-----------------------------+-----------------------------+
                     |                             |                             |
             [Groq AI Engine]             [Database Layer]             [PDF Service]
           (LLaMA 3.3-70B / OpenAI)    (PostgreSQL / SQLite / Supabase)       (ReportLab)
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your `GROQ_API_KEY` from [Groq Console](https://console.groq.com/keys).

### 3. Run FastAPI Development Server
```bash
uvicorn main:app --reload --port 8000
```

### 4. Interactive API Documentation
Open your browser at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard` | Returns overall KPIs, category distributions, and goal lists |
| `GET` | `/api/goals` | Lists all active savings goals |
| `POST` | `/api/goals` | Creates a new savings goal |
| `GET` | `/api/goals/{id}` | Fetches goal details |
| `PUT` | `/api/goals/{id}` | Updates existing savings goal |
| `DELETE` | `/api/goals/{id}` | Removes a savings goal |
| `POST` | `/api/goals/{id}/deposit` | Records a new deposit and recalculates progress |
| `POST` | `/api/goals/{id}/ai-insights` | Invokes Groq LLaMA 3.3-70B for financial coaching |
| `GET` | `/api/reports/summary-pdf` | Streams downloadable PDF executive financial statement |
| `GET` | `/api/reports/goal-pdf/{id}` | Streams in-depth single goal audit report PDF |
| `POST` | `/api/audit-trigger` | Executes automated audit checks and alert detection |
