import pkg from 'pg';
import { config } from './config.js';

const { Pool, types } = pkg;

// DATE → 'YYYY-MM-DD' (evita que String(Date) produzca "Fri Aug 28 ...")
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  ...config.pg,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 5,
});

pool.on('error', (err) => {
  console.error('Error inesperado en pool PG:', err.message);
});

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

export async function closePool() {
  await pool.end();
}
