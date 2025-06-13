const pool = require("../db");
const {
  listarHorariosDisponiveis,
  criarAgendamento,
} = require("../services/calendarService");

async function buscarHorariosDisponiveis(data) {
  try {
    const horarios = await listarHorariosDisponiveis(data);
    return horarios;
  } catch (error) {
    console.error("Erro ao buscar horários disponíveis:", error);
    throw new Error("Erro ao buscar horários disponíveis.");
  }
}

async function agendarServico({ clienteId, clienteNome, servicoNome, horario }) {
  try {
    if (!clienteId || !horario) {
      return { success: false, message: "Cliente ou horário inválido." };
    }

    const evento = await criarAgendamento({
      cliente: clienteNome,
      servico: servicoNome,
      horario,
    });

    const [result] = await pool.query(
      `INSERT INTO agendamentos (cliente_id, google_event_id, horario, status, data_agendamento)
       VALUES (?, ?, ?, 'ativo', NOW())`,
      [clienteId, evento.id, horario]
    );
    const agendamentoId = result.insertId;

    // Aqui assumimos que servicoIds é um único ID referente a servicoNome
    // para manter compatibilidade com a estrutura original
    // Caso haja múltiplos serviços, ajuste conforme necessário

    return { success: true, agendamentoId, eventId: evento.id };
  } catch (error) {
    console.error("Erro ao agendar serviço:", error);
    return {
      success: false,
      message: "Ops, algo deu errado ao agendar. Tente novamente.",
    };
  }
}

module.exports = { buscarHorariosDisponiveis, agendarServico };
