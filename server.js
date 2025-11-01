// server.js — versão corrigida (usa mTLS só nas requisições para o Inter)
import express from "express";
import https from "https";
import axios from "axios";
import qs from "qs";

const app = express();
app.use(express.json());

// CONFIG (via env)
const INTER_BASE_URL = process.env.INTER_BASE_URL || "https://cdpj.partners.bancointer.com.br";
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID || "";
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET || "";
const certB64 = process.env.INTER_CERT_B64 || "";
const keyB64 = process.env.INTER_KEY_B64 || "";

// validação mínima
if (!certB64 || !keyB64) {
  console.warn("ATENÇÃO: INTER_CERT_B64 ou INTER_KEY_B64 não configuradas nas env vars");
}

// monta https.Agent com mTLS — usado APENAS nas chamadas para o Inter
const interHttpsAgent = new https.Agent({
  cert: certB64 ? Buffer.from(certB64, "base64") : undefined,
  key: keyB64 ? Buffer.from(keyB64, "base64") : undefined,
  // Não colocar rejectUnauthorized:false aqui — queremos validar o certificado do Inter:
  rejectUnauthorized: true,
  keepAlive: true,
});

/**
 * Faz uma requisição ao servidor do Inter usando o agente TLS.
 * method: 'get'|'post'...
 * path: caminho a partir de INTER_BASE_URL (ex: '/oauth/v2/token' ou '/api/v2/cobrancas')
 * data: objeto ou string (se for form-urlencoded, passe string)
 * extraHeaders: headers adicionais
 * responseType: optional (e.g. 'arraybuffer' para PDFs)
 */
async function callInter(method, path, data = null, extraHeaders = {}, responseType = "json") {
  const url = `${INTER_BASE_URL}${path}`;
  try {
    const resp = await axios.request({
      method,
      url,
      data,
      headers: extraHeaders,
      httpsAgent: interHttpsAgent,
      timeout: 30000,
      responseType,
      validateStatus: () => true, // retornar body mesmo para códigos >=400 para debug
    });
    return resp;
  } catch (err) {
    // erro de baixo nível (ex: TLS, network). normal log e rethrow
    console.error("Erro low-level ao chamar Inter:", err?.message || err);
    throw err;
  }
}

/**
 * Endpoint: POST /oauth/token
 * Proxy para o Inter (form-urlencoded)
 */
app.post("/oauth/token", async (req, res) => {
  try {
    // Prepara body x-www-form-urlencoded — se client_id/secret vierem por env, usamos elas
    const payloadObj = {
      grant_type: "client_credentials",
      client_id: INTER_CLIENT_ID || req.body.client_id,
      client_secret: INTER_CLIENT_SECRET || req.body.client_secret,
      scope: req.body.scope || "oapi",
    };
    const payload = qs.stringify(payloadObj);

    const resp = await callInter("post", "/oauth/v2/token", payload, {
      "Content-Type": "application/x-www-form-urlencoded",
    });

    // devolve o status e body que o Inter retornou
    res.status(resp.status).send(resp.data);
  } catch (err) {
    console.error("Erro em /oauth/token:", err?.message || err);
    res.status(502).json({ error: "Erro ao comunicar com o Inter", detail: err?.message || String(err) });
  }
});

/**
 * Endpoint: POST /cobrancas
 * Proxy para criar cobrança (boleto)
 * Espera receber JSON do cliente com o body que o Inter espera.
 */
app.post("/cobrancas", async (req, res) => {
  try {
    // Usamos o header Authorization (Bearer) enviado pelo cliente (se houver)
    const headers = {
      "Content-Type": "application/json",
      // repassa Authorization se o cliente enviou
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
    };
    const resp = await callInter("post", "/api/v2/cobrancas", req.body, headers, "json");
    res.status(resp.status).send(resp.data);
  } catch (err) {
    console.error("Erro em /cobrancas:", err?.message || err);
    res.status(502).json({ error: "Erro ao comunicar com o Inter", detail: err?.message || String(err) });
  }
});

/**
 * Endpoint: GET /cobrancas/:id/pdf
 * Proxy para baixar PDF do boleto (responseType=arraybuffer)
 */
app.get("/cobrancas/:id/pdf", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);
    const headers = {
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      Accept: "application/pdf",
    };
    const resp = await callInter("get", `/api/v2/cobrancas/${id}/pdf`, null, headers, "arraybuffer");

    // Se o Inter retornou PDF, repassamos como aplicação/pdf
    const contentType = resp.headers["content-type"] || "";
    if (contentType.includes("pdf") || resp.data instanceof Buffer) {
      res.setHeader("Content-Type", "application/pdf");
      res.status(resp.status).send(Buffer.from(resp.data));
    } else {
      // Se não for PDF, devolve JSON/texto de erro
      res.status(resp.status).send(resp.data);
    }
  } catch (err) {
    console.error("Erro em /cobrancas/:id/pdf:", err?.message || err);
    res.status(502).json({ error: "Erro ao comunicar com o Inter", detail: err?.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Inter Bridge rodando na porta ${PORT}`));
