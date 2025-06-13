-- SQL script for ReservAI Bot database

DROP DATABASE IF EXISTS barbearia;
CREATE DATABASE barbearia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE barbearia;

CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telefone VARCHAR(50) UNIQUE NOT NULL,
    nome VARCHAR(100) NOT NULL,
    verified_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao TEXT,
    duracao TIME NOT NULL CHECK (duracao > '00:00:00'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE horarios_disponiveis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dia_horario DATETIME NOT NULL UNIQUE,
    disponivel BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Adiciona coluna calculada para o nome do dia da semana
    dia_semana VARCHAR(10) GENERATED ALWAYS AS (DAYNAME(dia_horario)) STORED
) ENGINE=InnoDB;

CREATE INDEX idx_horario_disponivel ON horarios_disponiveis(dia_horario, disponivel);

CREATE TABLE agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    horario_id INT NOT NULL,
    status ENUM('ativo', 'cancelado') DEFAULT 'ativo',
    data_agendamento DATETIME DEFAULT CURRENT_TIMESTAMP,
    observacao TEXT DEFAULT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (horario_id) REFERENCES horarios_disponiveis(id) ON DELETE RESTRICT,
    UNIQUE (horario_id, status)
) ENGINE=InnoDB;

CREATE INDEX idx_agendamentos_cliente_status ON agendamentos(cliente_id, status);

CREATE TABLE agendamentos_servicos (
    agendamento_id INT NOT NULL,
    servico_id INT NOT NULL,
    PRIMARY KEY (agendamento_id, servico_id),
    FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO clientes (telefone, nome) VALUES
('+5512981458107', 'Caio'),
('+5511988880002', 'Maria Oliveira'),
('+5511977770003', 'Carlos Santos');

INSERT INTO servicos (nome, descricao, duracao) VALUES
('Corte', 'Corte masculino padr\u00e3o', '00:30:00'),
('Barba', 'Modelagem e aparo de barba', '00:30:00'),
('Corte + Barba', 'Corte e modelagem de barba', '01:00:00');

DELIMITER $$
CREATE PROCEDURE gerar_horarios()
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE data_base DATE DEFAULT CURDATE();
    DECLARE hora_inicio TIME;
    DELETE FROM horarios_disponiveis WHERE dia_horario < NOW();
    WHILE i < 30 DO
        IF DAYOFWEEK(DATE_ADD(data_base, INTERVAL i DAY)) BETWEEN 2 AND 7 THEN
            SET hora_inicio = '09:00:00';
            WHILE hora_inicio <= '18:00:00' DO
                INSERT IGNORE INTO horarios_disponiveis (dia_horario, disponivel)
                VALUES (
                    CONVERT_TZ(
                        CONCAT(DATE_ADD(data_base, INTERVAL i DAY), ' ', hora_inicio),
                        '+00:00', '-03:00'
                    ),
                    TRUE
                );
                SET hora_inicio = ADDTIME(hora_inicio, '00:30:00');
            END WHILE;
        END IF;
        SET i = i + 1;
    END WHILE;
END$$
DELIMITER ;

DELIMITER $$
CREATE EVENT IF NOT EXISTS gerar_horarios_diarios
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 0 HOUR
ON COMPLETION PRESERVE
DO
BEGIN
    CALL gerar_horarios();
END$$
DELIMITER ;

CALL gerar_horarios();
