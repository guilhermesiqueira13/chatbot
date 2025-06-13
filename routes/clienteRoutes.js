const express = require('express');
const router = express.Router();

const { encontrarOuCriarCliente, atualizarNomeCliente } = require('../controllers/clienteController');

// Cria ou retorna cliente existente a partir do telefone
router.post('/buscar-ou-criar', async (req, res, next) => {
  const { telefone, profileName } = req.body;
  if (!telefone) {
    return res.status(400).json({ error: 'telefone é obrigatório' });
  }
  try {
    const cliente = await encontrarOuCriarCliente(telefone, profileName);
    res.json(cliente);
  } catch (err) {
    next(err);
  }
});

// Atualiza o nome de um cliente
router.put('/:id/nome', async (req, res, next) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }
  try {
    const cliente = await atualizarNomeCliente(id, nome);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(cliente);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
