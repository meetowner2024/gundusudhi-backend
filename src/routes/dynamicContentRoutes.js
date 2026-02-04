const express = require('express');
const router = express.Router();
const dynamicContentController = require('../controllers/dynamicContentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ============================================
// PUBLIC ROUTES (For Frontend)
// ============================================

// Full homepage data
router.get('/homepage/full', dynamicContentController.getFullHomepageData);

// Widgets
router.get('/widgets/:widgetType', dynamicContentController.getWidgetWithItems);

// Editorials
router.get('/editorial/featured', dynamicContentController.getFeaturedEditorial);

// Trending
router.get('/trending', dynamicContentController.getTrendingTopics);

// YouTube Videos
router.get('/videos', dynamicContentController.getYoutubeVideos);
router.get('/videos/daily', dynamicContentController.getDailyVideo);

// Advertisements
router.get('/ads', dynamicContentController.getAdvertisements);
router.post('/ads/:id/click', dynamicContentController.trackAdClick);

// Districts
router.get('/districts', dynamicContentController.getDistricts);
router.get('/districts/:slug/news', dynamicContentController.getDistrictNews);

// News Placements
router.get('/placements/:position', dynamicContentController.getNewsByPlacement);

// Key Highlights
router.get('/highlights', dynamicContentController.getKeyHighlights);

// ============================================
// ADMIN ROUTES (Require Authentication)
// ============================================

// Widgets Admin
router.get('/admin/widgets', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.getAllWidgets);
router.post('/admin/widgets/items', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveWidgetItem);
router.delete('/admin/widgets/items/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.deleteWidgetItem);

// Editorials Admin
router.get('/admin/editorials', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.getAllEditorials);
router.post('/admin/editorials', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveEditorial);

// Trending Admin
router.post('/admin/trending', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveTrendingTopic);
router.delete('/admin/trending/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.deleteTrendingTopic);

// YouTube Admin
router.post('/admin/videos', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveYoutubeVideo);
router.delete('/admin/videos/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.deleteYoutubeVideo);

// Advertisements Admin
router.post('/admin/ads', authenticateToken, authorizeRoles('ADMIN'), dynamicContentController.saveAdvertisement);

// Placements Admin
router.post('/admin/placements', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.setNewsPlacement);
router.delete('/admin/placements', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.removeNewsPlacement);

// Key Highlights Admin
router.post('/admin/highlights', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveKeyHighlight);

module.exports = router;
