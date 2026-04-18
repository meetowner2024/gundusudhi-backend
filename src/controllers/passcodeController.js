const { query } = require('../config/database');

// GET /api/v1/passcodes — list all passcodes (admin only)
const listPasscodes = async (req, res) => {
    try {
        const codes = await query(
            `SELECT id, code, description, is_active, created_at, updated_at
             FROM password_reset_codes
             ORDER BY created_at DESC`
        );
        res.json({ success: true, data: codes });
    } catch (error) {
        console.error('List passcodes error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch passcodes' });
    }
};

// POST /api/v1/passcodes — create a new passcode (admin only)
const createPasscode = async (req, res) => {
    try {
        const { code, description } = req.body;
        if (!code || code.trim().length < 4) {
            return res.status(400).json({ success: false, message: 'Code must be at least 4 characters' });
        }

        // Check duplicate
        const existing = await query(`SELECT id FROM password_reset_codes WHERE code = ?`, [code.trim()]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'This passcode already exists' });
        }

        const result = await query(
            `INSERT INTO password_reset_codes (code, description, is_active) VALUES (?, ?, TRUE)`,
            [code.trim(), description?.trim() || null]
        );
        res.status(201).json({
            success: true,
            message: 'Passcode created successfully',
            data: { id: result.insertId, code: code.trim(), description, is_active: true }
        });
    } catch (error) {
        console.error('Create passcode error:', error);
        res.status(500).json({ success: false, message: 'Failed to create passcode' });
    }
};

// PUT /api/v1/passcodes/:id — update a passcode (admin only)
const updatePasscode = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, description, is_active } = req.body;

        const updates = [];
        const values = [];

        if (code !== undefined) {
            if (code.trim().length < 4) {
                return res.status(400).json({ success: false, message: 'Code must be at least 4 characters' });
            }
            // Check duplicate (excluding self)
            const existing = await query(`SELECT id FROM password_reset_codes WHERE code = ? AND id != ?`, [code.trim(), id]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'This passcode already exists' });
            }
            updates.push('code = ?');
            values.push(code.trim());
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description?.trim() || null);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        values.push(id);
        await query(`UPDATE password_reset_codes SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
        res.json({ success: true, message: 'Passcode updated successfully' });
    } catch (error) {
        console.error('Update passcode error:', error);
        res.status(500).json({ success: false, message: 'Failed to update passcode' });
    }
};

// DELETE /api/v1/passcodes/:id — delete a passcode (admin only)
const deletePasscode = async (req, res) => {
    try {
        const { id } = req.params;
        await query(`DELETE FROM password_reset_codes WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Passcode deleted successfully' });
    } catch (error) {
        console.error('Delete passcode error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete passcode' });
    }
};

// Internal helper — called by authController.forgotPassword
const validatePasscode = async (code) => {
    if (!code) return false;
    const rows = await query(
        `SELECT id FROM password_reset_codes WHERE code = ? AND is_active = TRUE`,
        [code.trim()]
    );
    return rows.length > 0;
};

module.exports = { listPasscodes, createPasscode, updatePasscode, deletePasscode, validatePasscode };
