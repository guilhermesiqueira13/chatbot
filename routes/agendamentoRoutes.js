const express = require('express');
const router = express.Router();

const { buscarHorariosDisponiveis, agendarServico } = require('../controllers/agendamentoController');
const { cancelarAgendamento } = require('../controllers/gerenciamentoController');
const { ValidationError } = require('../utils/errors');

// Lista horários disponíveis para uma data (YYYY-MM-DD)
router.get('/horarios', async (req, res, next) => {
  const { data } = req.query;
  if (!data) {
    return res.status(400).json({ error: 'Parâmetro "data" é obrigatório' });
  }

  try {
    const horarios = await buscarHorariosDisponiveis(data);
    res.json({ horarios });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// Agenda um serviço
router.post('/agendar', async (req, res, next) => {
  const { clienteId, clienteNome, servicoNome, horario } = req.body;
  try {
    const resultado = await agendarServico({ clienteId, clienteNome, servicoNome, horario });
    if (!resultado.success) {
      return res.status(400).json({ error: resultado.message });
    }
    res.json(resultado);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// Cancela um agendamento
router.post('/cancelar', async (req, res, next) => {
  const { agendamentoId, googleEventId } = req.body;
  if (!agendamentoId) {
    return res.status(400).json({ error: 'agendamentoId é obrigatório' });
  }

  try {
    const resultado = await cancelarAgendamento(agendamentoId, googleEventId);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
