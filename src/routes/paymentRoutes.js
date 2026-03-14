const express = require('express');
const router = express.Router();
const { authenticateToken: authenticate, authorizeRoles: authorize } = require('../middleware/auth');

const {
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
    getPaymentStats
} = require('../controllers/paymentController');

// Public/User Routes
router.get('/plans', getPlans);
router.get('/my-subscription', authenticate, getMySubscription);
router.post('/create-order', authenticate, createOrder);
router.post('/verify', authenticate, verifyPayment);

// Webhook Route (no auth middleware because it's called by Razorpay)
router.post('/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

// Admin Routes
router.get('/history', authenticate, authorize('ADMIN', 'EDITOR'), getPaymentsHistory);
router.get('/stats', authenticate, authorize('ADMIN', 'EDITOR'), getPaymentStats);
router.get('/subscribers', authenticate, authorize('ADMIN', 'EDITOR'), getSubscribers);
router.put('/subscribers/:userId', authenticate, authorize('ADMIN'), adminUpdateSubscription);
router.delete('/subscribers/:userId', authenticate, authorize('ADMIN'), adminCancelSubscription);
router.get('/subscribers/:userId/history', authenticate, authorize('ADMIN', 'EDITOR'), getUserSubscriptionHistory);

// Admin: Subscription Plans CRUD
router.get('/admin/plans', authenticate, authorize('ADMIN', 'EDITOR'), adminGetPlans);
router.post('/admin/plans', authenticate, authorize('ADMIN'), adminCreatePlan);
router.put('/admin/plans/:id', authenticate, authorize('ADMIN'), adminUpdatePlan);
router.delete('/admin/plans/:id', authenticate, authorize('ADMIN'), adminDeletePlan);

module.exports = router;
