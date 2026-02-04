const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access token required' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch user from database
        const users = await query(
            'SELECT id, name, email, role, subscription_type, token_version FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token or user not found' 
            });
        }

        const user = users[0];

        // Check Token Version (for Single Session)
        // If decoded version exists and doesn't match DB, token is invalid (logged out or logged in elsewhere)
        if (decoded.version && user.token_version && decoded.version !== user.token_version) {
             return res.status(401).json({ 
                success: false, 
                message: 'Session expired or logged in from another device' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Token expired' 
            });
        }
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid token' 
        });
    }
};

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const users = await query(
                    'SELECT id, name, email, role, subscription_type, token_version FROM users WHERE id = ?',
                    [decoded.userId]
                );
                if (users.length > 0) {
                    const user = users[0];
                    if (!decoded.version || !user.token_version || decoded.version === user.token_version) {
                        req.user = user;
                    }
                }
            } catch (err) {
                // Token invalid or expired, just proceed as guest
            }
        }
        next();
    } catch (error) {
        next();
    }
};

// Middleware to check user roles
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required' 
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }

        next();
    };
};

// Middleware to check subscription status
const checkSubscription = (requiredType = 'FREE') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required' 
            });
        }

        const subscriptionHierarchy = {
            'FREE': 0,
            'ONLINE': 1,
            'OFFLINE': 1,
            'BOTH': 2
        };

        const userLevel = subscriptionHierarchy[req.user.subscription_type] || 0;
        const requiredLevel = subscriptionHierarchy[requiredType] || 0;

        if (userLevel < requiredLevel) {
            return res.status(403).json({ 
                success: false, 
                message: 'Premium subscription required to access this content' 
            });
        }

        next();
    };
};

module.exports = {
    authenticateToken,
    authorizeRoles,
    checkSubscription,
    optionalAuth
};
