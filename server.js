// server.js - Inter Bridge com mTLS
import express from "express";
import cors from "cors";
import https from "https";
import axios from "axios";

const app = express();

// Habilita CORS para todas as origens
app.use(cors());
app.use(express.json());

// Configurações do Inter
const INTER_BASE_URL = process.env.INTER_BASE_URL || "https://cdpj.partners.bancointer.com.br";
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID;
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;
const certB64 = process.env.INTER_CERT_B64;
const keyB64 = process.env.INTER_KEY_B64;

// Validação das credenciais
if (!certB64 || !keyB64) {
  console.error("❌ ERRO: INTER_CERT_B64 ou INTER_KEY_B64 não configuradas");
  process.exit(1);
}

if (!INTER_CLIENT_ID || !INTER_CLIENT_SECRET) {
  console.error("❌ ERRO: INTER_CLIENT_ID ou INTER_CLIENT_SECRET não configuradas");
  process.exit(1);
}

console.log("✅ Certificados carregados");
console.log("✅ Client ID configurado:", INTER_CLIENT_ID);

// Cria o agente HTTPS com mTLS
const interHttpsAgent = new https.Agent({
  cert: Buffer.from(certB64, "base64"),
  key: Buffer.from(keyB64, "base64"),
  rejectUnauthorized: true,
  keepAlive: true,
});

/**
 * Função auxiliar para chamar a API do Inter
 */
async function callInter(method, path, data = null, extraHeaders = {}, responseType = "json") {
  const url = `${INTER_BASE_URL}${path}`;
  
  console.log(`→ ${method.toUpperCase()} ${url}`);
  
  try {
    const response = await axios({
      method,
      url,
      data,
      headers: extraHeaders,
      httpsAgent: interHttpsAgent,
      timeout: 30000,
      responseType,
      validateStatus: () => true, // Aceita qualquer status para debug
    });

    console.log(`← Status: ${response.status}`);
    
    return response;
  } catch (error) {
    console.error("❌ Erro ao chamar Inter:", error.message);
    throw error;
  }
}

/**
 * Endpoint de health check
 */
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    config: {
      hasClientId: !!INTER_CLIENT_ID,
      hasClientSecret: !!INTER_CLIENT_SECRET,
      hasCert: !!certB64,
      hasKey: !!keyB64,
    }
  });
});

/**
 * POST /oauth/token
 * Autentica com o Inter e retorna o access_token
 */
app.post("/oauth/token", async (req, res) => {
  try {
    console.log("\n🔐 Iniciando autenticação OAuth...");
    
    // Monta o payload para o Inter
    const payload = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: req.body.client_id || INTER_CLIENT_ID,
      client_secret: req.body.client_secret || INTER_CLIENT_SECRET,
      scope: req.body.scope || "boleto-cobranca.read boleto-cobranca.write",
    });

    console.log("Client ID usado:", req.body.client_id || INTER_CLIENT_ID);

    const response = await callInter(
      "post",
      "/oauth/v2/token",
      payload.toString(),
      { "Content-Type": "application/x-www-form-urlencoded" }
    );

    if (response.status === 200) {
      console.log("✅ Autenticação bem-sucedida");
      res.status(200).json(response.data);
    } else {
      console.error("❌ Erro de autenticação:", response.data);
      res.status(response.status).json(response.data);
    }
  } catch (error) {
    console.error("❌ Erro em /oauth/token:", error.message);
    res.status(502).json({ 
      error: "Erro ao comunicar com o Inter", 
      detail: error.message 
    });
  }
});

/**
 * POST /cobrancas
 * Cria um boleto no Inter
 */
app.post("/cobrancas", async (req, res) => {
  try {
    console.log("\n💰 Criando boleto...");
    
    const headers = {
      "Content-Type": "application/json",
    };

    // Adiciona o token de autorização se enviado
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const response = await callInter(
      "post",
      "/cobranca/v3/cobrancas",
      req.body,
      headers
    );

    if (response.status >= 200 && response.status < 300) {
      console.log("✅ Boleto criado com sucesso");
    } else {
      console.error("❌ Erro ao criar boleto:", response.data);
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("❌ Erro em /cobrancas:", error.message);
    res.status(502).json({ 
      error: "Erro ao comunicar com o Inter", 
      detail: error.message 
    });
  }
});

/**
 * GET /cobrancas/:id/pdf
 * Baixa o PDF de um boleto
 */
app.get("/cobrancas/:id/pdf", async (req, res) => {
  try {
    console.log(`\n📄 Baixando PDF do boleto ${req.params.id}...`);
    
    const headers = {
      Accept: "application/pdf",
    };

    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const response = await callInter(
      "get",
      `/cobranca/v3/cobrancas/${encodeURIComponent(req.params.id)}/pdf`,
      null,
      headers,
      "arraybuffer"
    );

    if (response.status === 200 && response.data instanceof Buffer) {
      console.log("✅ PDF baixado com sucesso");
      res.setHeader("Content-Type", "application/pdf");
      res.status(200).send(response.data);
    } else {
      console.error("❌ Erro ao baixar PDF");
      res.status(response.status).send(response.data);
    }
  } catch (error) {
    console.error("❌ Erro em /cobrancas/:id/pdf:", error.message);
    res.status(502).json({ 
      error: "Erro ao comunicar com o Inter", 
      detail: error.message 
    });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Inter Bridge rodando na porta ${PORT}`);
  console.log(`📍 URL base do Inter: ${INTER_BASE_URL}`);
  console.log(`🔑 Client ID: ${INTER_CLIENT_ID}`);
  console.log(`\nEndpoints disponíveis:`);
  console.log(`  GET  /health`);
  console.log(`  POST /oauth/token`);
  console.log(`  POST /cobrancas`);
  console.log(`  GET  /cobrancas/:id/pdf`);
});
