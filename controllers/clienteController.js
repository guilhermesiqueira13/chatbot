const pool = require("../db");
const {
  isValidTelefone,
  isValidNome,
} = require("../utils/validation");
const { ValidationError } = require("../utils/errors");

const logger = require("../utils/logger");
// Se o cliente existir, ele é retornado. Se não, um novo é criado.
// Tenta usar profileName do Twilio, se disponível.
async function encontrarOuCriarCliente(telefone, profileName = "Cliente") {
  if (!isValidTelefone(telefone)) {
    throw new ValidationError(
      "O número de telefone deve estar no formato +55DDDDDDDDDDD."
    );
  }
  if (profileName && !isValidNome(profileName)) {
    throw new ValidationError(
      "O nome deve possuir ao menos 3 letras e conter apenas caracteres alfabéticos."
    );
  }
  let client;
  try {
    client = await pool.getConnection();
    let [rows] = await client.query(
      "SELECT id, nome, telefone FROM clientes WHERE telefone = ?",
      [telefone]
    );

    let cliente;
    if (rows.length > 0) {
      cliente = rows[0];
      // Se o profileName vindo do Twilio for diferente do nome atual no DB
      // e não for o nome padrão 'Cliente', atualiza o nome no DB.
      if (
        profileName &&
        profileName !== "Cliente" &&
        cliente.nome === profileName
      ) {
        await client.query("UPDATE clientes SET nome = ? WHERE id = ?", [
          profileName,
          cliente.id,
        ]);
        cliente.nome = profileName; // Atualiza o objeto para o nome mais recente
        logger.info(`Nome do cliente atualizado para: ${profileName}`);
      }
    } else {
      // Cliente não encontrado, cria um novo
      const nomeParaSalvar = profileName || "Cliente"; // Usa profileName se existir, senão 'Cliente'
      const [result] = await client.query(
        "INSERT INTO clientes (nome, telefone) VALUES (?, ?)",
        [nomeParaSalvar, telefone]
      );
      cliente = {
        id: result.insertId,
        nome: nomeParaSalvar,
        telefone: telefone,
      };
      logger.info(`Novo cliente criado: ${nomeParaSalvar}`);
    }
    return cliente;
  } catch (error) {
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro ao encontrar ou criar cliente:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Atualiza o nome de um cliente existente.
async function atualizarNomeCliente(clienteId, novoNome) {
  if (!isValidNome(novoNome)) {
    throw new ValidationError(
      "O nome deve possuir ao menos 3 letras e conter apenas caracteres alfabéticos."
    );
  }
  let client;
  logger.info("aqui");

  try {
    client = await pool.getConnection();
    const [result] = await client.query(
      "UPDATE clientes SET nome = ? WHERE id = ?",
      [novoNome, clienteId]
    );
    if (result.affectedRows > 0) {
      logger.info(`Nome do cliente ${clienteId} atualizado para: ${novoNome}`);
      // Retorna o cliente atualizado ou um sinal de sucesso
      const [updatedRows] = await client.query(
        "SELECT id, nome, telefone FROM clientes WHERE id = ?",
        [clienteId]
      );

      logger.info(updatedRows);

      return updatedRows[0];
    }
    return null;
  } catch (error) {
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro ao atualizar nome do cliente:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
};
