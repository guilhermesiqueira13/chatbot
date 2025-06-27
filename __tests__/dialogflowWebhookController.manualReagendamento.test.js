jest.mock('../services/twilioService', () => ({
  sendWhatsApp: jest.fn(() => Promise.resolve({ sid: '1' })),
  waitForDelivery: jest.fn(() => Promise.resolve()),
}));

jest.mock('../controllers/clienteController', () => ({
  encontrarOuCriarCliente: jest.fn(() => Promise.resolve({ id: 10, nome: 'Jose', telefone: '+5511999999999' })),
  atualizarNomeCliente: jest.fn(),
  buscarClientePorTelefone: jest.fn(),
}));

jest.mock('@google-cloud/dialogflow', () => {
  const detectIntentMock = jest.fn();
  return {
    __detectIntentMock: detectIntentMock,
    SessionsClient: jest.fn().mockImplementation(() => ({
      projectAgentSessionPath: jest.fn(() => 'path'),
      detectIntent: detectIntentMock,
    })),
  };
});
const { __detectIntentMock: detectIntentMock } = require('@google-cloud/dialogflow');

jest.mock('../controllers/gerenciamentoController', () => ({
  reagendarAgendamento: jest.fn(),
}));

jest.mock('../services/calendarService', () => ({
  listarHorariosDisponiveis: jest.fn(() => Promise.resolve(['09:00'])),
  criarAgendamento: jest.fn(),
  cancelarAgendamento: jest.fn(),
}));

const { handleWebhook, __test } = require('../controllers/dialogflowWebhookController');
const { sessionStore } = __test;

describe('manual reagendamento via webhook', () => {
  beforeEach(() => {
    Object.keys(sessionStore._store).forEach(k => delete sessionStore._store[k]);
    jest.clearAllMocks();
    detectIntentMock.mockResolvedValue([
      {
        queryResult: {
          intent: { displayName: 'confirmar_inicio_reagendamento' },
          parameters: { fields: {} },
          fulfillmentText: '',
          outputContexts: [
            {
              name:
                'projects/p/agent/sessions/sid/contexts/reagendamento_awaiting_datahora',
            },
          ],
        },
      },
    ]);
  });

  test('numero seleciona agendamento e avanca estado', async () => {
    sessionStore.set('user', {
      fluxo: 'reagendamento',
      confirmationStep: 'awaiting_reagendamento',
      agendamentos: [
        { id: 1, servico: 'Corte', horario: '2030-01-01T10:00:00-03:00', google_event_id: 'g1' },
      ],
      clienteId: 10,
    });

    const req = { body: { Body: '1', From: 'user', ProfileName: 'Jose' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    await handleWebhook(req, res);

    expect(require('../services/twilioService').sendWhatsApp).toHaveBeenCalled();
    const estado = sessionStore.get('user');
    expect(estado.confirmationStep).toBe('awaiting_reagendamento_time');
  });

  test('sim confirma reagendamento e limpa estado', async () => {
    const { reagendarAgendamento } = require('../controllers/gerenciamentoController');
    reagendarAgendamento.mockResolvedValue({ success: true });

    sessionStore.set('user', {
      fluxo: 'reagendamento',
      confirmationStep: 'awaiting_reagendamento_confirm',
      agendamentoId: 1,
      novoHorario: '2030-01-02T09:00:00-03:00',
      servico: 'Corte',
      eventId: 'g1',
      clienteId: 10,
    });

    detectIntentMock.mockResolvedValueOnce([
      {
        queryResult: {
          intent: { displayName: 'confirmar_reagendamento' },
          parameters: { fields: {} },
          fulfillmentText: '',
          outputContexts: [],
        },
      },
    ]);

    const req = { body: { Body: 'sim', From: 'user', ProfileName: 'Jose' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    await handleWebhook(req, res);

    expect(reagendarAgendamento).toHaveBeenCalledWith(1, '2030-01-02T09:00:00-03:00', 'g1', 10);
    expect(sessionStore.has('user')).toBe(false);
  });

  test('confirma reagendamento mesmo com intent incorreta', async () => {
    const { reagendarAgendamento } = require('../controllers/gerenciamentoController');
    reagendarAgendamento.mockResolvedValue({ success: true });

    sessionStore.set('user', {
      fluxo: 'reagendamento',
      confirmationStep: 'awaiting_reagendamento_confirm',
      agendamentoId: 1,
      novoHorario: '2030-01-02T09:00:00-03:00',
      servico: 'Corte',
      eventId: 'g1',
      clienteId: 10,
    });

    detectIntentMock.mockResolvedValueOnce([
      {
        queryResult: {
          intent: { displayName: 'confirmar_inicio_reagendamento' },
          parameters: { fields: {} },
          fulfillmentText: '',
          outputContexts: [],
        },
      },
    ]);

    const req = { body: { Body: 'confirmar', From: 'user', ProfileName: 'Jose' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    await handleWebhook(req, res);

    expect(reagendarAgendamento).toHaveBeenCalledWith(1, '2030-01-02T09:00:00-03:00', 'g1', 10);
    expect(sessionStore.has('user')).toBe(false);
  });
});
