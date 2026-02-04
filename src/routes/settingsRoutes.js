const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Public routes
router.get('/all', settingsController.getSiteSettings);
router.get('/header', settingsController.getHeaderConfig);
router.get('/footer', settingsController.getFooterConfig);
router.get('/navigation', settingsController.getNavigationMenu);

// Admin only routes
router.put('/header', authenticateToken, authorizeRoles('ADMIN'), settingsController.updateHeaderConfig);
router.put('/footer', authenticateToken, authorizeRoles('ADMIN'), settingsController.updateFooterConfig);

module.exports = router;
