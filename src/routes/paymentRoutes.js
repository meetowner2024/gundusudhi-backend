const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');

const {
    getPlans,
    createOrder,
    verifyPayment,
    razorpayWebhook,
    getPaymentsHistory
} = require('../controllers/paymentController');

// Public/User Routes
router.get('/plans', getPlans);
router.post('/create-order', authenticate, createOrder);
router.post('/verify', authenticate, verifyPayment);

// Webhook Route (no auth middleware because it's called by Razorpay)
router.post('/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

// Admin Routes
router.get('/history', authenticate, authorize(['ADMIN', 'EDITOR']), getPaymentsHistory);

module.exports = router;
