const express = require('express');
const router = express.Router();
const { listPasscodes, createPasscode, updatePasscode, deletePasscode } = require('../controllers/passcodeController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All passcode routes require ADMIN auth
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

router.get('/', listPasscodes);
router.post('/', createPasscode);
router.put('/:id', updatePasscode);
router.delete('/:id', deletePasscode);

module.exports = router;
