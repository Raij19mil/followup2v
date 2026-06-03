import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { createId } from '@paralleldrive/cuid2'

dotenv.config()

const app = express()
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

app.use(cors())
app.use(express.json())

// ─── CLIENTES ────────────────────────────────────────────────────────────────

app.get('/api/:conta/clients', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clientes WHERE conta_slug = $1 ORDER BY criado_em DESC',
      [req.params.conta]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/:conta/clients', async (req, res) => {
  try {
    const { nome, phone, email, source = 'manual', tags = [], notes } = req.body
    const { rows } = await pool.query(
      `INSERT INTO clientes (id, conta_slug, nome, phone, email, source, tags, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [createId(), req.params.conta, nome, phone, email, source, tags, notes]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/api/:conta/clients/:id', async (req, res) => {
  try {
    const { nome, phone, email, tags, notes } = req.body
    const { rows } = await pool.query(
      `UPDATE clientes SET nome=$1, phone=$2, email=$3, tags=$4, notes=$5
       WHERE id=$6 AND conta_slug=$7 RETURNING *`,
      [nome, phone, email, tags, notes, req.params.id, req.params.conta]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/:conta/clients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clientes WHERE id=$1 AND conta_slug=$2', [req.params.id, req.params.conta])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── AGENDAMENTOS ─────────────────────────────────────────────────────────────

app.get('/api/:conta/schedules', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM agendamentos WHERE conta_slug=$1 ORDER BY agendado_para ASC',
      [req.params.conta]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/:conta/schedules', async (req, res) => {
  try {
    const { cliente_id, mensagem, canal = 'whatsapp', agendado_para } = req.body
    const { rows } = await pool.query(
      `INSERT INTO agendamentos (id, conta_slug, cliente_id, mensagem, canal, agendado_para)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [createId(), req.params.conta, cliente_id, mensagem, canal, agendado_para]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/:conta/schedules/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM agendamentos WHERE id=$1 AND conta_slug=$2', [req.params.id, req.params.conta])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── MENSAGENS ────────────────────────────────────────────────────────────────

app.get('/api/:conta/messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM mensagens WHERE conta_slug=$1 ORDER BY criado_em DESC',
      [req.params.conta]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── WEBHOOKS CONFIG ──────────────────────────────────────────────────────────

app.get('/api/:conta/webhooks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM webhooks WHERE conta_slug=$1 ORDER BY criado_em DESC',
      [req.params.conta]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/:conta/webhooks', async (req, res) => {
  try {
    const { nome, descricao, auto_schedule, schedule_days } = req.body
    const token = Math.random().toString(36).substring(2, 16)
    const { rows } = await pool.query(
      `INSERT INTO webhooks (id, conta_slug, nome, descricao, token, auto_schedule, schedule_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [createId(), req.params.conta, nome, descricao, token, auto_schedule, schedule_days]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── WEBHOOK LOGS ─────────────────────────────────────────────────────────────

app.get('/api/:conta/webhooks/logs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM webhook_logs WHERE conta_slug=$1 ORDER BY received_at DESC LIMIT 50',
      [req.params.conta]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── RECEBER WEBHOOK EXTERNO (Chatwoot / Evolution API) ───────────────────────

app.post('/webhook/:conta/:token', async (req, res) => {
  try {
    const { conta, token } = req.params
    const payload = req.body

    // Verificar se o webhook existe e está ativo
    const { rows: wh } = await pool.query(
      'SELECT * FROM webhooks WHERE conta_slug=$1 AND token=$2 AND active=true',
      [conta, token]
    )
    if (!wh.length) return res.status(404).json({ error: 'Webhook não encontrado' })

    const webhook = wh[0]
    let action = 'Evento recebido'
    let clienteId = null

    // Processar evento contact_created do Chatwoot
    if (payload.event === 'contact_created' || payload.event === 'conversation_created') {
      const contact = payload.contact || {}
      const nome = contact.name || 'Sem nome'
      const phone = contact.phone_number || contact.phone || ''
      const email = contact.email || ''
      const chatwootId = contact.id || null
      const conversationId = payload.conversationId || payload.conversation?.id || null

      // Verificar se cliente já existe pelo telefone
      const { rows: existing } = await pool.query(
        'SELECT * FROM clientes WHERE conta_slug=$1 AND phone=$2',
        [conta, phone]
      )

      if (existing.length) {
        // Atualizar cliente existente
        await pool.query(
          `UPDATE clientes SET messages_received = messages_received + 1, last_webhook_at=NOW()
           WHERE id=$1`,
          [existing[0].id]
        )
        clienteId = existing[0].id
        action = `Cliente existente atualizado (${existing[0].messages_received + 1} mensagens recebidas)`
      } else {
        // Criar novo cliente
        const newId = createId()
        await pool.query(
          `INSERT INTO clientes (id, conta_slug, nome, phone, email, source, tags, notes, chatwoot_id, chatwoot_conversation_id, last_webhook_at)
           VALUES ($1,$2,$3,$4,$5,'webhook','{webhook}',$6,$7,$8,NOW())`,
          [newId, conta, nome, phone, email, `Cadastrado automaticamente via webhook`, chatwootId, conversationId]
        )
        clienteId = newId
        action = 'Novo cliente cadastrado via webhook'
      }
    }

    // Salvar log
    await pool.query(
      `INSERT INTO webhook_logs (id, conta_slug, webhook_id, webhook_name, payload, status, action)
       VALUES ($1,$2,$3,$4,$5,'processed',$6)`,
      [createId(), conta, webhook.id, webhook.nome, JSON.stringify(payload), action]
    )

    res.json({ ok: true, action, clienteId })
  } catch (e) {
    console.error('Webhook error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ─── INTEGRAÇÕES ──────────────────────────────────────────────────────────────

app.get('/api/:conta/integrations', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM integracoes WHERE conta_slug=$1',
      [req.params.conta]
    )
    res.json(rows[0] || {})
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/api/:conta/integrations', async (req, res) => {
  try {
    const { chatwoot_url, chatwoot_token, evolution_url, evolution_key } = req.body
    const { rows } = await pool.query(
      `INSERT INTO integracoes (conta_slug, chatwoot_url, chatwoot_token, evolution_url, evolution_key)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (conta_slug) DO UPDATE
       SET chatwoot_url=$2, chatwoot_token=$3, evolution_url=$4, evolution_key=$5, atualizado_em=NOW()
       RETURNING *`,
      [req.params.conta, chatwoot_url, chatwoot_token, evolution_url, evolution_key]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── PROXY CHATWOOT (evita CORS no browser) ───────────────────────────────────

app.get('/api/:conta/chatwoot/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT chatwoot_url, chatwoot_token FROM integracoes WHERE conta_slug=$1',
      [req.params.conta]
    )
    const integ = rows[0]
    if (!integ?.chatwoot_url) return res.status(400).json({ error: 'Chatwoot não configurado' })

    const q = req.query.q || ''
    const response = await fetch(
      `${integ.chatwoot_url}/api/v1/accounts/1/contacts/search?q=${encodeURIComponent(q)}&page=1`,
      { headers: { api_access_token: integ.chatwoot_token } }
    )
    const data = await response.json()
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on :${PORT}`))

export default app
