const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../config/database');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// Register new user
const register = async (req, res) => {
    try {
        const { 
            name, 
            email, 
            password, 
            mobile,
            state,
            district,
            constituency,
            mandal,
            pincode,
            address
        } = req.body;

        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, email, and password are required' 
            });
        }

        // Check if user already exists
        const existingUsers = await query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Use transaction to create user and address
        const result = await transaction(async (connection) => {
            // Insert user
            const [userResult] = await connection.execute(
                `INSERT INTO users (name, email, password_hash, mobile, role) 
                 VALUES (?, ?, ?, ?, 'FREE_USER')`,
                [name, email, passwordHash, mobile || null]
            );

            const userId = userResult.insertId;

            // Insert address if provided
            if (state || district || address) {
                await connection.execute(
                    `INSERT INTO user_addresses 
                     (user_id, state, district, constituency, mandal, pincode, address) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [userId, state, district, constituency, mandal, pincode, address]
                );
            }

            return userId;
        });

        // Generate token
        const token = generateToken(result);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                token,
                user: {
                    id: result,
                    name,
                    email,
                    role: 'FREE_USER',
                    subscription_type: 'FREE'
                }
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed', 
            error: error.message 
        });
    }
};

// Login user
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }

        // Find user
        const users = await query(
            `SELECT id, name, email, password_hash, role, subscription_type, is_active 
             FROM users WHERE email = ?`,
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        const user = users[0];

        if (!user.is_active) {
            return res.status(401).json({ 
                success: false, 
                message: 'Account is deactivated' 
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Generate token
        const token = generateToken(user.id);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
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
        res.status(500).json({ 
            success: false, 
            message: 'Login failed', 
            error: error.message 
        });
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

module.exports = {
    register,
    login,
    getProfile,
    updateProfile
};
