// server.js — Inter Bridge Versão Corrigida ✅

require("dotenv").config();
const express = require("express");
const https = require("https");
const { Buffer } = require("buffer");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variáveis de ambiente
const INTER_CERT_B64 = process.env.INTER_CERT_B64;
const INTER_KEY_B64 = process.env.INTER_KEY_B64;
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID;
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;

const INTER_API_URL = "https://cdpj.partners.bancointer.com.br";

// Decodifica certificado e chave da variável Base64
const cert = INTER_CERT_B64 ? Buffer.from(INTER_CERT_B64, "base64") : null;
const key = INTER_KEY_B64 ? Buffer.from(INTER_KEY_B64, "base64") : null;

// Agente HTTPS configurado com mTLS
const agent = new https.Agent({
  cert,
  key,
  rejectUnauthorized: true,
});

// ✅ 1️⃣ Obter Token OAuth
app.post("/oauth/token", async (req, res) => {
  try {
    const payload = {
      grant_type: "client_credentials",
      client_id: req.body.client_id || INTER_CLIENT_ID,
      client_secret: req.body.client_secret || INTER_CLIENT_SECRET,
      scope: "boleto-cobranca.read boleto-cobranca.write",
    };

    const response = await fetch(`${INTER_API_URL}/oauth/v2/token`, {
      method: "POST",
      agent,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(payload),
    });

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Erro no token:", err);
    res.status(500).json({ error: "Erro ao obter token", details: err.message });
  }
});

// ✅ 2️⃣ Criar Boleto de Cobrança
app.post("/cobrancas", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token inválido" });

    const payload = req.body;

    const response = await fetch(`${INTER_API_URL}/cobranca/v3/cobrancas`, {
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Erro criando boleto:", err);
    res.status(500).json({ error: "Erro ao criar cobrança" });
  }
});

// ✅ 3️⃣ Buscar PDF do Boleto
app.get("/cobrancas/:id/pdf", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token inválido" });

    const { id } = req.params;

    const response = await fetch(`${INTER_API_URL}/cobranca/v3/cobrancas/${id}/pdf`, {
      method: "GET",
      agent,
      headers: { Authorization: `Bearer ${token}` },
    });

    const buffer = await response.buffer();

    res.setHeader("Content-Type", "application/pdf");
    res.send(buffer);
  } catch (err) {
    console.error("Erro no PDF:", err);
    res.status(500).json({ error: "Erro ao baixar boleto" });
  }
});

// ✅ Inicialização
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Inter Bridge rodando na porta ${PORT}`);
});
