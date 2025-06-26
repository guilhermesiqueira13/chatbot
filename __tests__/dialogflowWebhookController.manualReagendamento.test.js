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
  return {
    SessionsClient: jest.fn().mockImplementation(() => ({
      projectAgentSessionPath: jest.fn(() => 'path'),
      detectIntent: jest.fn().mockResolvedValue([
        {
          queryResult: {
            intent: { displayName: 'confirmar_inicio_reagendamento' },
            parameters: { fields: {} },
            fulfillmentText: '',
            outputContexts: [ { name: 'projects/p/agent/sessions/sid/contexts/reagendamento_awaiting_datahora' } ],
          },
        },
      ]),
    })),
  };
});

jest.mock('../services/calendarService', () => ({
  listarHorariosDisponiveis: jest.fn(() => Promise.resolve(['09:00'])),
  criarAgendamento: jest.fn(),
  cancelarAgendamento: jest.fn(),
}));

const { handleWebhook, __test } = require('../controllers/dialogflowWebhookController');
const { agendamentosPendentes } = __test;

describe('manual reagendamento via webhook', () => {
  beforeEach(() => {
    agendamentosPendentes.clear();
    jest.clearAllMocks();
  });

  test('numero seleciona agendamento e avanca estado', async () => {
    agendamentosPendentes.set('user', {
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
    const estado = agendamentosPendentes.get('user');
    expect(estado.confirmationStep).toBe('awaiting_reagendamento_time');
  });
});
