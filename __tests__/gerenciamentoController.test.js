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
const { listarAgendamentosAtivos } = require('../controllers/gerenciamentoController');
const { reagendarAgendamento } = require('../controllers/gerenciamentoController');

describe('gerenciamentoController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connection.query.mockReset();
    pool.query.mockReset();
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

  test('listarAgendamentosAtivos utiliza join com servicos', async () => {
    pool.query.mockResolvedValue([[]]);
    await listarAgendamentosAtivos(3);
    const calledSql = pool.query.mock.calls[0][0];
    expect(calledSql).toMatch(/JOIN agendamentos_servicos/);
  });

  test('reagendarAgendamento cria novo evento e atualiza dados', async () => {
    pool.query.mockImplementation((sql) => {
      if (sql.startsWith('START TRANSACTION')) return Promise.resolve();
      if (sql.startsWith('SELECT a.google_event_id'))
        return Promise.resolve([[{ google_event_id: 'old', cliente_nome: 'Jose', servicos: 'Corte' }]]);
      if (sql.startsWith('UPDATE agendamentos SET')) return Promise.resolve();
      if (sql.startsWith('COMMIT')) return Promise.resolve();
      return Promise.resolve([]);
    });
    calendarService.cancelarAgendamento.mockResolvedValue();
    calendarService.criarAgendamento.mockResolvedValue({ id: 'new' });

    const resp = await reagendarAgendamento(1, '2030-01-01T10:00:00-03:00');

    expect(calendarService.cancelarAgendamento).toHaveBeenCalledWith('old');
    expect(calendarService.criarAgendamento).toHaveBeenCalledWith({
      cliente: 'Jose',
      servicos: ['Corte'],
      horario: '2030-01-01T10:00:00-03:00',
    });
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE agendamentos SET google_event_id = ?, horario = ? WHERE id = ?',
      ['new', '2030-01-01T10:00:00-03:00', 1],
    );
    expect(resp).toEqual({ success: true });
  });
});
