// gerenciamentoController.js
const pool = require("../db");
const {
  cancelarAgendamento: cancelarEvento,
  criarAgendamento,
} = require("../services/calendarService");

async function cancelarAgendamento(agendamentoId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [agendamento] = await connection.query(
      'SELECT google_event_id FROM agendamentos WHERE id = ? AND status = "ativo"',
      [agendamentoId]
    );

    if (!agendamento || agendamento.length === 0) {
      await connection.release();
      return {
        success: false,
        message: "Agendamento não encontrado ou já cancelado.",
      };
    }

    try {
      await cancelarEvento(agendamento[0].google_event_id);
    } catch (e) {
      console.error("Erro ao cancelar evento no Google Calendar:", e);
    }

    await connection.query('UPDATE agendamentos SET status = "cancelado" WHERE id = ?', [agendamentoId]);

    await connection.commit();
    await connection.release();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    await connection.release();
    console.error("Erro em cancelarAgendamento:", error);
    return {
      success: false,
      message: "Erro interno ao cancelar o agendamento.",
    };
  }
}

// Resto do arquivo permanece igual
async function listarAgendamentosAtivos(clienteId) {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.google_event_id, a.horario, s.nome AS servico
       FROM agendamentos a
       JOIN agendamentos_servicos asv ON a.id = asv.agendamento_id
       JOIN servicos s ON asv.servico_id = s.id
       WHERE a.cliente_id = ? AND a.status = 'ativo'`,
      [clienteId]
    );
    return rows;
  } catch (error) {
    console.error("Erro ao listar agendamentos ativos:", error);
    throw new Error("Erro ao listar agendamentos ativos.");
  }
}

async function reagendarAgendamento(agendamentoId, novoHorario) {
  try {
    await pool.query("START TRANSACTION");

    const [agendamento] = await pool.query(
      'SELECT google_event_id FROM agendamentos WHERE id = ? AND status = "ativo"',
      [agendamentoId]
    );
    if (!agendamento.length) {
      await pool.query("ROLLBACK");
      return {
        success: false,
        message: "Agendamento não encontrado ou já cancelado.",
      };
    }

    try {
      await cancelarEvento(agendamento[0].google_event_id);
    } catch (e) {
      console.error("Erro ao cancelar evento antigo no Google Calendar:", e);
    }

    const evento = await criarAgendamento({ cliente: "", servico: "", horario: novoHorario });

    await pool.query(
      "UPDATE agendamentos SET google_event_id = ?, horario = ? WHERE id = ?",
      [evento.id, novoHorario, agendamentoId]
    );

    await pool.query("COMMIT");
    return { success: true };
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Erro ao reagendar:", error);
    return {
      success: false,
      message: "Ops, algo deu errado ao reagendar. Tente novamente.",
    };
  }
}

module.exports = {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
};
