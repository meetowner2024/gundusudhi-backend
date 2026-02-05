const express = require('express');
const router = express.Router();
const dynamicContentController = require('../controllers/dynamicContentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
router.get('/homepage/full', dynamicContentController.getFullHomepageData);
router.get('/trending', dynamicContentController.getTrendingTopics);
router.get('/videos', dynamicContentController.getYoutubeVideos);
router.get('/videos/daily', dynamicContentController.getDailyVideo);
router.get('/ads', dynamicContentController.getAdvertisements);
router.post('/ads/:id/click', dynamicContentController.trackAdClick);
router.get('/districts', dynamicContentController.getDistricts);
router.get('/districts/:slug/news', dynamicContentController.getDistrictNews);
router.get('/placements/:position', dynamicContentController.getNewsByPlacement);
router.get('/highlights', dynamicContentController.getKeyHighlights);


router.post('/admin/trending', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveTrendingTopic);
router.delete('/admin/trending/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.deleteTrendingTopic);
router.get('/admin/videos', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.getAllYoutubeVideos);
router.post('/admin/videos', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveYoutubeVideo);
router.delete('/admin/videos/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.deleteYoutubeVideo);
router.post('/admin/ads', authenticateToken, authorizeRoles('ADMIN'), dynamicContentController.saveAdvertisement);
router.post('/admin/placements', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.setNewsPlacement);
router.delete('/admin/placements', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.removeNewsPlacement);
router.post('/admin/highlights', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), dynamicContentController.saveKeyHighlight);
module.exports = router;
