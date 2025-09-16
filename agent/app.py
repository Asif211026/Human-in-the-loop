from fastapi import FastAPI
from pydantic import BaseModel
import requests
import os

app = FastAPI()

SERVER_URL = os.getenv('SERVER_URL', 'http://localhost:3001')

class Call(BaseModel):
    caller_id: str
    question: str

def salon_prompt():
    return (
        "You are the AI receptionist for 'Glow & Go Salon'. "
        "Known info: Open Mon-Fri 9am-6pm, Sat 10am-4pm, closed Sun. "
        "Basic services: haircut $40, color $80, manicure $25. "
        "If you don't know, say: 'Let me check with my supervisor and get back to you.'"
    )

def knows_answer(question: str) -> bool:
    q = question.lower()
    if 'open' in q or 'hours' in q:
        return True
    if 'price' in q or 'cost' in q or 'haircut' in q or 'manicure' in q or 'color' in q:
        return True
    return False

def answer_question(question: str) -> str:
    q = question.lower()
    if 'open' in q or 'hours' in q:
        return 'We are open Mon-Fri 9am-6pm and Sat 10am-4pm; closed Sun.'
    if 'haircut' in q:
        return 'A haircut is $40.'
    if 'manicure' in q:
        return 'A manicure is $25.'
    if 'color' in q or 'colour' in q:
        return 'Hair color is $80.'
    return ''

@app.get('/health')
def health():
    return {'ok': True}

@app.post('/simulate_call')
def simulate_call(call: Call):
    _ = salon_prompt()
    # first, try backend knowledge base
    resp = requests.post(f"{SERVER_URL}/api/requests", json={'callerId': call.caller_id, 'question': call.question})
    if resp.ok:
        data = resp.json()
        if isinstance(data, dict) and data.get('handled'):
            print(f"[agent->caller {call.caller_id}] {data.get('answer')}")
            return { 'status': 'answered', 'answer': data.get('answer') }

    # if not known, try simple built-in knowledge; otherwise create help request
    if knows_answer(call.question):
        ans = answer_question(call.question)
        print(f"[agent->caller {call.caller_id}] {ans}")
        return { 'status': 'answered', 'answer': ans }

    print("[agent] Let me check with my supervisor and get back to you.")
    # ensure a help request exists (if previous call returned a created request)
    if resp.ok and isinstance(resp.json(), dict) and resp.json().get('id'):
        req_id = resp.json()['id']
        return { 'status': 'escalated', 'requestId': req_id }
    else:
        # fallback create
        r2 = requests.post(f"{SERVER_URL}/api/requests", json={'callerId': call.caller_id, 'question': call.question})
        if r2.ok:
            return { 'status': 'escalated', 'requestId': r2.json().get('id') }
    return { 'status': 'error' }


