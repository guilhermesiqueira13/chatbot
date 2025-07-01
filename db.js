require("dotenv").config();
const mysql = require("mysql2/promise");
const logger = require("./utils/logger");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

function logQuery(sql, params) {
  try {
    logger.db('QUERY', { sql, params });
  } catch (e) {
    logger.error(null, e);
  }
}

const originalQuery = pool.query.bind(pool);
pool.query = async function (sql, params) {
  logQuery(sql, params);
  return originalQuery(sql, params);
};

const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function () {
  const connection = await originalGetConnection();
  const connQuery = connection.query.bind(connection);
  connection.query = async function (sql, params) {
    logQuery(sql, params);
    return connQuery(sql, params);
  };
  return connection;
};

module.exports = pool;
