require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function runMigration() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(schemaSql);
    console.log('Schema applied successfully. Tables created (or already existed).');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

runMigration();