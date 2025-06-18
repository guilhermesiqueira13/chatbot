const {
  parseEscolhaDia,
  DEFAULT_ERROR_MSG,
  parseEscolhaAgendamento,
} = require('../utils/respostaParser');
const { formatarDataHorarioBr } = require('../utils/dataHelpers');

describe('parseEscolhaDia', () => {
  test('reconhece dia da semana', () => {
    const res = parseEscolhaDia('Terça');
    expect(res).toEqual({ type: 'weekday', value: 2 });
  });

  test('reconhece data dd/mm', () => {
    const year = new Date().getFullYear();
    const res = parseEscolhaDia('05/07');
    expect(res).toEqual({ type: 'date', value: `${year}-07-05` });
  });

  test('reconhece data completa', () => {
    const res = parseEscolhaDia('12/10/2025');
    expect(res).toEqual({ type: 'date', value: '2025-10-12' });
  });

  test('reconhece ver mais dias', () => {
    const res = parseEscolhaDia('Ver mais dias');
    expect(res).toEqual({ type: 'verMais' });
  });

  test('reconhece hoje e amanha', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const amanhaDate = new Date();
    amanhaDate.setDate(amanhaDate.getDate() + 1);
    const amanha = amanhaDate.toISOString().slice(0, 10);
    expect(parseEscolhaDia('hoje')).toEqual({ type: 'date', value: hoje });
    expect(parseEscolhaDia('amanhã')).toEqual({ type: 'date', value: amanha });
  });

  test('reconhece proxima sexta', () => {
    const res = parseEscolhaDia('Próxima sexta');
    expect(res).toEqual({ type: 'weekday', value: 5, next: true });
  });

  test('retorna erro para entrada invalida', () => {
    const res = parseEscolhaDia('xyz');
    expect(res).toEqual({ type: 'invalid', error: DEFAULT_ERROR_MSG });
  });
});

describe('parseEscolhaAgendamento', () => {
  const ags = [
    { id: 1, servico: 'Corte', horario: '2030-01-01T10:00:00-03:00' },
    { id: 2, servico: 'Barba', horario: '2030-01-02T12:00:00-03:00' },
  ];

  test('seleciona por numero', () => {
    const res = parseEscolhaAgendamento('1', ags);
    expect(res).toEqual(ags[0]);
  });

  test('seleciona por descricao', () => {
    const texto = `Barba ${formatarDataHorarioBr(ags[1].horario)}`;
    const res = parseEscolhaAgendamento(texto, ags);
    expect(res).toEqual(ags[1]);
  });

  test('retorna null quando invalido', () => {
    const res = parseEscolhaAgendamento('Outro', ags);
    expect(res).toBeNull();
  });
});
