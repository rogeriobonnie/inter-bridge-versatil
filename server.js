import express from "express";
import axios from "axios";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const INTER_TOKEN_URL = "https://cdpj.partners.uat.inter.co/oauth/v2/token";

// Test route
app.get("/", (req, res) => {
  res.send("Inter Bridge is running ✅");
});

app.post("/get-token", async (req, res) => {
  try {
    console.log("📩 Body recebido:", req.body);

    const payloadObj = {
      grant_type: "client_credentials",
      client_id: req.body.client_id || process.env.INTER_CLIENT_ID,
      client_secret: req.body.client_secret || process.env.INTER_CLIENT_SECRET,
      scope: req.body.scope || "oapi",
    };

    console.log("📤 Payload enviado ao Inter:", payloadObj);

    const response = await axios.post(
      INTER_TOKEN_URL,
      new URLSearchParams(payloadObj),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("✅ Token recebido do Inter");
    res.json(response.data);

  } catch (error) {
    console.error("❌ Erro ao buscar token:", error?.response?.data || error.message);

    res.status(error?.response?.status || 500).json({
      error: true,
      message: "Erro ao buscar token",
      details: error?.response?.data || error.message,
    });
  }
});

// Automatic process handling (Render)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Inter Bridge rodando na porta ${PORT}`);
});
