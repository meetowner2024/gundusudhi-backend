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
    // Admin routes
    uploadMagazine,
    uploadMagazinePages,
    updateMagazine,
    deleteMagazine,
    adminListMagazines,
    setPreviewPages,
    
    // Public routes
    listMagazines,
    getMagazineDetails,
    getPreviewPages,
    servePreviewImage,
    
    // Protected routes
    startReadingSession,
    getMagazinePage,
    serveSecureImage
} = require('../controllers/magazineController');

// Ensure upload directories exist
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

// Configure multer for cover images
const coverStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/magazines/covers'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `cover-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// Configure multer for page images
const pageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/magazines/pages'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `page-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// File filter for images
const imageFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
};

// Multer instances
const uploadCover = multer({
    storage: coverStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadPages = multer({
    storage: pageStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB per page
});

// Combined upload for magazine creation (cover + pdf optional)
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
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB for PDFs
});

// =====================================
// PUBLIC ROUTES (No auth required)
// =====================================

// List all published magazines
router.get('/', optionalAuth, listMagazines);

// Get magazine details by slug
router.get('/details/:slug', optionalAuth, getMagazineDetails);

// Get preview pages for non-subscribers
router.get('/preview/:magazineId', getPreviewPages);

// Serve preview image (public, first 3 pages only)
router.get('/preview-image/:magazineId/:pageNumber', servePreviewImage);

// =====================================
// PROTECTED ROUTES (Auth required)
// =====================================

// Start reading session (requires subscription for premium)
router.post(
    '/read/:magazineId/start',
    authenticateToken,
    startReadingSession
);

// Get magazine page during reading session
router.get(
    '/read/session/:sessionId/page/:pageNumber',
    authenticateToken,
    getMagazinePage
);

// Serve secure image (with encrypted token)
router.get(
    '/secure-image/:magazineId/:pageNumber',
    serveSecureImage
);

// =====================================
// ADMIN ROUTES (Admin/Editor only)
// =====================================

// List all magazines (including unpublished)
router.get(
    '/admin/list',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    adminListMagazines
);

// Create new magazine
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

// Upload pages for a magazine
router.post(
    '/admin/:magazineId/pages',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    uploadPages.array('pages', 200), // Up to 200 pages
    uploadMagazinePages
);

// Update magazine
router.put(
    '/admin/:id',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    uploadCover.single('cover_image'),
    updateMagazine
);

// Delete magazine
router.delete(
    '/admin/:id',
    authenticateToken,
    authorizeRoles('ADMIN'),
    deleteMagazine
);

// Set preview pages
router.post(
    '/admin/:magazineId/preview-pages',
    authenticateToken,
    authorizeRoles('ADMIN', 'EDITOR'),
    setPreviewPages
);

module.exports = router;
