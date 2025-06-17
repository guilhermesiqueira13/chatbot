const express = require('express');
const router = express.Router();

const {
  buscarHorariosDisponiveis,
  agendarServico,
} = require("../controllers/agendamentoController");
const { cancelarAgendamento } = require("../controllers/gerenciamentoController");
const { ValidationError } = require("../utils/errors");
const { createResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// Lista horários disponíveis para uma data (YYYY-MM-DD)
router.get('/horarios', async (req, res, next) => {
  const { data } = req.query;
  if (!data) {
    return res
      .status(400)
      .json(createResponse(false, null, 'Parâmetro "data" é obrigatório'));
  }

  try {
    const horarios = await buscarHorariosDisponiveis(data);
    res.json(createResponse(true, horarios, "Horários disponíveis"));
  } catch (err) {
    logger.error(null, err);
    if (err instanceof ValidationError) {
      return res.status(400).json(createResponse(false, null, err.message));
    }
    next(err);
  }
});

// Agenda um serviço
router.post('/agendar', async (req, res, next) => {
  const { clienteId, clienteNome, servicoNome, horario } = req.body;
  try {
    const resultado = await agendarServico({
      clienteId,
      clienteNome,
      servicoNome,
      horario,
    });
    if (!resultado.success) {
      return res.status(400).json(createResponse(false, null, resultado.message));
    }
    res.json(
      createResponse(true, {
        agendamentoId: resultado.agendamentoId,
        eventId: resultado.eventId,
      }, "Agendamento realizado com sucesso")
    );
  } catch (err) {
    logger.error(null, err);
    if (err instanceof ValidationError) {
      return res.status(400).json(createResponse(false, null, err.message));
    }
    next(err);
  }
});

// Cancela um agendamento
router.post('/cancelar', async (req, res, next) => {
  const { agendamentoId, googleEventId } = req.body;
  if (!agendamentoId) {
    return res
      .status(400)
      .json(createResponse(false, null, "agendamentoId é obrigatório"));
  }

  try {
    const resultado = await cancelarAgendamento(agendamentoId, googleEventId);
    if (!resultado.success) {
      return res.status(400).json(createResponse(false, null, resultado.message));
    }
    res.json(createResponse(true, null, "Agendamento cancelado"));
  } catch (err) {
    logger.error(null, err);
    next(err);
  }
});

module.exports = router;
