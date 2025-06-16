# reservai-bot

Este projeto fornece um bot de agendamento integrado ao WhatsApp, Dialogflow e Google Calendar.

## Exemplos de requisições

### POST /webhook

```bash
curl -X POST http://localhost:3000/webhook \
     -d '{
       "Body": "Quero agendar corte para amanhã às 14h",
       "From": "whatsapp:+5511999999999",
       "ProfileName": "João"
     }'
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "reply": "Mensagem de resposta gerada pelo bot"
  },
  "message": null
}
```

### POST /api/agendamento/agendar

```bash
curl -X POST http://localhost:3000/api/agendamento/agendar \
     -H "Content-Type: application/json" \
     -d '{
       "clienteId": 1,
       "clienteNome": "João",
       "servicosNomes": ["Corte", "Barba"],
       "horario": "2024-06-15T14:00:00-03:00"
     }'
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "agendamentoId": 42,
    "eventId": "abcdef123456"
  },
  "message": "Agendamento realizado com sucesso"
}
```

## Configurando o Google Calendar

1. Crie uma conta de serviço no Google Cloud e baixe o arquivo de credenciais.
2. Salve os arquivos `reservai_twilio.json` (Dialogflow) e `barbearia-calendar.json` na raiz do projeto.
3. Compartilhe o calendário desejado com o e‑mail da conta de serviço usado no `barbearia-calendar.json`.
4. Crie um arquivo `.env` com as variáveis abaixo e ajuste de acordo com seu ambiente:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=barbearia
DIALOGFLOW_KEYFILE=./reservai_twilio.json
GOOGLE_APPLICATION_CREDENTIALS=./barbearia-calendar.json
DIALOGFLOW_PROJECT_ID=reservai-twilio-qrps
CALENDAR_ID=SEU_CALENDARIO_ID
PORT=3000
```

## Executando o projeto

### Ambiente de desenvolvimento

1. Instale as dependências:

```bash
npm install
```

2. Assegure que o MySQL esteja ativo e execute `bd.sql` para criar as tabelas.
3. Inicie o servidor com recarregamento automático:

```bash
npm start
```

4. Para testar via WhatsApp, exponha o webhook com ngrok (opcional):

```bash
npx ngrok http 3000
```

### Ambiente de produção

1. Garanta que o arquivo `.env` esteja configurado com suas credenciais e dados do banco.
2. Execute a aplicação usando Node ou um gerenciador de processos:

```bash
node index.js
```

## Exemplos de frases para treinar o Dialogflow

Para que o bot reconheça a escolha de dias e horários de forma natural, inclua frases de treinamento como:

- "Quero sexta à tarde"
- "Tem sábado de manhã?"
- "Horários para amanhã"
- "Próxima semana"
- "Quero ver quinta-feira"
- "Quero agendar para a manhã"
