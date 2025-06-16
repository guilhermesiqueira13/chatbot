jest.mock('googleapis', () => {
  const events = { list: jest.fn(), insert: jest.fn(), delete: jest.fn() };
  return {
    __eventsMock: events,
    google: {
      auth: { GoogleAuth: jest.fn() },
      calendar: jest.fn(() => ({ events }))
    }
  };
});

const { __eventsMock } = require('googleapis');
const calendarService = require('../services/calendarService');

describe('calendarService', () => {
  beforeEach(() => {
    __eventsMock.list.mockReset();
    __eventsMock.insert.mockReset();
    __eventsMock.delete.mockReset();
  });

  test('listarHorariosDisponiveis retorna horarios livres', async () => {
    __eventsMock.list.mockResolvedValue({ data: { items: [
      { start: { dateTime: '2024-01-01T10:00:00-03:00' } },
      { start: { dateTime: '2024-01-01T11:30:00-03:00' } }
    ] } });

    const horarios = await calendarService.listarHorariosDisponiveis('2024-01-01');
    expect(horarios).toContain('12:00');
    expect(horarios).not.toContain('13:00');
    expect(horarios).toContain('13:30');
  });

  test('listarHorariosDisponiveis ignora domingos', async () => {
    __eventsMock.list.mockResolvedValue({ data: { items: [] } });
    const horarios = await calendarService.listarHorariosDisponiveis('2024-01-07');
    expect(horarios).toEqual([]);
  });

  test('criarAgendamento repassa dados ao googleapis', async () => {
    __eventsMock.insert.mockResolvedValue({ data: { id: 'ev123' } });
    const dados = { cliente: 'Ana', servicos: ['Corte', 'Barba'], horario: '2024-01-01T09:00:00-03:00' };
    const resp = await calendarService.criarAgendamento(dados);
    expect(__eventsMock.insert).toHaveBeenCalledWith({
      calendarId: expect.any(String),
      requestBody: expect.objectContaining({ summary: 'Corte, Barba - Ana' })
    });
    expect(resp).toEqual({ id: 'ev123' });
  });

  test('cancelarAgendamento chama events.delete', async () => {
    __eventsMock.delete.mockResolvedValue();
    await calendarService.cancelarAgendamento('ev456');
    expect(__eventsMock.delete).toHaveBeenCalledWith({
      calendarId:
        '99435b27c68a7a48eca3aa3ab9770b8d0207851464d88c89e55c763bfca69c0a@group.calendar.google.com',
      eventId: 'ev456',
    });
  });
});
