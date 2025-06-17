const express = require('express');
const router = express.Router();

const {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
} = require("../controllers/clienteController");
const { ValidationError } = require("../utils/errors");
const { createResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// Cria ou retorna cliente existente a partir do telefone
router.post('/buscar-ou-criar', async (req, res, next) => {
  const { telefone, profileName } = req.body;
  if (!telefone) {
    return res
      .status(400)
      .json(createResponse(false, null, "telefone é obrigatório"));
  }
  try {
    const cliente = await encontrarOuCriarCliente(telefone, profileName);
    res.json(
      createResponse(true, cliente, "Cliente encontrado ou criado com sucesso")
    );
  } catch (err) {
    logger.error(null, err);
    if (err instanceof ValidationError) {
      return res.status(400).json(createResponse(false, null, err.message));
    }
    next(err);
  }
});

// Atualiza o nome de um cliente
router.put('/:id/nome', async (req, res, next) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome) {
    return res
      .status(400)
      .json(createResponse(false, null, "nome é obrigatório"));
  }
  try {
    const cliente = await atualizarNomeCliente(id, nome);
    if (!cliente) {
      return res
        .status(404)
        .json(createResponse(false, null, "Cliente não encontrado"));
    }
    res.json(createResponse(true, cliente, "Nome atualizado com sucesso"));
  } catch (err) {
    logger.error(null, err);
    if (err instanceof ValidationError) {
      return res.status(400).json(createResponse(false, null, err.message));
    }
    next(err);
  }
});

module.exports = router;
