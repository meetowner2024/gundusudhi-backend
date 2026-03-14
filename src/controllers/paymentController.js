const Razorpay = require('razorpay');
const crypto = require('crypto');
const { query, transaction } = require('../config/database');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.TEST_PAYMENT_GATEWAY_KEY || 'YOUR_RAZORPAY_KEY',
    key_secret: process.env.TEST_PAYMENT_GATEWAY_SECRET || 'YOUR_RAZORPAY_SECRET'
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

// Create a Razorpay Order
const createOrder = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.id;

        const plans = await query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
        if (plans.length === 0) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        const plan = plans[0];

        const options = {
            amount: plan.price * 100, // Amount in paise
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

        res.json({
            success: true,
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.TEST_PAYMENT_GATEWAY_KEY
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

    // Update user subscription
    await query(
        `UPDATE users 
         SET subscription_type = ?, 
             subscription_start_date = IFNULL(subscription_start_date, NOW()), 
             subscription_end_date = ? 
         WHERE id = ?`,
        [plan.type, endDate, userId]
    );

    // Create magazine_subscriptions record
    await query(
        `INSERT INTO magazine_subscriptions (user_id, plan_id, payment_id, start_date, end_date, status)
         SELECT ?, ?, p.id, NOW(), ?, 'ACTIVE'
         FROM payments p WHERE p.razorpay_order_id = ?
         ON DUPLICATE KEY UPDATE status = 'ACTIVE', end_date = VALUES(end_date)`,
        [userId, planId, endDate, razorpayOrderId]
    );
};

// Verify Payment Signature and Complete Order
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.TEST_PAYMENT_GATEWAY_SECRET || 'YOUR_RAZORPAY_SECRET')
            .update(body.toString())
            .digest('hex');

        const isSignatureValid = expectedSignature === razorpay_signature;

        if (!isSignatureValid) {
            await query('UPDATE payments SET status = "FAILED" WHERE razorpay_order_id = ?', [razorpay_order_id]);
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

        // Get payment details to grant subscription
        const payments = await query('SELECT user_id, plan_id FROM payments WHERE razorpay_order_id = ?', [razorpay_order_id]);
        if (payments.length > 0) {
            await activateSubscription(payments[0].user_id, payments[0].plan_id, razorpay_order_id);
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
        const secret = process.env.TEST_RAZORPAY_WEBHOOK_SECRET;
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

                const payments = await query('SELECT user_id, plan_id FROM payments WHERE razorpay_order_id = ?', [orderId]);
                if (payments.length > 0) {
                    await activateSubscription(payments[0].user_id, payments[0].plan_id, orderId);
                }
            } else if (event === 'payment.failed') {
                await query('UPDATE payments SET status = "FAILED" WHERE razorpay_order_id = ?', [payload.order_id]);
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

// Admin: Update user subscription manually
const adminUpdateSubscription = async (req, res) => {
    try {
        const { userId } = req.params;
        const { subscription_type, subscription_end_date, is_active } = req.body;

        let setClauses = [];
        let params = [];

        if (subscription_type !== undefined) {
            setClauses.push('subscription_type = ?');
            params.push(subscription_type);
        }
        if (subscription_end_date !== undefined) {
            setClauses.push('subscription_end_date = ?');
            params.push(subscription_end_date);
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
             SET status = 'CANCELLED', updated_at = NOW() 
             WHERE user_id = ? AND status = 'ACTIVE'`,
            [userId]
        );

        res.json({
            success: true,
            message: 'Subscription cancelled successfully. User reverted to FREE plan.'
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
};

module.exports = {
    getPlans,
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
    getPaymentStats
};
