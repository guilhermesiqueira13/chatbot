const { getNextDateFromText } = require('../utils/dataHelpers');

describe('getNextDateFromText', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-05T10:00:00-03:00'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  test('converte dia da semana para a proxima data', () => {
    expect(getNextDateFromText('quinta')).toBe('2024-06-06');
    expect(getNextDateFromText('sabado')).toBe('2024-06-08');
  });

  test('entende acentos e hoje/amanha', () => {
    expect(getNextDateFromText('sábado')).toBe('2024-06-08');
    expect(getNextDateFromText('hoje')).toBe('2024-06-05');
    expect(getNextDateFromText('amanhã')).toBe('2024-06-06');
  });
});
