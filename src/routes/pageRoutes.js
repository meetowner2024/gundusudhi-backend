const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Existing homepage/news routes
router.get('/homepage', pageController.getHomepageData);
router.get('/news/position', pageController.getNewsByPosition);
router.get('/section/:sectionSlug', pageController.getSectionNews);
router.get('/layout/:pageSlug', pageController.getPageLayout);
router.get('/districts/:districtId?', pageController.getDistrictNews);

// New dynamic pages routes (About, Contact, Terms, etc.)
router.get('/static/list', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), pageController.listStaticPages);
router.get('/static/:slug', pageController.getStaticPage); // Public access
router.post('/static/:slug', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), pageController.updateStaticPage); // Create/Update
router.delete('/static/:slug', authenticateToken, authorizeRoles('ADMIN'), pageController.deleteStaticPage);

module.exports = router;
