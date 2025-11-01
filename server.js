// server.js
import express from "express";
import https from "https";
import axios from "axios";

const app = express();
app.use(express.json());

// Carrega cert e key a partir de variáveis de ambiente em Base64
const certB64 = process.env.INTER_CERT_B64 || "";
const keyB64 = process.env.INTER_KEY_B64 || "";
const INTER_BASE_URL = process.env.INTER_BASE_URL || "https://cdpj.partners.bancointer.com.br";

if (!certB64 || !keyB64) {
  console.warn("ATENÇÃO: INTER_CERT_B64 ou INTER_KEY_B64 não configuradas nas env vars");
}

const httpsAgent = new https.Agent({
  cert: certB64 ? Buffer.from(certB64, "base64") : undefined,
  key: keyB64 ? Buffer.from(keyB64, "base64") : undefined,
  keepAlive: true,
});

async function proxyRequest(method, path, data = null, headers = {}) {
  const url = `${INTER_BASE_URL}${path}`;
  const resp = await axios.request({
    method,
    url,
    data,
    headers,
    httpsAgent,
    timeout: 30000,
    validateStatus: () => true,
    responseType: (headers.accept && headers.accept.includes("application/pdf")) ? 'arraybuffer' : 'json'
  });
  return resp;
}

// POST /oauth/token -> proxy para o Inter
app.post('/oauth/token', async (req, res) => {
  try {
    const resp = await proxyRequest('post', '/oauth/v2/token', req.body, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });
    res.status(resp.status).send(resp.data);
  } catch (err) {
    console.error(err?.toString());
    res.status(500).json({ error: 'erro interno no bridge', detail: err?.message });
  }
});

// POST /cobrancas -> criar cobrança (boleto)
app.post('/cobrancas', async (req, res) => {
  try {
    const resp = await proxyRequest('post', '/api/v2/cobrancas', req.body, req.headers);
    res.status(resp.status).send(resp.data);
  } catch (err) {
    console.error(err?.toString());
    res.status(500).json({ error: 'erro interno no bridge', detail: err?.message });
  }
});

// GET /cobrancas/:id/pdf -> retorna PDF do boleto
app.get('/cobrancas/:id/pdf', async (req, res) => {
  try {
    const id = req.params.id;
    const path = `/api/v2/cobrancas/${encodeURIComponent(id)}/pdf`;
    const resp = await proxyRequest('get', path, null, req.headers);
    if (resp.headers['content-type'] && resp.headers['content-type'].includes('pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.status(resp.status).send(resp.data);
    } else {
      res.status(resp.status).send(resp.data);
    }
  } catch (err) {
    console.error(err?.toString());
    res.status(500).json({ error: 'erro interno no bridge', detail: err?.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Inter Bridge rodando na porta ${PORT}`));
