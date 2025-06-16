const pool = require("../db");
const {
  listarHorariosDisponiveis,
  criarAgendamento,
} = require("../services/calendarService");
const {
  isValidServico,
  isValidDataHora,
  isValidNome,
} = require("../utils/validation");
const { ValidationError } = require("../utils/errors");

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
    return {
      success: false,
      message:
        "Data e hora inválidas. Use o formato DD/MM/YYYY HH:mm e escolha um horário futuro.",
    };
  }
  try {
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
      message: "Ops, algo deu errado ao agendar. Tente novamente.",
    };
  }
}

module.exports = { buscarHorariosDisponiveis, agendarServico };
