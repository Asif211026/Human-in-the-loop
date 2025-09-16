import React, { useEffect, useMemo, useState } from 'react'
import './styles.css'

const API = '/api'

function useRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const refresh = async (status) => {
    try {
      setLoading(true)
      const url = status ? `${API}/requests?status=${status}` : `${API}/requests`
      const res = await fetch(url)
      const data = await res.json()
      setRequests(data)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }
  return { requests, loading, error, refresh }
}

function useKnowledge() {
  const [items, setItems] = useState([])
  const refresh = async () => {
    const res = await fetch(`${API}/knowledge`)
    setItems(await res.json())
  }
  return { items, refresh }
}

export default function App() {
  const [mode, setMode] = useState('admin') // 'admin' | 'chat'
  const [tab, setTab] = useState('pending')
  const { requests, loading, refresh } = useRequests()
  const { items, refresh: refreshKb } = useKnowledge()
  const [activeEditId, setActiveEditId] = useState(null)
  const [query, setQuery] = useState('')
  const [chatLog, setChatLog] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [pendingReqId, setPendingReqId] = useState(null)

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return requests
    return requests.filter(r =>
      r.question.toLowerCase().includes(q) ||
      r.callerId.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    )
  }, [requests, query])

  useEffect(() => {
    if (!activeEditId) {
      refresh(tab === 'all' ? undefined : tab)
    }
    refreshKb()
    if (activeEditId) return
    const id = setInterval(() => {
      if (!activeEditId) {
        refresh(tab === 'all' ? undefined : tab)
      }
      refreshKb()
    }, 4000)
    return () => clearInterval(id)
  }, [tab, activeEditId])

  // Poll a single pending request to surface supervisor reply into chat
  useEffect(() => {
    if (!pendingReqId) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API}/requests/${pendingReqId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'resolved' && data.answer) {
          setChatLog(log => [...log, { from: 'agent', text: `Follow-up: ${data.answer}` }])
          setPendingReqId(null)
        } else if (data.status === 'unresolved') {
          setChatLog(log => [...log, { from: 'agent', text: 'Sorry, we could not get an answer right now.' }])
          setPendingReqId(null)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(id)
  }, [pendingReqId])

  const sendChat = async () => {
    const question = chatInput.trim()
    if (!question) return
    setChatLog(log => [...log, { from: 'you', text: question }])
    setChatInput('')
    try {
      const resp = await fetch(`${API}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: '+web', question })
      })
      const data = await resp.json()
      if (data && data.handled && data.answer) {
        setChatLog(log => [...log, { from: 'agent', text: data.answer }])
        return
      }
      // built-in quick answers mirror
      const q = question.toLowerCase()
      let ans = ''
      if (q.includes('open') || q.includes('hours')) ans = 'We are open Mon-Fri 9am-6pm and Sat 10am-4pm; closed Sun.'
      else if (q.includes('haircut')) ans = 'A haircut is $40.'
      else if (q.includes('manicure')) ans = 'A manicure is $25.'
      else if (q.includes('color') || q.includes('colour')) ans = 'Hair color is $80.'
      if (ans) {
        setChatLog(log => [...log, { from: 'agent', text: ans }])
      } else if (data && data.id) {
        setChatLog(log => [...log, { from: 'agent', text: 'Let me check with my supervisor and get back to you.' }])
        setPendingReqId(data.id)
      } else {
        setChatLog(log => [...log, { from: 'agent', text: 'Something went wrong. Please try again.' }])
      }
    } catch {
      setChatLog(log => [...log, { from: 'agent', text: 'Network error. Please try again.' }])
    }
  }

  const onAnswer = async (id, answer) => {
    await fetch(`${API}/requests/${id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    })
    await refresh(tab === 'all' ? undefined : tab)
    await refreshKb()
    setActiveEditId(null)
  }

  return (
    <div className="container" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="toolbar">
        <button className={`btn ${mode==='admin'?'active':''}`} onClick={()=>setMode('admin')}>Admin</button>
        <button className={`btn ${mode==='chat'?'active':''}`} onClick={()=>setMode('chat')}>Bot Chat</button>
      </div>

      {mode === 'chat' ? (
        <div className="panel chat">
          <div className="chat-log">
            {chatLog.length === 0 ? (
              <div className="chat-line" style={{ color: '#8fa3bf' }}>Ask a question to the bot to get started.</div>
            ) : null}
            {chatLog.map((m, i) => (
              <div key={i} className="chat-line"><b>{m.from==='you'?'You':'Agent'}:</b> {m.text}</div>
            ))}
          </div>
          <div className="chat-input">
            <input className="input" placeholder="Ask the bot..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') sendChat() }} />
            <button className="btn" onClick={sendChat} disabled={!chatInput.trim()}>Send</button>
          </div>
        </div>
      ) : null}

      {mode === 'admin' ? (
      <>
      <h2>Supervisor Admin</h2>
      <div className="toolbar">
        {['pending','resolved','unresolved','all'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab===t?'active':''}`}>{t}</button>
        ))}
        <div className="search"><input placeholder="Search question or caller..." onChange={(e)=>setQuery(e.target.value)} /></div>
      </div>
      {loading ? <div>Loading...</div> : (
        <table>
          <thead>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Caller</th>
              <th style={th}>Question</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map(r => (
              <Row
                key={r.id}
                r={r}
                isEditing={activeEditId === r.id}
                onStartEdit={() => setActiveEditId(r.id)}
                onCancelEdit={() => setActiveEditId(null)}
                onAnswer={onAnswer}
              />
            ))}
          </tbody>
        </table>
      )}

      <h3>Learned Answers</h3>
      <div className="panel">
        <ul>
          {items.map(k => (
            <li key={k.id}><b>{k.question}</b>: {k.answer}</li>
          ))}
        </ul>
      </div>
      </>
      ) : null}
    </div>
  )
}

function Row({ r, isEditing, onStartEdit, onCancelEdit, onAnswer }) {
  const [answer, setAnswer] = useState('')
  return (
    <tr>
      <td style={td}>{r.id.slice(0,8)}</td>
      <td style={td}>{r.callerId}</td>
      <td style={td}>{r.question}</td>
      <td style={td}><span className={`badge ${r.status}`}>{r.status}</span></td>
      <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
      <td style={td}>
        {r.status === 'pending' ? (
          isEditing ? (
            <div style={{ display:'flex', gap: 8 }}>
              <input
                autoFocus
                value={answer}
                onChange={e=>setAnswer(e.target.value)}
                onKeyDown={(e)=>{ if(e.key==='Enter' && answer.trim()) { onAnswer(r.id, answer); setAnswer('') }}}
                placeholder="Type answer"
                style={{ flex:1 }}
              />
              <button onClick={()=>{ onAnswer(r.id, answer); setAnswer('') }} disabled={!answer.trim()}>Send</button>
              <button onClick={()=>{ onCancelEdit(); setAnswer('') }}>Cancel</button>
            </div>
          ) : (
            <button onClick={onStartEdit}>Answer</button>
          )
        ) : (
          r.answer ? r.answer : '-'
        )}
      </td>
    </tr>
  )
}

const th = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }
const td = { borderBottom: '1px solid #f0f0f0', padding: 6 }


