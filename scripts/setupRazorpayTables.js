const { query, pool } = require('../src/config/database');

const setupTables = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type ENUM('ONLINE', 'MAGAZINE', 'BOTH') NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                duration_months INT NOT NULL,
                features JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ subscription_plans table ready');

        await query(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                plan_id INT NOT NULL,
                razorpay_order_id VARCHAR(100) NOT NULL,
                razorpay_payment_id VARCHAR(100),
                razorpay_signature VARCHAR(200),
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'INR',
                status ENUM('CREATED', 'SUCCESS', 'FAILED') DEFAULT 'CREATED',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
            )
        `);
        console.log('✅ payments table ready');

        await query(`
            CREATE TABLE IF NOT EXISTS magazine_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                plan_id INT NOT NULL,
                payment_id INT,
                start_date DATETIME NOT NULL,
                end_date DATETIME NOT NULL,
                status ENUM('ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED') DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
                FOREIGN KEY (payment_id) REFERENCES payments(id)
            )
        `);
        console.log('✅ magazine_subscriptions table ready');

        // Ensure users table has subscription columns
        try {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(20) DEFAULT 'FREE'`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start_date DATETIME`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date DATETIME`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
            console.log('✅ users table subscription columns ready');
        } catch (e) {
            // Columns might already exist
            console.log('ℹ️  Users columns already exist or MySQL version issue, skipping');
        }

        // Insert default plans if none exist
        const plans = await query('SELECT COUNT(*) as count FROM subscription_plans');
        if (plans[0].count === 0) {
            await query(`
                INSERT INTO subscription_plans (name, type, price, duration_months, features) 
                VALUES 
                ('Digital Monthly', 'ONLINE', 99.00, 1, '["Unlimited Online Reading", "All Magazines Access"]'),
                ('Digital Yearly', 'ONLINE', 999.00, 12, '["Unlimited Online Reading", "All Magazines Access", "Ad-free Experience"]'),
                ('Gold (Magazine + Online)', 'BOTH', 1499.00, 12, '["Physical Magazine Delivery", "Unlimited Online Reading", "All Magazines Access", "Priority Support"]')
            `);
            console.log('✅ Default plans inserted');
        }
        
        console.log("\n🎉 All database tables created successfully.");
    } catch(err) {
        console.error("❌ Error creating tables:", err);
    } finally {
        pool.end();
    }
};

setupTables();
