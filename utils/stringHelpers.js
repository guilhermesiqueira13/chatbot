function normalizarServico(servicoNome) {
  return servicoNome.toLowerCase().replace(/\s+/g, '');
}

module.exports = { normalizarServico };
