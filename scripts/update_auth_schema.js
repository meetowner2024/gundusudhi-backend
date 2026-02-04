const { query } = require('../src/config/database');

async function updateSchema() {
    try {
        console.log('Updating users table schema...');
        
        // Add token_version column if not exists
        try {
            await query(`ALTER TABLE users ADD COLUMN token_version INT DEFAULT 0`);
            console.log('Added token_version column');
        } catch (e) {
            if (!e.message.includes("Duplicate column")) console.log('token_version column might already exist or error:', e.message);
        }

        // Add last_active_at column if not exists
        try {
            await query(`ALTER TABLE users ADD COLUMN last_active_at DATETIME`);
            console.log('Added last_active_at column');
        } catch (e) {
            if (!e.message.includes("Duplicate column")) console.log('last_active_at column might already exist or error:', e.message);
        }

        // Add refresh_token_hash column if not exists
        try {
            await query(`ALTER TABLE users ADD COLUMN refresh_token_hash VARCHAR(255)`);
            console.log('Added refresh_token_hash column');
        } catch (e) {
            if (!e.message.includes("Duplicate column")) console.log('refresh_token_hash column might already exist or error:', e.message);
        }

        console.log('Schema update completed.');
        process.exit(0);
    } catch (error) {
        console.error('Schema update failed:', error);
        process.exit(1);
    }
}

updateSchema();
