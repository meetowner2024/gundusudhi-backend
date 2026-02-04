const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Public routes
router.get('/', sectionController.getAllSections);

// Admin routes
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), sectionController.createSection);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), sectionController.updateSection);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), sectionController.deleteSection);

// Subsection routes
router.post('/subsections', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), sectionController.createSubsection);
router.put('/subsections/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), sectionController.updateSubsection);
router.delete('/subsections/:id', authenticateToken, authorizeRoles('ADMIN'), sectionController.deleteSubsection);

module.exports = router;
