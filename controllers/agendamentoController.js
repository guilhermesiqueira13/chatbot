const pool = require("../db");
const {
  listarHorariosDisponiveis,
  criarAgendamento,
} = require("../services/calendarService");
const {
  isValidServico,
  isValidDataHora,
  isValidNome,
  isDentroHorarioAtendimento,
} = require("../utils/validation");
const { ValidationError } = require("../utils/errors");

const mensagens = require("../utils/mensagensUsuario");

const logger = require("../utils/logger");
// Garante que a coluna google_event_id exista na tabela de agendamentos
async function ensureGoogleEventIdColumn() {
  const [rows] = await pool.query(
    "SHOW COLUMNS FROM agendamentos LIKE 'google_event_id'"
  );
  if (rows.length === 0) {
    await pool.query(
      "ALTER TABLE agendamentos ADD COLUMN google_event_id VARCHAR(255)"
    );
  }
}

async function buscarHorariosDisponiveis(data) {
  if (isNaN(new Date(data).getTime())) {
    throw new ValidationError("Data inválida");
  }
  try {
    const horarios = await listarHorariosDisponiveis(data);
    return horarios;
  } catch (error) {
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro ao buscar horários disponíveis:", error);
    throw new Error("Erro ao buscar horários disponíveis.");
  }
}

async function agendarServico({
  clienteId,
  clienteNome,
  servicoNome,
  servicosNomes,
  horario,
}) {
  if (!clienteId || isNaN(parseInt(clienteId))) {
    return { success: false, message: "ID do cliente inválido." };
  }
  if (clienteNome && !isValidNome(clienteNome)) {
    return {
      success: false,
      message:
        "O nome deve possuir ao menos 3 letras e conter apenas caracteres alfabéticos.",
    };
  }
  // Permite string separada por vírgulas ou array de nomes
  let servicos = [];
  if (Array.isArray(servicosNomes)) {
    servicos = servicosNomes;
  } else if (Array.isArray(servicoNome)) {
    servicos = servicoNome;
  } else if (typeof servicoNome === "string") {
    servicos = servicoNome.split(/,\s*/);
  }
  servicos = servicos.map((s) => s.trim()).filter((s) => s);
  if (!servicos.length || !servicos.every(isValidServico)) {
    return {
      success: false,
      message:
        "O serviço selecionado é inválido. Escolha entre 'Corte', 'Barba' ou 'Corte + Barba'.",
    };
  }
  if (!isValidDataHora(horario)) {
    return { success: false, message: mensagens.HORARIO_INVALIDO };
  }

  const horarioDate = new Date(horario);
  if (!isDentroHorarioAtendimento(horarioDate)) {
    return { success: false, message: mensagens.HORARIO_INVALIDO };
  }

  try {
    const dataStr = horarioDate.toISOString().slice(0, 10);
    const disponiveis = await listarHorariosDisponiveis(dataStr);
    let horaStr = horarioDate.toTimeString().slice(0, 5);
    const match = typeof horario === 'string' && horario.match(/T(\d{2}:\d{2})/);
    if (match) horaStr = match[1];
    if (!disponiveis.includes(horaStr)) {
      return { success: false, message: mensagens.HORARIO_INVALIDO };
    }

    await ensureGoogleEventIdColumn();

    const evento = await criarAgendamento({
      cliente: clienteNome,
      servicos,
      horario,
    });

    const [result] = await pool.query(
      `INSERT INTO agendamentos (cliente_id, google_event_id, horario, status, data_agendamento)
       VALUES (?, ?, ?, 'ativo', NOW())`,
      [clienteId, evento.id, horario]
    );
    const agendamentoId = result.insertId;

    // A associação de vários serviços ao agendamento deve ser feita em outra
    // camada (agendamentos_servicos). Mantemos somente a criação do evento no
    // Calendar aqui.

    return { success: true, agendamentoId, eventId: evento.id };
  } catch (error) {
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro ao agendar serviço:", error);
    return {
      success: false,
      message: mensagens.ERRO_AGENDAR,
    };
  }
}

module.exports = { buscarHorariosDisponiveis, agendarServico };
