const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/traffic', adminController.getTrafficStats);
router.get('/dashboard/content-analytics', adminController.getContentAnalytics);
router.get('/dashboard/analytics/detailed', adminController.getDetailedAnalytics);
router.get('/users', adminController.getAllUsers);
router.get('/users/export', adminController.exportUsers);
router.get('/logs', adminController.getSystemLogs);

router.get('/test-log', (req, res) => {
    const { paymentsLogger, subscriptionLogger, activityLogger } = require('../utils/logger');
    paymentsLogger.info('Manual test log from /test-log endpoint for Payments');
    subscriptionLogger.info('Manual test log from /test-log endpoint for Subscriptions');
    activityLogger.info('Manual test log from /test-log endpoint for Activity');
    res.json({ success: true, message: 'Test logs generated immediately. Please check logs tab.' });
});

router.get('/users/:id/activity', adminController.getUserActivity);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.get('/users/:id/logs', adminController.getActivityLogs);
module.exports = router;
