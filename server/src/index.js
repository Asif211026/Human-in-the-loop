import express from 'express';
import cors from 'cors';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// DB setup
const adapter = new JSONFile('data.json');
const db = new Low(adapter, { requests: [], knowledge: [] });
await db.read();
db.data ||= { requests: [], knowledge: [] };

// Schemas
const HelpRequestSchema = z.object({
    id: z.string(),
    callerId: z.string(),
    question: z.string(),
    status: z.enum(['pending', 'resolved', 'unresolved']),
    createdAt: z.string(),
    resolvedAt: z.string().optional(),
    answer: z.string().optional()
});

const KnowledgeItemSchema = z.object({
    id: z.string(),
    question: z.string(),
    answer: z.string(),
    createdAt: z.string()
});

// Utility: simple knowledge lookup
function findAnswer(question) {
    const q = question.trim().toLowerCase();
    const item = db.data.knowledge.find(k => q.includes(k.question.trim().toLowerCase()) || k.question.trim().toLowerCase().includes(q));
    return item?.answer;
}

// Create request
app.post('/api/requests', async (req, res) => {
    const { callerId, question } = req.body || {};
    if (!callerId || !question) return res.status(400).json({ error: 'callerId and question required' });

    // check KB first
    const known = findAnswer(question);
    if (known) {
        return res.json({ handled: true, answer: known });
    }

    const newReq = {
        id: uuidv4(),
        callerId,
        question,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    db.data.requests.unshift(newReq);
    await db.write();

    console.log(`[notify supervisor] Hey, I need help answering: "${question}" (requestId=${newReq.id})`);
    return res.status(201).json(newReq);
});

// List requests (optionally filter by status)
app.get('/api/requests', (req, res) => {
    const { status } = req.query;
    let items = db.data.requests;
    if (status && ['pending', 'resolved', 'unresolved'].includes(status)) {
        items = items.filter(r => r.status === status);
    }
    res.json(items);
});

// Get single request by id
app.get('/api/requests/:id', (req, res) => {
    const { id } = req.params;
    const reqItem = db.data.requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'not found' });
    res.json(reqItem);
});

// Resolve request with answer
app.post('/api/requests/:id/answer', async (req, res) => {
    const { id } = req.params;
    const { answer } = req.body || {};
    if (!answer) return res.status(400).json({ error: 'answer required' });
    const reqItem = db.data.requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'not found' });
    if (reqItem.status !== 'pending') return res.status(409).json({ error: 'already handled' });

    reqItem.status = 'resolved';
    reqItem.answer = answer;
    reqItem.resolvedAt = new Date().toISOString();

    // Update KB
    db.data.knowledge.unshift({
        id: uuidv4(),
        question: reqItem.question,
        answer,
        createdAt: new Date().toISOString()
    });
    await db.write();

    console.log(`[text caller ${reqItem.callerId}] Thanks for waiting. Here is the answer: ${answer}`);
    res.json(reqItem);
});

// Mark unresolved (timeout)
app.post('/api/requests/:id/unresolved', async (req, res) => {
    const { id } = req.params;
    const reqItem = db.data.requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'not found' });
    if (reqItem.status !== 'pending') return res.status(409).json({ error: 'already handled' });
    reqItem.status = 'unresolved';
    reqItem.resolvedAt = new Date().toISOString();
    await db.write();
    res.json(reqItem);
});

// Knowledge endpoints
app.get('/api/knowledge', (req, res) => {
    res.json(db.data.knowledge);
});

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});

// Timeout sweep: mark pending items older than TIMEOUT_MS as unresolved
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 2 * 60 * 1000);
setInterval(async () => {
    const now = Date.now();
    let changed = false;
    for (const r of db.data.requests) {
        if (r.status === 'pending') {
            const age = now - new Date(r.createdAt).getTime();
            if (age > TIMEOUT_MS) {
                r.status = 'unresolved';
                r.resolvedAt = new Date().toISOString();
                changed = true;
            }
        }
    }
    if (changed) {
        await db.write();
    }
}, 10 * 1000);
