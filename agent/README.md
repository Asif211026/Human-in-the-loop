# Agent

Quick start:

1. Create venv and install deps:

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Run:

```
set SERVER_URL=http://localhost:3001
uvicorn app:app --reload --port 8000
```

3. Simulate a call (in another shell):

```
curl -X POST http://localhost:8000/simulate_call -H "Content-Type: application/json" -d "{\"caller_id\":\"+15551234567\",\"question\":\"Do you offer balayage?\"}"
```

This will escalate if unknown and create a help request on the backend.


