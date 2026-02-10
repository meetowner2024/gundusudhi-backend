const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../config/database');

const generateToken = (userId, version, expiresIn = '1h') => {
    return jwt.sign(
        { userId, version },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

const generateRefreshToken = () => {
    return crypto.randomBytes(40).toString('hex');
};

const register = async (req, res) => {
    try {
        const { 
            name, email, password, mobile,
            state, district, constituency, mandal, pincode, address
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }

        const existingUsers = await query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const refreshToken = generateRefreshToken();

        const result = await transaction(async (connection) => {
            const [userResult] = await connection.execute(
                `INSERT INTO users (name, email, password_hash, mobile, role, token_version, last_active_at, refresh_token_hash) 
                 VALUES (?, ?, ?, ?, 'FREE_USER', 1, NOW(), ?)`,
                [name, email, passwordHash, mobile || null, refreshToken]
            );
            const userId = userResult.insertId;

            if (state || district || address) {
                await connection.execute(
                    `INSERT INTO user_addresses (user_id, state, district, constituency, mandal, pincode, address) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [userId, state || null, district || null, constituency || null, mandal || null, pincode || null, address || null]
                );
            }
            return userId;
        });

        const token = generateToken(result, 1);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                token,
                refreshToken, 
                user: { id: result, name, email, role: 'FREE_USER', subscription_type: 'FREE' }
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

        const users = await query(
            `SELECT id, name, email, password_hash, role, subscription_type, is_active, token_version 
             FROM users WHERE email = ?`,
            [email]
        );

        if (users.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const user = users[0];
        
        if (!user.is_active) return res.status(401).json({ success: false, message: 'Account is deactivated' });

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const newVersion = (user.token_version || 0) + 1;
        const refreshToken = generateRefreshToken();
        
        await query(
            `UPDATE users SET token_version = ?, last_active_at = NOW(), refresh_token_hash = ? WHERE id = ?`,
            [newVersion, refreshToken, user.id]
        );

        const token = generateToken(user.id, newVersion);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                refreshToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    subscription_type: user.subscription_type
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh Token required' });

        const users = await query(
            `SELECT id, token_version, last_active_at FROM users WHERE refresh_token_hash = ?`,
            [refreshToken]
        );

        if (users.length === 0) return res.status(403).json({ success: false, message: 'Invalid Refresh Token' });

        const user = users[0];
        const lastActive = new Date(user.last_active_at).getTime();
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - lastActive > oneHour) {
            return res.status(403).json({ success: false, message: 'Session expired due to inactivity. Please login again.' });
        }

        await query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [user.id]);
        
        const newToken = generateToken(user.id, user.token_version);

        res.json({
            success: true,
            data: {
                token: newToken
            }
        });
    } catch (error) {
        console.error('RefreshToken error:', error);
        res.status(500).json({ success: false, message: 'Failed to refresh token' });
    }
};

const logout = async (req, res) => {
    try {
        if(req.user) {
            await query(
                `UPDATE users SET refresh_token_hash = NULL, token_version = token_version + 1 WHERE id = ?`,
                [req.user.id]
            );
        }
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
};

const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const users = await query(
            `SELECT u.id, u.name, u.email, u.mobile, u.role, u.subscription_type,
                    u.subscription_start_date, u.subscription_end_date,
                    ua.state, ua.district, ua.constituency, ua.mandal, ua.pincode, ua.address
             FROM users u
             LEFT JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_primary = TRUE
             WHERE u.id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        res.json({
            success: true,
            data: users[0]
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch profile', 
            error: error.message 
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            name, 
            mobile,
            state,
            district,
            constituency,
            mandal,
            pincode,
            address
        } = req.body;

        await transaction(async (connection) => {
            if (name || mobile) {
                const updates = [];
                const values = [];
                if (name) {
                    updates.push('name = ?');
                    values.push(name);
                }
                if (mobile) {
                    updates.push('mobile = ?');
                    values.push(mobile);
                }
                values.push(userId);
                
                await connection.execute(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                    values
                );
            }

            if (state || district || address) {
                const [existing] = await connection.execute(
                    'SELECT id FROM user_addresses WHERE user_id = ? AND is_primary = TRUE',
                    [userId]
                );

                if (existing.length > 0) {
                    await connection.execute(
                        `UPDATE user_addresses 
                         SET state = ?, district = ?, constituency = ?, mandal = ?, pincode = ?, address = ?
                         WHERE user_id = ? AND is_primary = TRUE`,
                        [state, district, constituency, mandal, pincode, address, userId]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO user_addresses 
                         (user_id, state, district, constituency, mandal, pincode, address) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [userId, state, district, constituency, mandal, pincode, address]
                    );
                }
            }
        });

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update profile', 
            error: error.message 
        });
    }
};

const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

        const users = await query(
            `SELECT id, name, email, password_hash, role, subscription_type, is_active, token_version 
             FROM users WHERE email = ?`,
            [email]
        );

        if (users.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const user = users[0];
        
        if (!['ADMIN', 'EDITOR'].includes(user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }

        if (!user.is_active) return res.status(401).json({ success: false, message: 'Account is deactivated' });

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const newVersion = (user.token_version || 0) + 1;
        const refreshToken = generateRefreshToken();
        
        await query(
            `UPDATE users SET token_version = ?, last_active_at = NOW(), refresh_token_hash = ? WHERE id = ?`,
            [newVersion, refreshToken, user.id]
        );

        const token = generateToken(user.id, newVersion);

        res.json({
            success: true,
            message: 'Admin login successful',
            data: {
                token,
                refreshToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    subscription_type: user.subscription_type
                }
            }
        });
    } catch (error) {
        console.error('Admin Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
};

const createAdmin = async (req, res) => {
    try {
        const { 
            name, email, password, mobile, role 
        } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and role are required' });
        }

        if (!['ADMIN', 'EDITOR', 'MODERATOR'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role. Must be ADMIN, EDITOR, or MODERATOR' });
        }

        const existingUsers = await query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const refreshToken = generateRefreshToken();

        const result = await transaction(async (connection) => {
            const [userResult] = await connection.execute(
                `INSERT INTO users (name, email, password_hash, mobile, role, token_version, last_active_at, refresh_token_hash) 
                 VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)`,
                [name, email, passwordHash, mobile || null, role, refreshToken]
            );
            return userResult.insertId;
        });

        res.status(201).json({
            success: true,
            message: `${role} account created successfully`,
            data: {
                id: result,
                name,
                email,
                role
            }
        });
    } catch (error) {
        console.error('Create Admin error:', error);
        res.status(500).json({ success: false, message: 'Failed to create admin account', error: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { oldPassword, newPassword, adminPassword } = req.body;

        if (!oldPassword || !newPassword || !adminPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Old password, new password, and admin password are required' 
            });
        }

        // Verify Admin Password
        if (adminPassword !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({
                success: false,
                message: 'Invalid admin verification password'
            });
        }

        const users = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        
        const user = users[0];
        const isPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid old password' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await query(
            'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
            [newHash, userId]
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Failed to change password' });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email, newPassword, adminPassword } = req.body;

        if (!email || !newPassword || !adminPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email, new password, and admin password are required' 
            });
        }

        // Verify Admin Password
        if (adminPassword !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({
                success: false,
                message: 'Invalid admin verification password'
            });
        }

        const users = await query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userId = users[0].id;
        const newHash = await bcrypt.hash(newPassword, 10);

        await query(
            'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
            [newHash, userId]
        );

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
};

module.exports = {
    register,
    login,
    adminLogin,
    createAdmin,
    refreshToken,
    logout,
    getProfile,
    updateProfile,
    changePassword,
    forgotPassword
};
