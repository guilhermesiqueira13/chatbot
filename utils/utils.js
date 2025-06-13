function formatarDataHorarioBr(date) {
  const data = new Date(date);
  if (isNaN(data.getTime())) {
    throw new Error('Data inválida fornecida');
  }

  const dataStr = data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const horaStr = data.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  return `${dataStr} ${horaStr}`;
}

module.exports = { formatarDataHorarioBr };
