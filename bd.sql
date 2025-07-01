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
    -- Coluna calculada: nome do dia da semana
    dia_semana VARCHAR(10) GENERATED ALWAYS AS (DAYNAME(dia_horario)) STORED
    -- (Opcional) Não permitir domingo:
    , CONSTRAINT chk_dia_semana_nao_domingo CHECK (DAYOFWEEK(dia_horario) <> 1)
) ENGINE=InnoDB;

CREATE INDEX idx_horario_disponivel ON horarios_disponiveis(dia_horario, disponivel);

CREATE TABLE agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    google_event_id VARCHAR(255) NOT NULL,
    horario DATETIME NOT NULL,
    status ENUM('ativo', 'cancelado') DEFAULT 'ativo',
    data_agendamento DATETIME DEFAULT CURRENT_TIMESTAMP,
    observacao TEXT DEFAULT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
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
('Corte', 'Corte masculino padrão', '00:30:00'),
('Barba', 'Modelagem e aparo de barba', '00:30:00'),
('Corte + Barba', 'Corte e modelagem de barba', '01:00:00');
