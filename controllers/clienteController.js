const pool = require("../db");
const Joi = require("joi");
const { isValidNome } = require("../utils/validation");
const { ValidationError } = require("../utils/errors");

const logger = require("../utils/logger");

function padronizarTelefone(telefone) {
  logger.info(`Telefone recebido: ${telefone}`);
  let numeros = String(telefone).replace(/\D/g, "");
  if (!numeros.startsWith("55")) {
    numeros = "55" + numeros;
  }
  numeros = numeros.slice(0, 13);
  const padronizado = `+${numeros}`;
  logger.info(`Telefone padronizado: ${padronizado}`);
  return padronizado;
}

const schemaTelefone = Joi.string().pattern(/^\+55\d{11}$/).required();
// Se o cliente existir, ele é retornado. Se não, um novo é criado.
// Tenta usar profileName do Twilio, se disponível.
async function encontrarOuCriarCliente(telefone, profileName = "Cliente") {
  const telefonePadronizado = padronizarTelefone(telefone);
  const { error } = schemaTelefone.validate(telefonePadronizado);
  if (error) {
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
      [telefonePadronizado]
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
        [nomeParaSalvar, telefonePadronizado]
      );
      cliente = {
        id: result.insertId,
        nome: nomeParaSalvar,
        telefone: telefonePadronizado,
      };
      logger.info(`Novo cliente criado: ${nomeParaSalvar}`);
    }
    return cliente;
  } catch (error) {
    logger.error(null, error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Busca um cliente existente sem criar um novo registro
async function buscarClientePorTelefone(telefone) {
  const telefonePadronizado = padronizarTelefone(telefone);
  const { error } = schemaTelefone.validate(telefonePadronizado);
  if (error) {
    throw new ValidationError(
      "O número de telefone deve estar no formato +55DDDDDDDDDDD."
    );
  }
  let client;
  try {
    client = await pool.getConnection();
    const [rows] = await client.query(
      "SELECT id, nome, telefone FROM clientes WHERE telefone = ?",
      [telefonePadronizado]
    );
    if (rows.length === 0) return null;
    return rows[0];
  } catch (error) {
    logger.error(null, error);
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
    logger.error(null, error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
  padronizarTelefone,
  buscarClientePorTelefone,
};
