jest.mock('../db', () => ({ query: jest.fn() }));
const pool = require('../db');

jest.mock('../services/calendarService', () => ({
  listarHorariosDisponiveis: jest.fn(),
  criarAgendamento: jest.fn(),
  cancelarAgendamento: jest.fn(),
}));
const calendarService = require('../services/calendarService');

const { agendarServico } = require('../controllers/agendamentoController');

describe('agendamentoController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('agendarServico cria registro no banco e evento no calendario', async () => {
    pool.query.mockImplementation((sql) => {
      if (sql.startsWith('SHOW COLUMNS')) return Promise.resolve([[]]);
      if (sql.startsWith('ALTER TABLE')) return Promise.resolve();
      if (sql.startsWith('INSERT INTO agendamentos')) return Promise.resolve([{ insertId: 7 }]);
      return Promise.resolve([]);
    });

    calendarService.criarAgendamento.mockResolvedValue({ id: 'e1' });

    const resp = await agendarServico({
      clienteId: 1,
      clienteNome: 'Jose',
      servicosNomes: ['corte', 'barba'],
      horario: '2024-01-01T09:00:00-03:00'
    });

    expect(calendarService.criarAgendamento).toHaveBeenCalledWith({
      cliente: 'Jose',
      servicos: ['corte', 'barba'],
      horario: '2024-01-01T09:00:00-03:00'
    });
    expect(resp).toEqual({ success: true, agendamentoId: 7, eventId: 'e1' });
  });
});
