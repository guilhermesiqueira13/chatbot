const express = require('express');
const router = express.Router();

const { encontrarOuCriarCliente, atualizarNomeCliente } = require('../controllers/clienteController');

// Cria ou retorna cliente existente a partir do telefone
router.post('/buscar-ou-criar', async (req, res) => {
  const { telefone, profileName } = req.body;
  if (!telefone) {
    return res.status(400).json({ error: 'telefone é obrigatório' });
  }
  try {
    const cliente = await encontrarOuCriarCliente(telefone, profileName);
    res.json(cliente);
  } catch (err) {
    console.error('Erro ao buscar/criar cliente:', err);
    res.status(500).json({ error: 'Erro ao buscar ou criar cliente' });
  }
});

// Atualiza o nome de um cliente
router.put('/:id/nome', async (req, res) => {
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
    console.error('Erro ao atualizar cliente:', err);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

module.exports = router;
