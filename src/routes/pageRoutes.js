const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');

// Public routes - no authentication required
router.get('/homepage', pageController.getHomepageData);
router.get('/news/position', pageController.getNewsByPosition);
router.get('/section/:sectionSlug', pageController.getSectionNews);
router.get('/layout/:pageSlug', pageController.getPageLayout);

module.exports = router;
