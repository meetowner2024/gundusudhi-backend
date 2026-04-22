/**
 * Migration: Add refresh_token_expires_at to users table
 * 
 * Run once on the server:
 *   node scripts/addRefreshTokenExpiry.js
 *
 * Safe to re-run — skips if column already exists.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { query } = require('../src/config/database');

async function migrate() {
    try {
        // Check if column already exists
        const cols = await query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'refresh_token_expires_at'
        `, [process.env.DB_NAME]);

        if (cols.length > 0) {
            console.log('✅ Column refresh_token_expires_at already exists — nothing to do.');
            process.exit(0);
        }

        await query(`
            ALTER TABLE users 
            ADD COLUMN refresh_token_expires_at DATETIME NULL DEFAULT NULL 
            AFTER refresh_token_hash
        `);

        console.log('✅ Column refresh_token_expires_at added to users table.');

        // Back-fill: give all currently-logged-in users a 30-day window from now
        const result = await query(`
            UPDATE users 
            SET refresh_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
            WHERE refresh_token_hash IS NOT NULL
        `);
        console.log(`✅ Back-filled ${result.affectedRows} existing sessions with 30-day expiry.`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
