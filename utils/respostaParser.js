const DEFAULT_ERROR_MSG = "Desculpe, não entendi. Por favor, responda com o nome do dia, a data (ex: 20/06) ou digite 'Ver mais dias' para mais opções.";

function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseEscolhaDia(input) {
  if (!input || typeof input !== 'string') {
    return { type: 'invalid', error: DEFAULT_ERROR_MSG };
  }
  const text = input.trim().toLowerCase();
  const normText = removeAccents(text);
  if (text === 'ver mais dias') {
    return { type: 'verMais' };
  }

  if (text === 'hoje') {
    const hoje = new Date();
    return { type: 'date', value: hoje.toISOString().slice(0, 10) };
  }

  if (/^amanh[ãa]$/.test(normText)) {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    return { type: 'date', value: amanha.toISOString().slice(0, 10) };
  }

  const proxMatch = normText.match(/^proxim[oa]?\s+(\w+)/);
  if (proxMatch) {
    const palavra = proxMatch[1];
    const dias = [
      'domingo',
      'segunda',
      'terça',
      'quarta',
      'quinta',
      'sexta',
      'sábado',
    ];
    for (let i = 0; i < dias.length; i++) {
      if (removeAccents(dias[i]).startsWith(removeAccents(palavra))) {
        return { type: 'weekday', value: i, next: true };
      }
    }
  }

  const dataMatch = normText.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (dataMatch) {
    let [, d, m, a] = dataMatch;
    const year = a || String(new Date().getFullYear());
    d = d.padStart(2, '0');
    m = m.padStart(2, '0');
    return { type: 'date', value: `${year}-${m}-${d}` };
  }

  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const normalized = normText;
  for (let i = 0; i < dias.length; i++) {
    if (removeAccents(dias[i]).startsWith(normalized)) {
      return { type: 'weekday', value: i };
    }
  }

  return { type: 'invalid', error: DEFAULT_ERROR_MSG };
}

const { formatarDataHorarioBr } = require('./dataHelpers');

function parseEscolhaAgendamento(input, agendamentos) {
  if (!input || !Array.isArray(agendamentos)) return null;
  const texto = removeAccents(String(input).trim().toLowerCase());
  const numero = parseInt(texto, 10);
  if (!isNaN(numero)) return agendamentos[numero - 1] || null;

  return (
    agendamentos.find((a) => {
      const desc = removeAccents(
        `${a.servico} ${formatarDataHorarioBr(a.horario)}`.toLowerCase(),
      );
      const descEm = removeAccents(
        `${a.servico} em ${formatarDataHorarioBr(a.horario)}`.toLowerCase(),
      );
      return texto === desc || texto === descEm;
    }) || null
  );
}

module.exports = {
  parseEscolhaDia,
  DEFAULT_ERROR_MSG,
  removeAccents,
  parseEscolhaAgendamento,
};
