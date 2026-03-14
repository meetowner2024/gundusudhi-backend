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

        // Insert default plans if none exist
        const plans = await query('SELECT COUNT(*) as count FROM subscription_plans');
        if (plans[0].count === 0) {
            await query(`
                INSERT INTO subscription_plans (name, type, price, duration_months, features) 
                VALUES 
                ('Digital Readers Monthly', 'ONLINE', 99.00, 1, '["Unlimited Online Reading"]'),
                ('Digital Readers Yearly', 'ONLINE', 999.00, 12, '["Unlimited Online Reading", "Ad-free experience"]'),
                ('Gold Subscription (Magazine + Online)', 'BOTH', 1499.00, 12, '["Physical Magazine Delivery", "Unlimited Online Reading"]')
            `);
        }
        
        console.log("Database tables created successfully.");
    } catch(err) {
        console.error("Error creating tables:", err);
    } finally {
        pool.end();
    }
};

setupTables();
