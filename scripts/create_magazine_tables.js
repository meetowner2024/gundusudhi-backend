const { query } = require('../src/config/database');

async function createMagazineTables() {
    try {
        console.log('Creating magazine tables...');
        
        // 1. Magazines Table
        await query(`
            CREATE TABLE IF NOT EXISTS magazines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                category VARCHAR(100),
                issue_date DATE,
                is_premium BOOLEAN DEFAULT FALSE,
                is_published BOOLEAN DEFAULT FALSE,
                cover_image_url VARCHAR(255),
                pdf_source_path VARCHAR(255),
                total_pages INT DEFAULT 0,
                view_count INT DEFAULT 0,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        console.log('Created magazines table');

        // 2. Magazine Pages Table
        await query(`
            CREATE TABLE IF NOT EXISTS magazine_pages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                magazine_id INT NOT NULL,
                page_number INT NOT NULL,
                image_path VARCHAR(255) NOT NULL,
                is_preview_page BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE CASCADE,
                UNIQUE KEY unique_page (magazine_id, page_number)
            )
        `);
        console.log('Created magazine_pages table');

        // 3. Reading Sessions (for secure access)
        await query(`
            CREATE TABLE IF NOT EXISTS magazine_reading_sessions (
                session_id VARCHAR(64) PRIMARY KEY,
                user_id INT NOT NULL,
                magazine_id INT NOT NULL,
                last_page_read INT DEFAULT 1,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE CASCADE
            )
        `);
        console.log('Created magazine_reading_sessions table');

      
        await query(`
            CREATE TABLE IF NOT EXISTS magazine_read_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                magazine_id INT NOT NULL,
                read_count INT DEFAULT 1,
                last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE CASCADE,
                UNIQUE KEY unique_history (user_id, magazine_id)
            )
        `);
        console.log('Created magazine_read_history table');

        console.log('Magazine tables setup completed.');
        process.exit(0);

    } catch (error) {
        console.error('Failed to create magazine tables:', error);
        process.exit(1);
    }
}

createMagazineTables();
