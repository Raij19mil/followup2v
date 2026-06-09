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

app.post('/api/:conta/messages', async (req, res) => {
  try {
    const { nome, conteudo, canal = 'whatsapp' } = req.body
    const { rows } = await pool.query(
      `INSERT INTO mensagens (id, conta_slug, nome, conteudo, canal)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [createId(), req.params.conta, nome, conteudo, canal]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/api/:conta/messages/:id', async (req, res) => {
  try {
    const { nome, conteudo, canal } = req.body
    const { rows } = await pool.query(
      `UPDATE mensagens SET nome=$1, conteudo=$2, canal=$3
       WHERE id=$4 AND conta_slug=$5 RETURNING *`,
      [nome, conteudo, canal, req.params.id, req.params.conta]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/:conta/messages/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM mensagens WHERE id=$1 AND conta_slug=$2', [req.params.id, req.params.conta])
    res.json({ ok: true })
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
    const { nome, descricao, auto_schedule, schedule_days, tipo = 'evento' } = req.body
    const token = Math.random().toString(36).substring(2, 16)
    const { rows } = await pool.query(
      `INSERT INTO webhooks (id, conta_slug, nome, descricao, token, auto_schedule, schedule_days, tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [createId(), req.params.conta, nome, descricao, token, auto_schedule, schedule_days, tipo]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── WEBHOOK MENSAGENS (vínculos webhook↔mensagem) ────────────────────────────

app.get('/api/:conta/webhooks/:webhookId/messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wm.*, m.nome as mensagem_nome, m.conteudo, m.canal
       FROM webhook_mensagens wm
       JOIN mensagens m ON m.id = wm.mensagem_id
       WHERE wm.conta_slug=$1 AND wm.webhook_id=$2
       ORDER BY wm.dias_offset ASC`,
      [req.params.conta, req.params.webhookId]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/:conta/webhooks/:webhookId/messages', async (req, res) => {
  try {
    const { mensagem_id, dias_offset = 1 } = req.body
    const { rows } = await pool.query(
      `INSERT INTO webhook_mensagens (id, webhook_id, mensagem_id, dias_offset, conta_slug)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [createId(), req.params.webhookId, mensagem_id, dias_offset, req.params.conta]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/:conta/webhooks/:webhookId/messages/:linkId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM webhook_mensagens WHERE id=$1 AND conta_slug=$2',
      [req.params.linkId, req.params.conta]
    )
    res.json({ ok: true })
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

// ─── DEBUG: Inspecionar payload bruto do Chatwoot ─────────────────────────────
// Use esta URL temporariamente no Chatwoot para ver o payload antes de configurar:
// POST /webhook-debug/:conta

app.post('/webhook-debug/:conta', (req, res) => {
  const payload = req.body
  console.log(`[DEBUG] Payload recebido para conta=${req.params.conta}:`)
  console.log(JSON.stringify(payload, null, 2))
  res.json({
    ok: true,
    message: 'Payload capturado — verifique os logs do servidor',
    received: payload
  })
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

// ─── RECEBER WEBHOOK DE MACRO CHATWOOT ────────────────────────────────────────

app.post('/webhook-macro/:conta/:token', async (req, res) => {
  try {
    const { conta, token } = req.params
    const payload = req.body

    // Verificar webhook existe, ativo e tipo macro
    const { rows: wh } = await pool.query(
      `SELECT * FROM webhooks WHERE conta_slug=$1 AND token=$2 AND active=true AND tipo='macro'`,
      [conta, token]
    )
    if (!wh.length) return res.status(404).json({ error: 'Webhook macro não encontrado' })

    const webhook = wh[0]
    let action = 'Macro recebida'
    let clienteId = null
    const agendamentosCriados = []

    // Extrair dados do contato da conversa (payload de macro Chatwoot)
    // O payload de macro do Chatwoot pode vir diretamente como o objeto da conversa,
    // ou embrulhado. Tentamos todos os lugares conhecidos do schema do Chatwoot.
    const conversation = payload.conversation || payload
    const contact = conversation.meta?.sender
      || conversation.contact
      || payload.contact
      || payload.sender
      || {}
    const customAttr = contact.custom_attributes || {}
    const inbox = conversation.inbox_id || payload.inbox_id || null
    
    const nome = contact.name || contact.display_name || payload.sender?.name || 'Sem nome'
    const phone = (
      contact.phone_number ||
      contact.phone ||
      customAttr.phone_number ||
      customAttr.telefone ||
      customAttr.phone ||
      payload.meta?.sender?.phone_number ||
      ''
    )
    const email = contact.email || customAttr.email || payload.meta?.sender?.email || ''
    const chatwootId = contact.id || payload.sender?.id || null
    const conversationId = conversation.id || payload.conversation_id || payload.id || null

    console.log(`[MACRO] conta=${conta} nome=${nome} phone=${phone} email=${email} convId=${conversationId}`)

    if (!phone && !email && !conversationId) {
      // Salvar log mesmo sem dados de contato/conversa
      await pool.query(
        `INSERT INTO webhook_logs (id, conta_slug, webhook_id, webhook_name, payload, status, action)
         VALUES ($1,$2,$3,$4,$5,'error',$6)`,
        [createId(), conta, webhook.id, webhook.nome, JSON.stringify(payload), 'Sem telefone, email ou conversation_id']
      )
      return res.status(400).json({ error: 'Faltam dados de identificação (telefone/email/conversation_id)' })
    }

    // Criar ou atualizar cliente
    let existing = []
    if (phone) {
      existing = (await pool.query('SELECT * FROM clientes WHERE conta_slug=$1 AND phone=$2', [conta, phone])).rows
    } else if (email) {
      existing = (await pool.query('SELECT * FROM clientes WHERE conta_slug=$1 AND email=$2', [conta, email])).rows
    } else if (conversationId) {
      existing = (await pool.query('SELECT * FROM clientes WHERE conta_slug=$1 AND chatwoot_conversation_id=$2', [conta, conversationId])).rows
    }

    if (existing.length) {
      clienteId = existing[0].id
      await pool.query(
        `UPDATE clientes SET messages_received = messages_received + 1, last_webhook_at=NOW(),
         chatwoot_conversation_id=COALESCE($2, chatwoot_conversation_id)
         WHERE id=$1`,
        [clienteId, conversationId]
      )
      action = 'Cliente existente atualizado via macro'
    } else {
      clienteId = createId()
      await pool.query(
        `INSERT INTO clientes (id, conta_slug, nome, phone, email, source, tags, notes, chatwoot_id, chatwoot_conversation_id, last_webhook_at)
         VALUES ($1,$2,$3,$4,$5,'macro','{macro}',$6,$7,$8,NOW())`,
        [clienteId, conta, nome, phone, email, 'Cadastrado via macro Chatwoot', chatwootId, conversationId]
      )
      action = 'Novo cliente cadastrado via macro'
    }

    // Buscar mensagens vinculadas ao webhook
    const { rows: links } = await pool.query(
      `SELECT wm.*, m.conteudo, m.canal, m.nome as msg_nome
       FROM webhook_mensagens wm
       JOIN mensagens m ON m.id = wm.mensagem_id
       WHERE wm.webhook_id=$1 AND wm.conta_slug=$2
       ORDER BY wm.dias_offset ASC`,
      [webhook.id, conta]
    )

    if (links.length === 0) {
      console.warn(`[MACRO] Nenhuma mensagem vinculada ao webhook ${webhook.id} (${webhook.nome}). Configure mensagens na aba Webhooks.`)
    }

    // Buscar dados atualizados do cliente para substituir variáveis
    const { rows: cliRows } = await pool.query('SELECT * FROM clientes WHERE id=$1', [clienteId])
    const cli = cliRows[0] || { nome, phone, email }

    // Criar agendamentos para cada mensagem vinculada
    for (const link of links) {
      const dataEnvio = new Date()
      dataEnvio.setDate(dataEnvio.getDate() + link.dias_offset)

      const dataStr = dataEnvio.toLocaleDateString('pt-BR')
      const horaStr = dataEnvio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

      // Substituir variáveis na mensagem (inclui {{conta}} e {{conversation_id}})
      let conteudo = link.conteudo
        .replace(/\{\{nome\}\}/g, cli.nome || nome || '')
        .replace(/\{\{telefone\}\}/g, cli.phone || phone || '')
        .replace(/\{\{email\}\}/g, cli.email || email || '')
        .replace(/\{\{data\}\}/g, dataStr)
        .replace(/\{\{hora\}\}/g, horaStr)
        .replace(/\{\{conta\}\}/g, conta)
        .replace(/\{\{conversation_id\}\}/g, String(conversationId || ''))

      const agId = createId()
      await pool.query(
        `INSERT INTO agendamentos (id, conta_slug, cliente_id, mensagem, canal, agendado_para, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
        [agId, conta, clienteId, conteudo, link.canal, dataEnvio.toISOString()]
      )
      agendamentosCriados.push({ id: agId, dias_offset: link.dias_offset, msg: link.msg_nome })
      console.log(`[MACRO] Agendamento criado: ${agId} para ${cli.nome} em ${dataStr} ${horaStr}`)
    }

    action += ` | ${agendamentosCriados.length} agendamento(s) criado(s)`

    // Salvar log
    await pool.query(
      `INSERT INTO webhook_logs (id, conta_slug, webhook_id, webhook_name, payload, status, action)
       VALUES ($1,$2,$3,$4,$5,'processed',$6)`,
      [createId(), conta, webhook.id, webhook.nome, JSON.stringify(payload), action]
    )

    res.json({ ok: true, action, clienteId, agendamentos: agendamentosCriados })
  } catch (e) {
    console.error('Webhook macro error:', e)
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
    const { chatwoot_url, chatwoot_token, chatwoot_account_id = '1', evolution_url, evolution_key } = req.body
    const { rows } = await pool.query(
      `INSERT INTO integracoes (conta_slug, chatwoot_url, chatwoot_token, chatwoot_account_id, evolution_url, evolution_key)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (conta_slug) DO UPDATE
       SET chatwoot_url=$2, chatwoot_token=$3, chatwoot_account_id=$4, evolution_url=$5, evolution_key=$6, atualizado_em=NOW()
       RETURNING *`,
      [req.params.conta, chatwoot_url, chatwoot_token, chatwoot_account_id, evolution_url, evolution_key]
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
      'SELECT chatwoot_url, chatwoot_token, chatwoot_account_id FROM integracoes WHERE conta_slug=$1',
      [req.params.conta]
    )
    const integ = rows[0]
    if (!integ?.chatwoot_url) return res.status(400).json({ error: 'Chatwoot não configurado' })

    const accId = integ.chatwoot_account_id || '1'
    const q = req.query.q || ''
    const response = await fetch(
      `${integ.chatwoot_url}/api/v1/accounts/${accId}/contacts/search?q=${encodeURIComponent(q)}&page=1`,
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

// ─── CRON: ENVIAR MENSAGENS AGENDADAS VIA CHATWOOT ───────────────────────────

async function processScheduledMessages() {
  try {
    // Buscar agendamentos pendentes cuja data já passou
    const { rows: pendentes } = await pool.query(
      `SELECT a.*, c.nome as cliente_nome, c.phone as cliente_phone, c.email as cliente_email,
              c.chatwoot_conversation_id, c.conta_slug
       FROM agendamentos a
       JOIN clientes c ON c.id = a.cliente_id
       WHERE a.status='pending' AND a.agendado_para <= NOW()
       ORDER BY a.agendado_para ASC
       LIMIT 20`
    )

    if (!pendentes.length) return

    // Agrupar por conta para buscar integrações uma vez por conta
    const contas = [...new Set(pendentes.map(p => p.conta_slug))]
    const integMap = {}
    for (const conta of contas) {
      const { rows } = await pool.query(
        'SELECT chatwoot_url, chatwoot_token, chatwoot_account_id FROM integracoes WHERE conta_slug=$1',
        [conta]
      )
      if (rows[0]) integMap[conta] = rows[0]
    }

    for (const ag of pendentes) {
      const integ = integMap[ag.conta_slug]

      // Se não tem integração ou conversation_id, marcar como falha
      if (!integ?.chatwoot_url || !integ?.chatwoot_token) {
        await pool.query(
          `UPDATE agendamentos SET status='failed', erro='Integração Chatwoot não configurada', enviado_em=NOW() WHERE id=$1`,
          [ag.id]
        )
        continue
      }

      if (!ag.chatwoot_conversation_id) {
        await pool.query(
          `UPDATE agendamentos SET status='failed', erro='Cliente sem conversation_id do Chatwoot', enviado_em=NOW() WHERE id=$1`,
          [ag.id]
        )
        continue
      }

      // Enviar mensagem via Chatwoot API
      try {
        const accId = integ.chatwoot_account_id || '1'
        const cwUrl = integ.chatwoot_url.replace(/\/$/, '')
        const url = `${cwUrl}/api/v1/accounts/${accId}/conversations/${ag.chatwoot_conversation_id}/messages`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'api_access_token': integ.chatwoot_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: ag.mensagem,
            message_type: 'outgoing'
          })
        })

        if (response.ok) {
          await pool.query(
            `UPDATE agendamentos SET status='sent', enviado_em=NOW() WHERE id=$1`,
            [ag.id]
          )
          console.log(`[CRON] Mensagem enviada: agendamento ${ag.id} → conversa ${ag.chatwoot_conversation_id}`)
        } else {
          const errText = await response.text().catch(() => '')
          await pool.query(
            `UPDATE agendamentos SET status='failed', erro=$2, enviado_em=NOW() WHERE id=$1`,
            [ag.id, `HTTP ${response.status}: ${errText.slice(0, 200)}`]
          )
          console.error(`[CRON] Falha ao enviar agendamento ${ag.id}: HTTP ${response.status}`)
        }
      } catch (sendErr) {
        await pool.query(
          `UPDATE agendamentos SET status='failed', erro=$2, enviado_em=NOW() WHERE id=$1`,
          [ag.id, sendErr.message.slice(0, 200)]
        )
        console.error(`[CRON] Erro ao enviar agendamento ${ag.id}:`, sendErr.message)
      }
    }
  } catch (e) {
    console.error('[CRON] Erro geral no processamento:', e.message)
  }
}

// Executar cron a cada 60 segundos
setInterval(processScheduledMessages, 60_000)

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`)
  console.log('[CRON] Processador de mensagens agendadas ativo (intervalo: 60s)')
  // Executar uma vez ao iniciar
  processScheduledMessages()
})

export default app
