# Human-in-the-loop (MERN + Python agent)

This is a minimal, locally running system that simulates phone calls to an AI agent, escalates unknown questions to a human supervisor, follows up with the caller, and updates a knowledge base.

## Stack
- Backend: Node.js/Express + LowDB (JSON)
- UI: React + Vite (admin panel)
- Agent: Python FastAPI stub (simulated LiveKit agent)

## Features
- AI agent can answer basic salon questions, otherwise escalates with a help request
- Supervisor admin can view pending/resolved/unresolved requests and answer them
- Immediate follow-up to the caller (console log) on supervisor response
- Knowledge base auto-updates on each resolution, with a simple view
- Request lifecycle: pending → resolved/unresolved (with timeout sweeper)

## Getting Started

### 1) Backend
```
cd server
npm install
npm run dev
```
Server runs on http://localhost:3001

### 2) UI
```
cd client
npm install
npm run dev
```
UI runs on http://localhost:5173 (proxy to /api → http://localhost:3001)

### 3) Agent (Python)
```
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set SERVER_URL=http://localhost:3001
uvicorn app:app --reload --port 8000
```

Simulate a call:
```
curl -X POST http://localhost:8000/simulate_call -H "Content-Type: application/json" -d '{"caller_id":"+15551234567","question":"Do you offer balayage?"}'
```

### Endpoints (Backend)
- POST `/api/requests` { callerId, question }
  - If known: returns `{ handled: true, answer }`
  - Else: creates pending request, logs supervisor notification
- GET `/api/requests?status=pending|resolved|unresolved`
- POST `/api/requests/:id/answer` { answer }
  - Resolves, updates KB, logs follow-up to caller
- POST `/api/requests/:id/unresolved`
- GET `/api/knowledge`
- GET `/health`

### Design Notes
- Help Request model: `{ id, callerId, question, status, createdAt, resolvedAt?, answer? }`
- Knowledge model: `{ id, question, answer, createdAt }`
- Timeout sweeper marks pending requests older than 2 minutes as unresolved
- Scaling: swap LowDB for a real DB, add job queue for timeouts/notifications, add auth for admin, horizontal scale via stateless backend

### LiveKit
The agent is a simple stub now to keep local setup easy. You can replace the FastAPI routes with LiveKit Agents SDK to receive real calls and invoke the backend the same way.
