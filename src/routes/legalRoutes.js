const express = require('express');
const router = express.Router();
const legalController = require('../controllers/legalController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Public routes
router.get('/', legalController.listLegalPages); // public list for any use
router.get('/:slug', legalController.getLegalPage); // public read

// Admin-protected routes
router.put('/:slug', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), legalController.upsertLegalPage);
router.delete('/:slug', authenticateToken, authorizeRoles('ADMIN'), legalController.resetLegalPage);

module.exports = router;
