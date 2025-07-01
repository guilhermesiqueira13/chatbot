const { listarHorariosDisponiveis } = require("../services/calendarService");
const { DateTime } = require("luxon");

const TIME_ZONE = "America/Sao_Paulo";

function removeAccents(str) {
  return str.normalize("NFD").replace(/[̀-\u036f]/g, "");
}

function getNextDateFromText(texto) {
  if (!texto || typeof texto !== "string") return null;
  const norm = removeAccents(texto.trim().toLowerCase());

  const hoje = DateTime.now().setZone(TIME_ZONE).startOf("day");

  if (norm === "hoje") return hoje.toISODate();
  if (norm === "amanha") return hoje.plus({ days: 1 }).toISODate();

  const dias = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ];

  let idx = dias.indexOf(norm);
  if (idx === -1) {
    idx = dias.findIndex((d) => d.startsWith(norm));
  }
  if (idx === -1) return null;

  const hojeIdx = hoje.weekday % 7;
  const delta = (idx - hojeIdx + 7) % 7;
  return hoje.plus({ days: delta }).toISODate();
}

function formatarDataHorarioBr(date) {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: TIME_ZONE })
      : DateTime.fromJSDate(date).setZone(TIME_ZONE);
  if (!dt.isValid) {
    throw new Error("Data inválida fornecida");
  }
  return dt.setLocale("pt-BR").toFormat("dd/LL/yyyy HH:mm");
}

function encontrarHorarioProximo(horarioSolicitadoStr, horariosDisponiveis) {
  if (
    !horarioSolicitadoStr ||
    !horariosDisponiveis ||
    !horariosDisponiveis.length
  ) {
    return null;
  }
  const solicitado = DateTime.fromISO(horarioSolicitadoStr, {
    zone: TIME_ZONE,
  });
  if (!solicitado.isValid) return null;

  return horariosDisponiveis.reduce(
    (maisProximo, horario) => {
      const disponivel = DateTime.fromISO(horario.dia_horario, {
        zone: TIME_ZONE,
      });
      if (!disponivel.isValid) return maisProximo;
      const diferenca = Math.abs(solicitado.diff(disponivel).milliseconds);
      if (diferenca < maisProximo.diferenca) {
        return { horario, diferenca };
      }
      return maisProximo;
    },
    { horario: null, diferenca: Infinity }
  ).horario;
}

function getDateFromWeekdayAndTime(diaSemanaStr, horaStr) {
  const diasDaSemana = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  const diaSemanaIndex = diasDaSemana.findIndex((d) =>
    d.includes(diaSemanaStr.replace("-feira", ""))
  );
  if (diaSemanaIndex === -1) return null;

  const [hora, minuto = "00"] = horaStr.split(":");
  const hoje = DateTime.now().setZone(TIME_ZONE);
  let data = hoje.plus({ days: (diaSemanaIndex - hoje.weekday + 7) % 7 });
  data = data.set({
    hour: parseInt(hora, 10),
    minute: parseInt(minuto, 10),
    second: 0,
    millisecond: 0,
  });

  if (data < hoje && diaSemanaIndex === hoje.weekday - 1) {
    data = data.plus({ days: 7 });
  }

  return data.toJSDate();
}

async function listarTodosHorariosDisponiveis(dias = 7) {
  const horarios = [];
  const hoje = DateTime.now().setZone(TIME_ZONE).startOf("day");
  let adicionados = 0;
  let offset = 0;
  while (adicionados < dias) {
    const data = hoje.plus({ days: offset });
    offset++;
    if (data.weekday === 7) {
      continue;
    }
    const dataStr = data.toISODate();
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
    const dt = DateTime.fromISO(h.dia_horario, { zone: TIME_ZONE });
    if (dt.weekday === 7) {
      continue;
    }
    const data = dt.toISODate();
    const hora = dt.toFormat("HH:mm");
    if (!diasMap[data]) diasMap[data] = [];
    diasMap[data].push(hora);
  }
  return diasMap;
}

function formatarDiaBr(dataStr) {
  const data = DateTime.fromISO(dataStr, { zone: TIME_ZONE });
  const dia = data.setLocale("pt-BR").toFormat("cccc");
  const dataFmt = data.toFormat("dd/LL/yyyy");
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${diaCapitalizado} (${dataFmt})`;
}

function gerarMensagemDias(diasMap, start = 0, count = 6) {
  const dias = Object.keys(diasMap).slice(start, start + count);
  return dias.map((d) => `- ${formatarDiaBr(d)}`).join("\n");
}

function gerarMensagemHorarios(horas) {
  return horas.map((h, i) => `${i + 1}. ${h}`).join("\n");
}

module.exports = {
  formatarDataHorarioBr,
  encontrarHorarioProximo,
  getDateFromWeekdayAndTime,
  listarTodosHorariosDisponiveis,
  listarDiasDisponiveis,
  formatarDiaBr,
  gerarMensagemDias,
  gerarMensagemHorarios,
  getNextDateFromText,
};
