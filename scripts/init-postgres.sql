-- Run once after installing PostgreSQL (as superuser postgres).
-- Example (Windows, after install):
--   psql -U postgres -f scripts/init-postgres.sql

CREATE DATABASE driving_theory_back
  WITH ENCODING 'UTF8'
       LC_COLLATE 'English_United States.1252'
       LC_CTYPE 'English_United States.1252'
       TEMPLATE template0;

-- Optional: dedicated app user (replace password)
-- CREATE USER driving_theory_app WITH PASSWORD 'change_me';
-- GRANT ALL PRIVILEGES ON DATABASE driving_theory_back TO driving_theory_app;
