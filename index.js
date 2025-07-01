require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const originValidator = require("./middlewares/originValidator");
const rateLimiter = require("./middlewares/rateLimiter");
const logger = require("./utils/logger");
const { createResponse } = require("./utils/apiResponse");
const agendamentoRoutes = require("./routes/agendamentoRoutes");
const clienteRoutes = require("./routes/clienteRoutes");
const { handleWebhook } = require("./controllers/dialogflowWebhookController");

const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(rateLimiter);

app.use("/api/agendamento", agendamentoRoutes);
app.use("/api/clientes", clienteRoutes);

// Encaminha as requisições do webhook para o controller
app.post("/webhook", originValidator, handleWebhook);

// Middleware global de tratamento de erros
app.use((err, req, res, next) => {
  logger.error(null, err);
  if (err.status === 400 || err.name === 'ValidationError') {
    return res.status(400).json(createResponse(false, null, err.message));
  }
  res.status(500).json(createResponse(false, null, 'Erro interno do servidor'));
});

app.listen(port, () => {
  logger.info(`🚀 Servidor rodando em http://localhost:${port}`);
});
