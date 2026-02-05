const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
router.get('/homepage', pageController.getHomepageData);
router.get('/news/position', pageController.getNewsByPosition);
router.get('/section/:sectionSlug', pageController.getSectionNews);
router.get('/layout/:pageSlug', pageController.getPageLayout);
router.get('/districts/:districtId?', pageController.getDistrictNews);
module.exports = router;
