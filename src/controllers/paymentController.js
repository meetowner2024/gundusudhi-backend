const Razorpay = require('razorpay');
const crypto = require('crypto');
const { query, transaction } = require('../config/database');
const { paymentsLogger, subscriptionLogger } = require('../utils/logger');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.PAYMENT_GATEWAY_KEY || 'YOUR_RAZORPAY_KEY',
    key_secret: process.env.PAYMENT_GATEWAY_SECRET || 'YOUR_RAZORPAY_SECRET'
});

// ==================== PUBLIC / USER ROUTES ====================

// Fetch all available subscription plans
const getPlans = async (req, res) => {
    try {
        const plans = await query('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price ASC');
        res.json({ success: true, data: plans });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscription plans' });
    }
};

// Get the current user's active subscription details
const getMySubscription = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get the latest active subscription from magazine_subscriptions
        const subs = await query(
            `SELECT ms.id, ms.subscription_type, ms.price_paid, ms.duration_months, 
                    ms.start_date, ms.end_date, ms.is_active, ms.payment_id, ms.created_at
             FROM magazine_subscriptions ms
             WHERE ms.user_id = ? AND ms.is_active = 1 AND ms.end_date > NOW()
             ORDER BY ms.created_at DESC
             LIMIT 1`,
            [userId]
        );

        if (subs.length === 0) {
            return res.json({ success: true, data: null });
        }

        res.json({ success: true, data: subs[0] });
    } catch (error) {
        console.error('Get my subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
    }
};

// Create a Razorpay Order (with deduplication)
const createOrder = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.id;

        const plans = await query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
        if (plans.length === 0) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        const plan = plans[0];
        const isOffline = req.body.isOffline === true;
        const shippingDetails = req.body.shippingDetails; // {name, mobile, email, address, street, city, state, pincode}

        if (isOffline) {
             await query(`CREATE TABLE IF NOT EXISTS offline_orders (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, name VARCHAR(255), mobile VARCHAR(50), email VARCHAR(255), address TEXT, street VARCHAR(255), city VARCHAR(100), state VARCHAR(100), pincode VARCHAR(20), plan_id INT, razorpay_order_id VARCHAR(255), razorpay_payment_id VARCHAR(255), amount DECIMAL(10,2), status VARCHAR(50) DEFAULT 'CREATED', magazines_delivered INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
        }

        // Check for existing CREATED (unpaid) order for same user+plan within last 30 minutes
        const existingOrders = await query(
            `SELECT razorpay_order_id, amount FROM payments 
             WHERE user_id = ? AND plan_id = ? AND status = 'CREATED' 
             AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
             ORDER BY created_at DESC LIMIT 1`,
            [userId, planId]
        );

        if (existingOrders.length > 0) {
            // Reuse existing order
            return res.json({
                success: true,
                data: {
                    orderId: existingOrders[0].razorpay_order_id,
                    amount: plan.price * 100,
                    currency: 'INR',
                    keyId: process.env.PAYMENT_GATEWAY_KEY
                }
            });
        }

        const options = {
            amount: plan.price * 100,
            currency: 'INR',
            receipt: `receipt_user_${userId}_plan_${planId}_${Date.now()}`,
            notes: {
                userId,
                planId: plan.id,
                planType: plan.type
            }
        };

        const order = await razorpay.orders.create(options);

        await query(
            `INSERT INTO payments (user_id, plan_id, razorpay_order_id, amount, currency, status)
             VALUES (?, ?, ?, ?, ?, 'CREATED')`,
            [userId, plan.id, order.id, plan.price, 'INR']
        );

        if (isOffline && shippingDetails) {
            await query(
               `INSERT INTO offline_orders (user_id, name, mobile, email, address, street, city, state, pincode, plan_id, razorpay_order_id, amount, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')`,
               [userId, shippingDetails.name, shippingDetails.mobile, shippingDetails.email, shippingDetails.address, shippingDetails.street, shippingDetails.city, shippingDetails.state, shippingDetails.pincode, plan.id, order.id, plan.price]
            );
        }

        paymentsLogger.info(`Payment intent created: User ${userId} initiated purchase for Plan ${plan.id} (${plan.price} INR). OrderID: ${order.id}. Offline: ${isOffline}`);

        res.json({
            success: true,
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.PAYMENT_GATEWAY_KEY
            }
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
};

// Helper: Activate subscription after successful payment
const activateSubscription = async (userId, planId, razorpayOrderId) => {
    const plans = await query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
    if (plans.length === 0) return;
    const plan = plans[0];

    const [user] = await query('SELECT subscription_end_date FROM users WHERE id = ?', [userId]);

    let startDate = new Date();
    if (user && user.subscription_end_date && new Date(user.subscription_end_date) > new Date()) {
        startDate = new Date(user.subscription_end_date);
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + plan.duration_months);
    
    // Map 'MAGAZINE' plan type to 'OFFLINE' to match database enum
    const userSubscriptionType = plan.type === 'MAGAZINE' ? 'OFFLINE' : plan.type;

    // Update user subscription
    await query(
        `UPDATE users 
         SET subscription_type = ?, 
             subscription_start_date = IFNULL(subscription_start_date, NOW()), 
             subscription_end_date = ? 
         WHERE id = ?`,
        [userSubscriptionType, endDate, userId]
    );

    // Create magazine_subscriptions record
    await query(
        `INSERT INTO magazine_subscriptions (user_id, subscription_type, price_paid, duration_months, start_date, end_date, is_active, payment_id)
         VALUES (?, ?, ?, ?, NOW(), ?, 1, ?)`,
        [userId, userSubscriptionType, plan.price, plan.duration_months, endDate, razorpayOrderId]
    );
};

// Verify Payment Signature and Complete Order
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.PAYMENT_GATEWAY_SECRET || 'YOUR_RAZORPAY_SECRET')
            .update(body.toString())
            .digest('hex');

        const isSignatureValid = expectedSignature === razorpay_signature;

        if (!isSignatureValid) {
            await query('UPDATE payments SET status = "FAILED" WHERE razorpay_order_id = ?', [razorpay_order_id]);
            paymentsLogger.error(`Payment failed or aborted: Invalid signature for OrderID: ${razorpay_order_id}`);
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Idempotency check
        const existingPayment = await query('SELECT status FROM payments WHERE razorpay_order_id = ?', [razorpay_order_id]);
        if (existingPayment.length > 0 && existingPayment[0].status === 'SUCCESS') {
            return res.json({ success: true, message: 'Payment already verified.' });
        }

        // Signature is valid. Update payment status
        await query(
            `UPDATE payments 
             SET status = "SUCCESS", razorpay_payment_id = ?, razorpay_signature = ? 
             WHERE razorpay_order_id = ?`,
            [razorpay_payment_id, razorpay_signature, razorpay_order_id]
        );

        // Update offline_orders if exists
        try {
            await query(`UPDATE offline_orders SET status = 'SUCCESS', razorpay_payment_id = ? WHERE razorpay_order_id = ?`, [razorpay_payment_id, razorpay_order_id]);
        } catch(e) {}

        // Get payment details to grant subscription
        const payments = await query('SELECT user_id, plan_id, amount FROM payments WHERE razorpay_order_id = ?', [razorpay_order_id]);
        if (payments.length > 0) {
            await activateSubscription(payments[0].user_id, payments[0].plan_id, razorpay_order_id);
            paymentsLogger.info(`Payment verified successfully: User ${payments[0].user_id} bought Plan ${payments[0].plan_id} for ${payments[0].amount} INR (OrderID: ${razorpay_order_id})`);
        }

        res.json({ success: true, message: 'Payment verified and subscription activated.' });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

// Webhook for fault tolerance
const razorpayWebhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const shasum = crypto.createHmac('sha256', secret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (digest === req.headers['x-razorpay-signature']) {
            const event = req.body.event;
            const payload = req.body.payload.payment.entity;

            // Idempotency: skip if already handled
            const existing = await query('SELECT status FROM payments WHERE razorpay_order_id = ?', [payload.order_id]);
            if (existing.length > 0 && existing[0].status === 'SUCCESS') {
                return res.json({ status: 'ok' });
            }

            if (event === 'payment.captured' || event === 'payment.authorized') {
                const orderId = payload.order_id;
                const paymentId = payload.id;

                await query(
                    `UPDATE payments 
                     SET status = "SUCCESS", razorpay_payment_id = ? 
                     WHERE razorpay_order_id = ?`,
                    [paymentId, orderId]
                );

                try {
                    await query(`UPDATE offline_orders SET status = 'SUCCESS', razorpay_payment_id = ? WHERE razorpay_order_id = ?`, [paymentId, orderId]);
                } catch(e) {}

                const payments = await query('SELECT user_id, plan_id FROM payments WHERE razorpay_order_id = ?', [orderId]);
                if (payments.length > 0) {
                    await activateSubscription(payments[0].user_id, payments[0].plan_id, orderId);
                }
            } else if (event === 'payment.failed') {
                await query('UPDATE payments SET status = "FAILED" WHERE razorpay_order_id = ?', [payload.order_id]);
                paymentsLogger.error(`Webhook Warning - Payment failed for OrderID: ${payload.order_id}`);
            }

            res.json({ status: 'ok' });
        } else {
            res.status(403).send('Invalid signature');
        }
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
};

// ==================== ADMIN ROUTES ====================

// Admin: Get all payments history with filters
const getPaymentsHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = "WHERE 1=1";
        let queryParams = [];

        if (status) {
            whereClause += " AND p.status = ?";
            queryParams.push(status);
        }

        if (search) {
            whereClause += " AND (u.name LIKE ? OR u.email LIKE ? OR p.razorpay_order_id LIKE ?)";
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const payments = await query(
            `SELECT p.*, u.name as user_name, u.email as user_email, sp.name as plan_name, sp.type as plan_type,
                    u.subscription_type, u.subscription_end_date
             FROM payments p
             JOIN users u ON p.user_id = u.id
             JOIN subscription_plans sp ON p.plan_id = sp.id
             ${whereClause}
             ORDER BY p.created_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        const [countRes] = await query(`SELECT COUNT(*) as total FROM payments p JOIN users u ON p.user_id = u.id ${whereClause}`, queryParams);

        res.json({
            success: true,
            data: {
                payments,
                pagination: {
                    total: countRes.total,
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payments history' });
    }
};

// Admin: Get all subscription plans (including inactive)
const adminGetPlans = async (req, res) => {
    try {
        const plans = await query('SELECT * FROM subscription_plans ORDER BY price ASC');
        res.json({ success: true, data: plans });
    } catch (error) {
        console.error('Admin get plans error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
};

// Admin: Create a new plan
const adminCreatePlan = async (req, res) => {
    try {
        const { name, type, price, duration_months, features, is_active } = req.body;
        if (!name || !type || price === undefined || !duration_months) {
            return res.status(400).json({ success: false, message: 'name, type, price, duration_months are required' });
        }
        const featuresJson = features ? (typeof features === 'string' ? features : JSON.stringify(features)) : null;
        const result = await query(
            `INSERT INTO subscription_plans (name, type, price, duration_months, features, is_active)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, type, price, duration_months, featuresJson, is_active !== false]
        );
        res.json({ success: true, message: 'Plan created', data: { id: result.insertId } });
    } catch (error) {
        console.error('Create plan error:', error);
        res.status(500).json({ success: false, message: 'Failed to create plan' });
    }
};

// Admin: Update a plan
const adminUpdatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, price, duration_months, features, is_active } = req.body;
        const featuresJson = features ? (typeof features === 'string' ? features : JSON.stringify(features)) : null;
        await query(
            `UPDATE subscription_plans 
             SET name = COALESCE(?, name), 
                 type = COALESCE(?, type), 
                 price = COALESCE(?, price), 
                 duration_months = COALESCE(?, duration_months),
                 features = COALESCE(?, features),
                 is_active = COALESCE(?, is_active)
             WHERE id = ?`,
            [name, type, price, duration_months, featuresJson, is_active, id]
        );
        res.json({ success: true, message: 'Plan updated' });
    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({ success: false, message: 'Failed to update plan' });
    }
};

// Admin: Delete a plan (soft delete by deactivating)
const adminDeletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await query('UPDATE subscription_plans SET is_active = FALSE WHERE id = ?', [id]);
        res.json({ success: true, message: 'Plan deactivated' });
    } catch (error) {
        console.error('Delete plan error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete plan' });
    }
};

// Admin: Get all subscribers with subscription details
const getSubscribers = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = "WHERE u.subscription_type IS NOT NULL AND u.subscription_type != 'free' AND u.subscription_type != 'FREE'";
        let queryParams = [];

        if (status === 'active') {
            whereClause += " AND u.subscription_end_date > NOW()";
        } else if (status === 'expired') {
            whereClause += " AND u.subscription_end_date <= NOW()";
        } else if (status === 'expiring_soon') {
            whereClause += " AND u.subscription_end_date > NOW() AND u.subscription_end_date <= DATE_ADD(NOW(), INTERVAL 7 DAY)";
        } else if (status === 'suspended') {
            whereClause += " AND u.is_active = FALSE";
        }

        if (search) {
            whereClause += " AND (u.name LIKE ? OR u.email LIKE ?)";
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const subscribers = await query(
            `SELECT u.id, u.name, u.email, u.mobile, u.role, u.subscription_type, 
                    u.subscription_start_date, u.subscription_end_date, u.is_active, u.created_at,
                    DATEDIFF(u.subscription_end_date, NOW()) as days_remaining,
                    (SELECT COUNT(*) FROM payments p WHERE p.user_id = u.id AND p.status = 'SUCCESS') as total_payments,
                    (SELECT SUM(p.amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'SUCCESS') as total_spent
             FROM users u
             ${whereClause}
             ORDER BY u.subscription_end_date DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        const [countRes] = await query(
            `SELECT COUNT(*) as total FROM users u ${whereClause}`,
            queryParams
        );

        // Get summary stats
        const [activeCount] = await query(
            "SELECT COUNT(*) as count FROM users WHERE subscription_type IS NOT NULL AND subscription_type != 'free' AND subscription_type != 'FREE' AND subscription_end_date > NOW()"
        );
        const [expiredCount] = await query(
            "SELECT COUNT(*) as count FROM users WHERE subscription_type IS NOT NULL AND subscription_type != 'free' AND subscription_type != 'FREE' AND subscription_end_date <= NOW()"
        );
        const [expiringSoonCount] = await query(
            "SELECT COUNT(*) as count FROM users WHERE subscription_type IS NOT NULL AND subscription_type != 'free' AND subscription_type != 'FREE' AND subscription_end_date > NOW() AND subscription_end_date <= DATE_ADD(NOW(), INTERVAL 7 DAY)"
        );

        res.json({
            success: true,
            data: {
                subscribers,
                stats: {
                    active: activeCount.count,
                    expired: expiredCount.count,
                    expiring_soon: expiringSoonCount.count
                },
                pagination: {
                    total: countRes.total,
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Get subscribers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscribers' });
    }
};

// Admin: Get offline orders with full filters
const getOfflineOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search, payment_status, date_from, date_to } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (status && status !== 'ALL') {
            whereClause += ' AND o.status = ?';
            queryParams.push(status);
        }
        if (payment_status === 'PAID') {
            whereClause += ' AND o.razorpay_payment_id IS NOT NULL AND o.razorpay_payment_id != ""';
        } else if (payment_status === 'UNPAID') {
            whereClause += ' AND (o.razorpay_payment_id IS NULL OR o.razorpay_payment_id = "")';
        }
        if (search) {
            whereClause += ' AND (o.name LIKE ? OR o.email LIKE ? OR o.mobile LIKE ? OR o.razorpay_order_id LIKE ?)';
            const s = `%${search}%`;
            queryParams.push(s, s, s, s);
        }
        if (date_from) { whereClause += ' AND DATE(o.created_at) >= ?'; queryParams.push(date_from); }
        if (date_to)   { whereClause += ' AND DATE(o.created_at) <= ?'; queryParams.push(date_to); }

        const orders = await query(
            `SELECT o.*, sp.name as plan_name, sp.type as plan_type, u.name as user_name
             FROM offline_orders o
             LEFT JOIN subscription_plans sp ON o.plan_id = sp.id
             LEFT JOIN users u ON o.user_id = u.id
             ${whereClause}
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        const [countRes] = await query(
            `SELECT COUNT(*) as total FROM offline_orders o ${whereClause}`, queryParams
        );

        const [statsRes] = await query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as paid,
                SUM(CASE WHEN status = 'CREATED' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN razorpay_payment_id IS NOT NULL AND razorpay_payment_id != '' THEN amount ELSE 0 END) as total_revenue
            FROM offline_orders
        `);

        res.json({ success: true, data: { orders, stats: statsRes, pagination: { total: countRes.total, page: parseInt(page), limit: parseInt(limit) } } });
    } catch(err) {
        console.error('Get offline orders error:', err);
        res.status(500).json({ success: false, message: 'Failed to load offline orders' });
    }
};

// Admin: Update offline order with delivery tracking + notes
const updateOfflineOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { magazines_delivered, status, admin_notes } = req.body;

        const setClauses = [];
        const params = [];

        if (magazines_delivered !== undefined) { setClauses.push('magazines_delivered = ?'); params.push(parseInt(magazines_delivered)); }
        if (status !== undefined) {
            setClauses.push('status = ?'); params.push(status);
            if (status === 'DELIVERED') setClauses.push('delivered_at = NOW()');
        }
        if (admin_notes !== undefined) { setClauses.push('admin_notes = ?'); params.push(admin_notes); }

        if (setClauses.length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' });

        params.push(id);
        await query(`UPDATE offline_orders SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

        const [updated] = await query(
            `SELECT o.*, sp.name as plan_name FROM offline_orders o LEFT JOIN subscription_plans sp ON o.plan_id = sp.id WHERE o.id = ?`, [id]
        );
        res.json({ success: true, message: 'Order updated', data: updated });
    } catch(err) {
        console.error('Update offline order error:', err);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    }
};

// Admin: Export payments/offline orders as CSV (Excel-compatible)
const exportPayments = async (req, res) => {
    try {
        const { status, date_from, date_to, type = 'online' } = req.query;
        let whereClause = 'WHERE 1=1';
        let params = [];

        if (status && status !== 'ALL') { whereClause += ' AND p.status = ?'; params.push(status); }
        if (date_from) { whereClause += ' AND DATE(p.created_at) >= ?'; params.push(date_from); }
        if (date_to)   { whereClause += ' AND DATE(p.created_at) <= ?'; params.push(date_to); }

        let rows, headers;
        if (type === 'offline') {
            const ow = whereClause.replace(/p\./g, 'o.');
            rows = await query(
                `SELECT o.id, o.name, o.email, o.mobile, o.address, o.city, o.state, o.pincode,
                        sp.name as plan_name, o.amount, o.razorpay_order_id, o.razorpay_payment_id,
                        o.status, o.magazines_delivered, o.admin_notes, o.delivered_at, o.created_at
                 FROM offline_orders o LEFT JOIN subscription_plans sp ON o.plan_id = sp.id ${ow} ORDER BY o.created_at DESC`,
                params
            );
            headers = ['ID','Name','Email','Mobile','Address','City','State','Pincode','Plan','Amount','Order ID','Payment ID','Status','Mags Delivered','Notes','Delivered At','Created At'];
        } else {
            rows = await query(
                `SELECT p.id, u.name, u.email, u.mobile, sp.name as plan, sp.type, p.amount, p.currency,
                        p.status, p.razorpay_order_id, p.razorpay_payment_id,
                        u.subscription_type, u.subscription_end_date, p.created_at
                 FROM payments p JOIN users u ON p.user_id = u.id LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
                 ${whereClause} ORDER BY p.created_at DESC`,
                params
            );
            headers = ['ID','Name','Email','Mobile','Plan','Type','Amount','Currency','Status','Order ID','Payment ID','Sub Type','Sub End','Date'];
        }

        const esc = (v) => { if (v == null) return ''; return `"${String(v).replace(/"/g, '""')}"`; };
        const csv = [headers.map(esc).join(','), ...rows.map(r => Object.values(r).map(esc).join(','))].join('\r\n');
        const fname = `gundusoodhi_${type}_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        res.send('\uFEFF' + csv);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ success: false, message: 'Export failed' });
    }
};

// Admin: Update user subscription manually
const adminUpdateSubscription = async (req, res) => {
    try {
        const { userId } = req.params;
        const { subscription_type, subscription_end_date, is_active } = req.body;

        let setClauses = [];
        let params = [];

        if (subscription_type !== undefined) {
            setClauses.push('subscription_type = ?');
            params.push(subscription_type === 'MAGAZINE' ? 'OFFLINE' : subscription_type);
        }
        if (subscription_end_date !== undefined) {
            setClauses.push('subscription_end_date = ?');
            if (subscription_end_date) {
                const mysqlDate = new Date(subscription_end_date).toISOString().slice(0, 19).replace('T', ' ');
                params.push(mysqlDate);
            } else {
                params.push(null);
            }
        }
        if (is_active !== undefined) {
            setClauses.push('is_active = ?');
            params.push(is_active);
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        params.push(userId);
        await query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, params);

        subscriptionLogger.info(`Admin manually updated subscription for user ${userId}. Details: ${JSON.stringify(req.body)}`);

        res.json({ success: true, message: 'Subscription updated' });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
};

// Admin: Get payment stats for dashboard
const getPaymentStats = async (req, res) => {
    try {
        const [totalRevenue] = await query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'SUCCESS'");
        const [monthRevenue] = await query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'SUCCESS' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        const [totalPayments] = await query("SELECT COUNT(*) as count FROM payments");
        const [successPayments] = await query("SELECT COUNT(*) as count FROM payments WHERE status = 'SUCCESS'");
        const [failedPayments] = await query("SELECT COUNT(*) as count FROM payments WHERE status = 'FAILED'");

        res.json({
            success: true,
            data: {
                totalRevenue: totalRevenue.total,
                monthRevenue: monthRevenue.total,
                totalPayments: totalPayments.count,
                successPayments: successPayments.count,
                failedPayments: failedPayments.count
            }
        });
    } catch (error) {
        console.error('Payment stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payment stats' });
    }
};
// Cancel/Delete a user's subscription
const adminCancelSubscription = async (req, res) => {
    try {
        const { userId } = req.params;

        // Reset user subscription to FREE
        await query(
            `UPDATE users 
             SET subscription_type = 'FREE', 
                 subscription_start_date = NULL, 
                 subscription_end_date = NULL 
             WHERE id = ?`,
            [userId]
        );

        // Cancel all active magazine_subscriptions for this user
        await query(
            `UPDATE magazine_subscriptions 
             SET is_active = 0 
             WHERE user_id = ? AND is_active = 1`,
            [userId]
        );

        subscriptionLogger.info(`Admin manually cancelled subscription for user ${userId}.`);

        res.json({
            success: true,
            message: 'Subscription cancelled successfully. User reverted to FREE plan.'
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
};

// Get subscription history for a specific user
const getUserSubscriptionHistory = async (req, res) => {
    try {
        const { userId } = req.params;

        // Get user info
        const [userInfo] = await query(
            `SELECT id, name, email, subscription_type, subscription_start_date, subscription_end_date, is_active, created_at
             FROM users WHERE id = ?`,
            [userId]
        );

        if (!userInfo) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get all payments for this user
        const payments = await query(
            `SELECT p.id, p.razorpay_order_id, p.razorpay_payment_id, p.amount, p.currency, p.status, p.created_at,
                    sp.name as plan_name, sp.type as plan_type, sp.duration_months
             FROM payments p
             LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
             WHERE p.user_id = ?
             ORDER BY p.created_at DESC`,
            [userId]
        );

        // Get all magazine_subscriptions for this user
        const subscriptions = await query(
            `SELECT id, subscription_type, price_paid, duration_months, start_date, end_date, is_active, payment_id, created_at
             FROM magazine_subscriptions
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                user: userInfo,
                payments,
                subscriptions
            }
        });
    } catch (error) {
        console.error('User subscription history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscription history' });
    }
};

const getMyOfflineOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await query(
            `SELECT o.*, p.name as plan_name 
             FROM offline_orders o 
             LEFT JOIN subscription_plans p ON o.plan_id = p.id
             WHERE o.user_id = ? ORDER BY o.created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: orders });
    } catch(err) {
         res.status(500).json({ success: false });
    }
};

module.exports = {
    getPlans,
    getMySubscription,
    createOrder,
    verifyPayment,
    razorpayWebhook,
    getPaymentsHistory,
    adminGetPlans,
    adminCreatePlan,
    adminUpdatePlan,
    adminDeletePlan,
    getSubscribers,
    adminUpdateSubscription,
    adminCancelSubscription,
    getUserSubscriptionHistory,
    getPaymentStats,
    getOfflineOrders,
    updateOfflineOrder,
    getMyOfflineOrders,
    exportPayments
};
