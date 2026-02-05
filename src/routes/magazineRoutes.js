const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
    authenticateToken, 
    authorizeRoles,
    optionalAuth,
    checkSubscription 
} = require('../middleware/auth');
const {
    uploadMagazine,
    uploadMagazinePages,
    updateMagazine,
    deleteMagazine,
    adminListMagazines,
    setPreviewPages,
    listMagazines,
    getMagazineDetails,
    getPreviewPages,
    servePreviewImage,
    startReadingSession,
    getMagazinePage,
    serveSecureImage
} = require('../controllers/magazineController');
const uploadDirs = [
    path.join(__dirname, '../../uploads/magazines'),
    path.join(__dirname, '../../uploads/magazines/covers'),
    path.join(__dirname, '../../uploads/magazines/pages')
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});
const coverStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/magazines/covers'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `cover-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const pageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/magazines/pages'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `page-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const imageFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
};
const uploadCover = multer({
    storage: coverStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});
const uploadPages = multer({
    storage: pageStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});
const magazineUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (file.fieldname === 'cover_image') {
                cb(null, path.join(__dirname, '../../uploads/magazines/covers'));
            } else if (file.fieldname === 'pdf_file') {
                cb(null, path.join(__dirname, '../../uploads/magazines'));
            } else {
                cb(null, path.join(__dirname, '../../uploads/magazines'));
            }
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const prefix = file.fieldname === 'cover_image' ? 'cover' : 'pdf';
            cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'cover_image') {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Only JPEG, PNG, and WebP images are allowed for cover'), false);
            }
        } else if (file.fieldname === 'pdf_file') {
            if (file.mimetype === 'application/pdf') {
                cb(null, true);
            } else {
                cb(new Error('Only PDF files are allowed'), false);
            }
        } else {
            cb(null, true);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 }
});
const { trackActivity } = require('../middleware/activityTracker');
router.get('/', optionalAuth, listMagazines);
router.get('/details/:slug', optionalAuth, trackActivity('VIEW', 'magazine'), getMagazineDetails);
router.get('/preview/:magazineId', trackActivity('PREVIEW', 'magazine'), getPreviewPages);
router.get('/preview-image/:magazineId/:pageNumber', servePreviewImage);
router.post(
    '/read/:magazineId/start',
    authenticateToken,
    startReadingSession
);
router.get(
    '/read/session/:sessionId/page/:pageNumber',
    authenticateToken,
    getMagazinePage
);
router.get(
    '/secure-image/:magazineId/:pageNumber',
    serveSecureImage
);
router.get(
    '/admin/list',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    adminListMagazines
);
router.post(
    '/admin/create',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    magazineUpload.fields([
        { name: 'cover_image', maxCount: 1 },
        { name: 'pdf_file', maxCount: 1 }
    ]),
    uploadMagazine
);
router.post(
    '/admin/:magazineId/pages',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    uploadPages.array('pages', 200),
    uploadMagazinePages
);
router.put(
    '/admin/:id',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    uploadCover.single('cover_image'),
    updateMagazine
);
router.delete(
    '/admin/:id',
    authenticateToken,
    authorizeRoles('ADMIN'),
    deleteMagazine
);
router.post(
    '/admin/:magazineId/preview-pages',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    setPreviewPages
);
module.exports = router;
