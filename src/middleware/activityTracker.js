const { query } = require('../config/database');
const trackActivity = (actionType = 'VIEW', entityType = null) => {
    return async (req, res, next) => {
        const originalEnd = res.end;
        res.end = function (chunk, encoding) {
            res.end = originalEnd;
            res.end(chunk, encoding);
            logActivity(req, res, actionType, entityType).catch(err => {
                console.error('Activity tracking error:', err);
            });
        };
        next();
    };
};
const logActivity = async (req, res, actionType, entityType) => {
    try {
        if (!req.user) return;
        const userId = req.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        let details = {};
        let entityId = null;
        if (req.params.id) {
            entityId = req.params.id;
        } else if (req.params.slug) {
            details.slug = req.params.slug;
        }
        details.method = req.method;
        details.path = req.path;
        details.ua = req.get('User-Agent');
        if (!entityType) {
            if (req.baseUrl.includes('news')) entityType = 'article';
            else if (req.baseUrl.includes('magazines')) entityType = 'magazine';
            else if (req.baseUrl.includes('users')) entityType = 'user';
            else entityType = 'general';
        }
        if (req.route && req.route.path === '/:slug') {
            details.lookup_by = 'slug';
        }
        await query(
            `INSERT INTO activity_logs 
            (user_id, action, entity_type, entity_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userId, 
                actionType, 
                entityType, 
                entityId, 
                JSON.stringify(details), 
                ipAddress
            ]
        );
    } catch (error) {
         console.error('Failed to log activity:', error.message);
    }
};
module.exports = { trackActivity };
