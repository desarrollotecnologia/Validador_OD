import pkg from 'pg';
import { config } from './config.js';

const { Pool } = pkg;

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
