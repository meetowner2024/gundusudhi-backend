const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../config/database');

// Generate JWT token with version
const generateToken = (userId, version, expiresIn = '1h') => {
    return jwt.sign(
        { userId, version },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

// Generate Refresh Token
const generateRefreshToken = () => {
    return crypto.randomBytes(40).toString('hex');
};

// Register new user
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

// Login user
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

        // Update session info: Increment version (Invalidate old sessions), set refresh token
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

// Refresh Token
const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh Token required' });

        // Find user by refresh_token_hash (Usually we hash before store in real world if security high, but here simple string in column or direct compare)
        // Note: In register/login I stored simple string in refresh_token_hash column. 
        // Ideally should compare hashed, but for this implementation we assume direct storage or exact match if hashed.
        // Assuming direct storage for simplicity as column name suggests hash but I passed raw string. 
        // We really should use a separate sessions table for robust match, but here 1 user = 1 row.
        
        const users = await query(
            `SELECT id, token_version, last_active_at FROM users WHERE refresh_token_hash = ?`,
            [refreshToken]
        );

        if (users.length === 0) return res.status(403).json({ success: false, message: 'Invalid Refresh Token' });
        const user = users[0];

        // Check inactivity (1 hour)
        const lastActive = new Date(user.last_active_at).getTime();
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - lastActive > oneHour) {
            return res.status(403).json({ success: false, message: 'Session expired due to inactivity. Please login again.' });
        }

        // Issue new token
        // Keep version same or increment? If we increment, we invalidate previous access tokens immediately.
        // Typically refresh token flow keeps same version OR we rotate.
        // Let's keep version same as this is same session.
        
        // Update last_active
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

// Logout
const logout = async (req, res) => {
    try {
        if(req.user) {
            // Clear refresh token to prevent further refresh
            // Increment version to kill current access token immediately?
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

// Get current user profile
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

// Update user profile
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
            // Update user basic info
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

            // Update address
            if (state || district || address) {
                const [existing] = await connection.execute(
                    'SELECT id FROM user_addresses WHERE user_id = ? AND is_primary = TRUE',
                    [userId]
                );

                if (existing.length > 0) {
                    // Update existing address
                    await connection.execute(
                        `UPDATE user_addresses 
                         SET state = ?, district = ?, constituency = ?, mandal = ?, pincode = ?, address = ?
                         WHERE user_id = ? AND is_primary = TRUE`,
                        [state, district, constituency, mandal, pincode, address, userId]
                    );
                } else {
                    // Insert new address
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

        // Check Admin Role
        if (!['ADMIN', 'EDITOR'].includes(user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }

        if (!user.is_active) return res.status(401).json({ success: false, message: 'Account is deactivated' });

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        // Update session info
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

        // Validate role
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

module.exports = {
    register,
    login,
    adminLogin,
    createAdmin,
    refreshToken,
    logout,
    getProfile,
    updateProfile
};
