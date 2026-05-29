const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, "database.json");

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── DB Helpers ───────────────────────────────────────────────────────────────
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { accounts: {} };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getAccount(db, accountId) {
  if (!db.accounts[accountId]) {
    db.accounts[accountId] = {
      integrations: {},
      clients: [],
      messages: [],
      schedules: [],
      webhooks: [],
      webhookLogs: [],
    };
  }
  return db.accounts[accountId];
}

const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => new Date().toISOString();

// ─── GET: Full account data ────────────────────────────────────────────────────
app.get("/api/account/:accountId", (req, res) => {
  const db = readDB();
  const acc = getAccount(db, req.params.accountId);
  res.json(acc);
});

// ─── PUT: Save a specific key (clients, messages, schedules, etc.) ─────────────
app.put("/api/account/:accountId/:key", (req, res) => {
  const db = readDB();
  const acc = getAccount(db, req.params.accountId);
  const { key, accountId } = req.params;
  const allowed = ["clients", "messages", "schedules", "webhooks", "webhookLogs", "integrations"];
  if (!allowed.includes(key)) return res.status(400).json({ error: "Invalid key" });
  acc[key] = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// ─── POST: Chatwoot Webhook Endpoint ──────────────────────────────────────────
// The Chatwoot macro sends a POST to: /api/webhook/:accountId/:token
app.post("/api/webhook/:accountId/:token", (req, res) => {
  const { accountId, token } = req.params;
  const payload = req.body;

  const db = readDB();
  const acc = getAccount(db, accountId);

  // 1. Find the webhook config by token
  const wh = acc.webhooks.find((w) => w.token === token && w.active);
  if (!wh) {
    console.log(`[WEBHOOK] Token not found or inactive: ${token}`);
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

  writeDB(db);
  console.log(`[WEBHOOK] ${wh.name} → ${action}`);
  res.json({ ok: true, action });
});

// ─── Serve built frontend in production ───────────────────────────────────────
const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`✓ FollowUp backend running on http://localhost:${PORT}`);
  console.log(`  Webhook URL format: http://localhost:${PORT}/api/webhook/:accountId/:token`);
});
