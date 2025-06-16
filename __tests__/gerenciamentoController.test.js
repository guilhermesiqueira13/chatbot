jest.mock('../db', () => {
  const connection = {
    beginTransaction: jest.fn(),
    query: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
  return { getConnection: jest.fn(() => connection), query: jest.fn(), __connection: connection };
});
const pool = require('../db');
const connection = pool.__connection;

jest.mock('../services/calendarService', () => ({
  cancelarAgendamento: jest.fn(),
  criarAgendamento: jest.fn(),
}));
const calendarService = require('../services/calendarService');

const { cancelarAgendamento } = require('../controllers/gerenciamentoController');

describe('gerenciamentoController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connection.query.mockReset();
  });

  test('cancelarAgendamento atualiza status e cancela evento', async () => {
    connection.query.mockImplementationOnce(() => Promise.resolve([[{ google_event_id: 'g1' }]]));
    connection.query.mockImplementationOnce(() => Promise.resolve());
    calendarService.cancelarAgendamento.mockResolvedValue();

    const resp = await cancelarAgendamento(5);
    expect(calendarService.cancelarAgendamento).toHaveBeenCalledWith('g1');
    expect(connection.query).toHaveBeenCalledWith('UPDATE agendamentos SET status = "cancelado" WHERE id = ?', [5]);
    expect(resp).toEqual({ success: true });
  });
});
