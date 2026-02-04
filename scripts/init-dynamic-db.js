const fs = require('fs');
const path = require('path');
// Load env from backend root
require('dotenv').config({ path: path.join(__dirname, '../.env') }); 
const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'news_portal',
    multipleStatements: true
};

async function runSchema() {
    try {
        console.log('Connecting to database...');
        const connection = await mysql.createConnection(DB_CONFIG);
        
        console.log('Reading schema file...');
        // Schema is in backend/database
        const schemaPath = path.join(__dirname, '../database/dynamic_content_schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            console.error('Schema file not found at:', schemaPath);
            process.exit(1);
        }
        
        const sql = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('Executing schema...');
        await connection.query(sql);
        
        console.log('Dynamic content tables created successfully!');
        await connection.end();
    } catch (error) {
        console.error('Error executing schema:', error);
    }
}

runSchema();
