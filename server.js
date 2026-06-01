require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3001;

// Verificação básica de configuração
if (!process.env.DATABASE_URL) {
  console.error("✗ ERRO CRÍTICO: Variável de ambiente DATABASE_URL não definida.");
}

// ─── Supabase/PostgreSQL Connection ──────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000, // 5 segundos de timeout
  idleTimeoutMillis: 30000,
  max: 10 // Limite de conexões para não estourar o plano do Supabase
});

// Log de evento para monitorar a conexão do Pool
pool.on('error', (err, client) => {
  console.error('✗ Erro inesperado no Pool do Supabase:', err.message);
});

pool.on('connect', () => {
  console.log('✓ Nova conexão estabelecida com o banco de dados');
});

// Teste de conexão imediato
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('✗ Falha na conexão inicial com Supabase:', err.message);
  } else {
    console.log('✓ Conexão com Supabase verificada com sucesso');
  }
});


// ─── Database Initialization ─────────────────────────────────────────────────
// Cria a tabela automaticamente se não existir
async function initDb() {
  try {
    // 1. Cria a tabela base
    await pool.query(`CREATE TABLE IF NOT EXISTS accounts (account_id TEXT PRIMARY KEY)`);

    // 2. Garante que todas as colunas JSONB existam (adiciona apenas se faltarem)
    const columns = [
      { name: "integrations", def: "'{}'" },
      { name: "clients", def: "'[]'" },
      { name: "messages", def: "'[]'" },
      { name: "schedules", def: "'[]'" },
      { name: "webhooks", def: "'[]'" },
      { name: "webhook_logs", def: "'[]'" },
      { name: "settings", def: "'{}'" }
    ];

    for (const col of columns) {
      await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "${col.name}" JSONB DEFAULT ${col.def}`);
    }

    console.log("✓ Database schema verified/updated in Supabase");
  } catch (err) {
    console.error("✗ Database init error:", err);
  }
}
initDb();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getOrCreateAccount(accountId) {
  // Usamos ON CONFLICT para evitar erros de concorrência (Race Condition)
  const res = await pool.query(
    `INSERT INTO accounts (account_id) VALUES ($1) 
     ON CONFLICT (account_id) DO UPDATE SET account_id = EXCLUDED.account_id 
     RETURNING *`,
    [accountId]
  );
  return res.rows[0];
}

const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => new Date().toISOString();

// ─── GET: Full account data ────────────────────────────────────────────────────
app.get("/api/account/:accountId", async (req, res) => {
  try {
    const rawAcc = await getOrCreateAccount(req.params.accountId);
    // Mapeia nomes do banco para o frontend (snake_case para camelCase)
    res.json({
      ...rawAcc,
      accountId: rawAcc.account_id,
      webhookLogs: rawAcc.webhook_logs
    });
  } catch (err) {
    console.error("[API GET ERROR]:", err);
    res.status(500).json({ error: err.message, detail: err.stack });
  }
});

// ─── PUT: Save a specific key (clients, messages, schedules, etc.) ─────────────
app.put("/api/account/:accountId/:key", async (req, res) => {
  try {
    const { key, accountId } = req.params;
    const dbKey = key === "webhookLogs" ? "webhook_logs" : key;
    const allowed = ["clients", "messages", "schedules", "webhooks", "webhookLogs", "integrations", "settings"];
    if (!allowed.includes(key)) return res.status(400).json({ error: "Invalid key" });
    
    await pool.query(
      `INSERT INTO accounts (account_id, "${dbKey}") VALUES ($1, $2) 
       ON CONFLICT (account_id) DO UPDATE SET "${dbKey}" = $2`,
      [accountId, JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[API PUT ERROR]:", err);
    res.status(500).json({ error: err.message, detail: err.stack });
  }
});

// ─── POST: Chatwoot Webhook Endpoint ──────────────────────────────────────────
// The Chatwoot macro sends a POST to: /api/webhook/:accountId/:token
app.post("/api/webhook/:accountId/:token", async (req, res) => {
  const { accountId, token } = req.params;
  const payload = req.body;

  const rawAcc = await getOrCreateAccount(accountId);
  const acc = { ...rawAcc, webhookLogs: rawAcc.webhook_logs };

  // 1. Find the webhook config by token
  const wh = (acc.webhooks || []).find((w) => w.token === token && w.active);
  if (!wh) {
    console.log(`[WEBHOOK] Token not found or inactive for account ${accountId}: ${token}`);
    return res.status(404).json({ error: "Webhook not found or inactive" });
  }

  // 2. Extract contact data from Chatwoot payload
  // Chatwoot sends contact data in different structures depending on the event type
  const contact = payload.contact || payload.meta?.sender || {};
  const conversation = payload.conversation || {};
  const account = payload.account || {};

  const name = contact.name || "Sem nome";
  const phone = contact.phone_number || contact.phone || "";
  const email = contact.email || "";
  const chatwootContactId = contact.id || null;
  const chatwootConversationId = conversation.id || payload.id || null;

  // Build Chatwoot conversation URL for the "Open in Chatwoot" button
  const integration = acc.integrations?.chatwoot || {};
  const chatwootBaseUrl = integration.apiUrl || "";
  const chatwootAccountId = integration.cwAccountId || account.id || "";
  const chatwootUrl = chatwootConversationId && chatwootBaseUrl && chatwootAccountId
    ? `${chatwootBaseUrl.replace(/\/$/, "")}/app/accounts/${chatwootAccountId}/conversations/${chatwootConversationId}`
    : null;

  // 3. Check if client already exists (by phone or chatwootId)
  const existingIdx = acc.clients.findIndex(
    (c) => (phone && c.phone === phone) || (chatwootContactId && c.chatwootId === chatwootContactId)
  );

  let clientId;
  let action;

  if (existingIdx >= 0) {
    // Update existing client: increment message counter
    acc.clients[existingIdx].messagesReceived = (acc.clients[existingIdx].messagesReceived || 0) + 1;
    acc.clients[existingIdx].lastWebhookAt = now();
    if (chatwootUrl && !acc.clients[existingIdx].chatwootUrl) {
      acc.clients[existingIdx].chatwootUrl = chatwootUrl;
    }
    if (chatwootConversationId) {
      acc.clients[existingIdx].chatwootConversationId = chatwootConversationId;
    }
    clientId = acc.clients[existingIdx].id;
    action = `Cliente existente atualizado (${acc.clients[existingIdx].messagesReceived} mensagens recebidas)`;
  } else {
    // New client
    const newClient = {
      id: uid(),
      name,
      phone,
      email,
      source: "chatwoot",
      tags: ["chatwoot", "webhook"],
      notes: `Cadastrado via webhook em ${now()}`,
      chatwootId: chatwootContactId,
      chatwootConversationId,
      chatwootUrl,
      messagesReceived: 1,
      lastWebhookAt: now(),
      createdAt: now(),
    };
    acc.clients.push(newClient);
    clientId = newClient.id;
    action = "Novo cliente cadastrado via webhook";
  }

  // 4. Auto-schedule follow-up if configured
  if (wh.autoSchedule && wh.defaultMessageId && existingIdx < 0) {
    const msg = acc.messages.find((m) => m.id === wh.defaultMessageId);
    const dt = new Date();
    dt.setDate(dt.getDate() + (Number(wh.scheduleDays) || 1));

    const client = acc.clients.find((c) => c.id === clientId);
    acc.schedules.push({
      id: uid(),
      clientId,
      clientName: client?.name || name,
      messageId: wh.defaultMessageId,
      messageName: msg?.name || "?",
      scheduledAt: dt.toISOString(),
      status: "pending",
      repeat: "none",
      notes: `Agendado automaticamente via webhook "${wh.name}"`,
      createdAt: now(),
    });
    action += " + follow-up agendado";
  }

  // 5. Log the event
  acc.webhookLogs.unshift({
    id: uid(),
    webhookId: wh.id,
    webhookName: wh.name,
    receivedAt: now(),
    payload: { event: payload.event, contact: { name, phone, email }, conversationId: chatwootConversationId },
    status: "processed",
    action,
  });
  // Keep only last 100 logs
  acc.webhookLogs = acc.webhookLogs.slice(0, 100);

  await pool.query(
    `UPDATE accounts SET clients = $1, schedules = $2, webhook_logs = $3 WHERE account_id = $4`,
    [JSON.stringify(acc.clients), JSON.stringify(acc.schedules), JSON.stringify(acc.webhookLogs), accountId]
  );
  
  console.log(`[WEBHOOK] ${wh.name} → ${action}`);
  res.json({ ok: true, action });
});

// ─── Serve built frontend in production ───────────────────────────────────────
const distPath = path.join(__dirname, "dist");

// No Vercel, o roteamento estático é feito pelo vercel.json, não pelo Express.
// Mantemos este bloco apenas para funcionamento local (npm start)
const isVercel = process.env.VERCEL === '1' || !!process.env.NOW_REGION;

if (!isVercel) {
  app.use(express.static(distPath));

  // Rota catch-all para garantir que o SPA (React) lide com o roteamento
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Erro: Pasta 'dist' não encontrada. Você executou 'npm run build'?");
    }
  });
}

app.listen(PORT, () => {
  console.log(`✓ FollowUp backend running on http://localhost:${PORT}`);
  console.log(`  Webhook URL format: http://localhost:${PORT}/api/webhook/:accountId/:token`);
});

module.exports = app;
