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
// Remove aspas que o Render pode adicionar automaticamente
const certB64 = process.env.INTER_CERT_B64?.replace(/^["']|["']$/g, '');
const keyB64 = process.env.INTER_KEY_B64?.replace(/^["']|["']$/g, '');

console.log("🔧 [BRIDGE INIT] Configuração carregada:");
console.log("  - INTER_BASE_URL:", INTER_BASE_URL);
console.log("  - INTER_CLIENT_ID:", INTER_CLIENT_ID ? "✅ Definido" : "❌ Ausente");
console.log("  - INTER_CLIENT_SECRET:", INTER_CLIENT_SECRET ? "✅ Definido" : "❌ Ausente");
console.log("  - INTER_CERT_B64:", certB64 ? "✅ Definido" : "❌ Ausente");
console.log("  - INTER_KEY_B64:", keyB64 ? "✅ Definido" : "❌ Ausente");

// Validação das credenciais
console.log("\n📋 [BRIDGE INIT] Validando credenciais...");
if (!certB64 || !keyB64) {
  console.error("❌ [BRIDGE INIT] ERRO: INTER_CERT_B64 ou INTER_KEY_B64 não configuradas");
  console.error("  - INTER_CERT_B64:", certB64 ? "OK" : "FALTANDO");
  console.error("  - INTER_KEY_B64:", keyB64 ? "OK" : "FALTANDO");
  process.exit(1);
}

if (!INTER_CLIENT_ID || !INTER_CLIENT_SECRET) {
  console.error("❌ [BRIDGE INIT] ERRO: INTER_CLIENT_ID ou INTER_CLIENT_SECRET não configuradas");
  console.error("  - INTER_CLIENT_ID:", INTER_CLIENT_ID ? "OK" : "FALTANDO");
  console.error("  - INTER_CLIENT_SECRET:", INTER_CLIENT_SECRET ? "OK" : "FALTANDO");
  process.exit(1);
}

console.log("✅ [BRIDGE INIT] Certificados carregados (SEM SENHA - passphrase: \"\")");
console.log("✅ [BRIDGE INIT] Credenciais OAuth OK");

// Cria o agente HTTPS com mTLS
console.log("🔐 [BRIDGE INIT] Criando HTTPS Agent com mTLS...");
let certBuffer, keyBuffer;
try {
  certBuffer = Buffer.from(certB64, "base64");
  keyBuffer = Buffer.from(keyB64, "base64");
  console.log("✅ [BRIDGE INIT] Certificados decodificados:");
  console.log("  - Cert size:", certBuffer.length, "bytes");
  console.log("  - Key size:", keyBuffer.length, "bytes");
} catch (error) {
  console.error("❌ [BRIDGE INIT] Erro ao decodificar certificados:", error.message);
  process.exit(1);
}

const interHttpsAgent = new https.Agent({
  cert: certBuffer,
  key: keyBuffer,
  passphrase: "", // Certificado SEM SENHA
  rejectUnauthorized: true,
  keepAlive: true,
});
console.log("✅ [BRIDGE INIT] HTTPS Agent criado com sucesso (mTLS com certificado SEM SENHA)");

/**
 * Função auxiliar para chamar a API do Inter
 */
async function callInter(method, path, data = null, extraHeaders = {}, responseType = "json") {
  const url = `${INTER_BASE_URL}${path}`;
  const timestamp = new Date().toISOString();
  
  console.log(`\n📤 [${timestamp}] ${method.toUpperCase()} ${url}`);
  console.log("   Headers:", JSON.stringify(extraHeaders, null, 2));
  if (data && responseType === "json") console.log("   Body:", JSON.stringify(data, null, 2));
  
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

    console.log(`📥 [${timestamp}] ${response.status} ${response.statusText}`);
    if (responseType === "json" && response.data) {
      console.log("   Response:", JSON.stringify(response.data, null, 2));
    } else if (responseType === "arraybuffer") {
      console.log("   Response: [BINARY DATA]", response.data?.length, "bytes");
    }
    
    return response;
  } catch (error) {
    console.error(`❌ [${timestamp}] Erro ao chamar Inter:`, error.message);
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", JSON.stringify(error.response.data, null, 2));
    }
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
    message: "Bridge Inter com mTLS ativo",
    config: {
      hasClientId: !!INTER_CLIENT_ID,
      hasClientSecret: !!INTER_CLIENT_SECRET,
      hasCert: !!certB64,
      hasKey: !!keyB64,
      certSize: certBuffer?.length || 0,
      keySize: keyBuffer?.length || 0,
      certificateSemSenha: true,
    }
  });
});

/**
 * POST /oauth/token
 * Autentica com o Inter e retorna o access_token
 */
app.post("/oauth/token", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🔐 [${timestamp}] OAuth Token Request (certificado mTLS SEM SENHA)`);
  
  try {
    // Monta o payload para o Inter
    const payload = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: req.body.client_id || INTER_CLIENT_ID,
      client_secret: req.body.client_secret || INTER_CLIENT_SECRET,
      scope: req.body.scope || "boleto-cobranca.read boleto-cobranca.write",
    });

    console.log("📋 OAuth Params:");
    console.log("   - client_id:", req.body.client_id || INTER_CLIENT_ID);
    console.log("   - client_secret:", "[DEFINIDO]");
    console.log("   - grant_type: client_credentials");
    console.log("   - scope:", req.body.scope || "boleto-cobranca.read boleto-cobranca.write");
    console.log("   - certificado: SEM SENHA (passphrase: \"\")");

    const response = await callInter(
      "post",
      "/oauth/v2/token",
      payload.toString(),
      { "Content-Type": "application/x-www-form-urlencoded" }
    );

    if (response.status === 200) {
      console.log(`✅ [${timestamp}] Token obtido com sucesso via mTLS`);
      console.log("   - access_token:", response.data.access_token ? "[PRESENTE]" : "[AUSENTE]");
      console.log("   - expires_in:", response.data.expires_in);
      console.log("   - token_type:", response.data.token_type);
      res.status(200).json(response.data);
    } else {
      console.error(`❌ [${timestamp}] Erro de autenticação:`, response.data);
      res.status(response.status).json(response.data);
    }
  } catch (error) {
    console.error(`❌ [${timestamp}] Erro em /oauth/token:`, error.message);
    res.status(502).json({ 
      error: "Erro ao comunicar com o Inter", 
      detail: error.message 
    });
  }
});

/**
 * POST /auth/token (alias para /oauth/token)
 * Endpoint alternativo para compatibilidade
 */
app.post("/auth/token", async (req, res) => {
  console.log("📥 POST /auth/token - Redirecionando para /oauth/token");
  req.url = "/oauth/token";
  app._router.handle(req, res);
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
    
    const headers = {};

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
  console.log(`🔐 Certificado: SEM SENHA (passphrase: "")`);
  console.log(`\n✅ Endpoints disponíveis:`);
  console.log(`  GET  /health`);
  console.log(`  POST /oauth/token`);
  console.log(`  POST /auth/token (alias)`);
  console.log(`  POST /cobrancas`);
  console.log(`  GET  /cobrancas/:id/pdf`);
});
