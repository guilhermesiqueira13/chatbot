const express = require('express');
const router = express.Router();

const { buscarHorariosDisponiveis, agendarServico } = require('../controllers/agendamentoController');
const { cancelarAgendamento } = require('../controllers/gerenciamentoController');

// Lista horários disponíveis para uma data (YYYY-MM-DD)
router.get('/horarios', async (req, res) => {
  const { data } = req.query;
  if (!data) {
    return res.status(400).json({ error: 'Parâmetro "data" é obrigatório' });
  }

  try {
    const horarios = await buscarHorariosDisponiveis(data);
    res.json({ horarios });
  } catch (err) {
    console.error('Erro ao buscar horários:', err);
    res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
  }
});

// Agenda um serviço
router.post('/agendar', async (req, res) => {
  const { clienteId, clienteNome, servicoNome, horario } = req.body;
  try {
    const resultado = await agendarServico({ clienteId, clienteNome, servicoNome, horario });
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao agendar serviço:', err);
    res.status(500).json({ error: 'Erro ao agendar serviço' });
  }
});

// Cancela um agendamento
router.post('/cancelar', async (req, res) => {
  const { agendamentoId, googleEventId } = req.body;
  if (!agendamentoId) {
    return res.status(400).json({ error: 'agendamentoId é obrigatório' });
  }

  try {
    const resultado = await cancelarAgendamento(agendamentoId, googleEventId);
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao cancelar agendamento:', err);
    res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

module.exports = router;
