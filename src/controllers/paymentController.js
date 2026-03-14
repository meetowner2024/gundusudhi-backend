const Razorpay = require('razorpay');
const crypto = require('crypto');
const { query } = require('../config/database');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.TEST_PAYMENT_GATEWAY_KEY || 'YOUR_RAZORPAY_KEY',
    key_secret: process.env.TEST_PAYMENT_GATEWAY_SECRET || 'YOUR_RAZORPAY_SECRET'
});

// Fetch all available subscription plans
const getPlans = async (req, res) => {
    try {
        const plans = await query('SELECT * FROM subscription_plans WHERE is_active = TRUE');
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
        const userId = req.user.id; // From authMiddleware

        // Check if plan exists
        const plans = await query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
        if (plans.length === 0) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        const plan = plans[0];

        // Create Order on Razorpay
        const options = {
            amount: plan.price * 100, // Amount in paise
            currency: 'INR',
            receipt: `receipt_user_${userId}_plan_${planId}`,
            notes: {
                userId,
                planId: plan.id,
                planType: plan.type
            }
        };

        const order = await razorpay.orders.create(options);

        // Save order in our database
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
            const { user_id, plan_id } = payments[0];
            const plans = await query('SELECT type, duration_months FROM subscription_plans WHERE id = ?', [plan_id]);
            
            if (plans.length > 0) {
                const plan = plans[0];
                
                // Calculate new end date
                // If user already has an active subscription, we might append or replace based on logic
                // For simplicity, we override from now
                const [user] = await query('SELECT subscription_end_date FROM users WHERE id = ?', [user_id]);
                
                let startDate = new Date();
                let isExtending = false;
                
                // If the user already has a valid active subscription end date, extend it instead
                if (user && user.subscription_end_date && new Date(user.subscription_end_date) > new Date()) {
                    startDate = new Date(user.subscription_end_date);
                    isExtending = true;
                }
                
                // Add months
                const endDate = new Date(startDate.setMonth(startDate.getMonth() + plan.duration_months));

                const typeToUpdate = plan.type; // ONLINE, BOTH
                const startStr = isExtending ? '(Retained original)' : "NOW()";

                // Update user subscription
                await query(
                    `UPDATE users 
                     SET subscription_type = ?, 
                         subscription_start_date = IFNULL(subscription_start_date, NOW()), 
                         subscription_end_date = ? 
                     WHERE id = ?`,
                    [typeToUpdate, endDate, user_id]
                );
            }
        }

        res.json({ success: true, message: 'Payment verified and subscription activated.' });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

// Webhook for fault tolerance (in case client disconnected before /verify)
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
                return res.json({ status: 'ok' }); // Already processed
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

                // Fetch userId and Plan to update user
                const payments = await query('SELECT user_id, plan_id FROM payments WHERE razorpay_order_id = ?', [orderId]);
                if (payments.length > 0) {
                    const { user_id, plan_id } = payments[0];
                    const plans = await query('SELECT type, duration_months FROM subscription_plans WHERE id = ?', [plan_id]);
                    if (plans.length > 0) {
                        const plan = plans[0];
                        
                        const [user] = await query('SELECT subscription_end_date FROM users WHERE id = ?', [user_id]);
                        let startDate = new Date();
                        if (user && user.subscription_end_date && new Date(user.subscription_end_date) > new Date()) {
                            startDate = new Date(user.subscription_end_date);
                        }
                        const endDate = new Date(startDate.setMonth(startDate.getMonth() + plan.duration_months));

                        await query(
                            `UPDATE users SET subscription_type = ?, subscription_start_date = IFNULL(subscription_start_date, NOW()), subscription_end_date = ? WHERE id = ?`,
                            [plan.type, endDate, user_id]
                        );
                    }
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

// Admin: Get all payments history
const getPaymentsHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = "";
        let queryParams = [];

        if (status) {
            whereClause = "WHERE p.status = ?";
            queryParams.push(status);
        }

        const payments = await query(
            `SELECT p.*, u.name as user_name, u.email as user_email, sp.name as plan_name
             FROM payments p
             JOIN users u ON p.user_id = u.id
             JOIN subscription_plans sp ON p.plan_id = sp.id
             ${whereClause}
             ORDER BY p.created_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        const [countRes] = await query(`SELECT COUNT(*) as total FROM payments p ${whereClause}`, queryParams);

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

module.exports = {
    getPlans,
    createOrder,
    verifyPayment,
    razorpayWebhook,
    getPaymentsHistory
};
