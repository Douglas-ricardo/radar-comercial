-- Cria o banco usado pela Evolution API (separado do banco principal).
-- Executado apenas na primeira inicialização do volume do Postgres.
SELECT 'CREATE DATABASE evolution'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
