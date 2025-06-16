const { listarHorariosDisponiveis } = require('../services/calendarService');

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
    minute: '2-digit',
  });
  return `${dataStr} ${horaStr}`;
}

function encontrarHorarioProximo(horarioSolicitadoStr, horariosDisponiveis) {
  if (!horarioSolicitadoStr || !horariosDisponiveis || !horariosDisponiveis.length) {
    return null;
  }
  const solicitado = new Date(horarioSolicitadoStr);
  if (isNaN(solicitado.getTime())) return null;

  return horariosDisponiveis.reduce(
    (maisProximo, horario) => {
      const disponivel = new Date(horario.dia_horario);
      if (isNaN(disponivel.getTime())) return maisProximo;
      const diferenca = Math.abs(solicitado - disponivel);
      if (diferenca < maisProximo.diferenca) {
        return { horario, diferenca };
      }
      return maisProximo;
    },
    { horario: null, diferenca: Infinity },
  ).horario;
}

function getDateFromWeekdayAndTime(diaSemanaStr, horaStr) {
  const diasDaSemana = [
    'domingo',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
  ];
  const diaSemanaIndex = diasDaSemana.findIndex((d) =>
    d.includes(diaSemanaStr.replace('-feira', '')),
  );
  if (diaSemanaIndex === -1) return null;

  const [hora, minuto = '00'] = horaStr.split(':');
  const hoje = new Date();
  let data = new Date(hoje);

  const diferencaDias = (diaSemanaIndex - hoje.getDay() + 7) % 7;
  data.setDate(hoje.getDate() + diferencaDias);

  data.setHours(parseInt(hora, 10), parseInt(minuto, 10), 0, 0);

  if (data < hoje && diferencaDias === 0) {
    data.setDate(data.getDate() + 7);
  }

  return data;
}

async function listarTodosHorariosDisponiveis(dias = 7) {
  const horarios = [];
  const hoje = new Date();
  let adicionados = 0;
  let offset = 0;
  while (adicionados < dias) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + offset);
    offset++;
    // Ignora domingos (getDay() === 0)
    if (data.getDay() === 0) {
      continue;
    }
    const dataStr = data.toISOString().slice(0, 10);
    const horas = await listarHorariosDisponiveis(dataStr);
    for (const hora of horas) {
      horarios.push({ dia_horario: `${dataStr}T${hora}:00` });
    }
    adicionados++;
  }
  return horarios;
}

async function listarDiasDisponiveis(dias = 14) {
  const horarios = await listarTodosHorariosDisponiveis(dias);
  const diasMap = {};
  for (const h of horarios) {
    const [data, horaParte] = h.dia_horario.split('T');
    const hora = horaParte.slice(0, 5);
    if (!diasMap[data]) diasMap[data] = [];
    diasMap[data].push(hora);
  }
  return diasMap;
}

function formatarDiaBr(dataStr) {
  const data = new Date(dataStr);
  const dia = data
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .replace('-feira', '');
  const dataFmt = data.toLocaleDateString('pt-BR');
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} (${dataFmt})`;
}

module.exports = {
  formatarDataHorarioBr,
  encontrarHorarioProximo,
  getDateFromWeekdayAndTime,
  listarTodosHorariosDisponiveis,
  listarDiasDisponiveis,
  formatarDiaBr,
};
