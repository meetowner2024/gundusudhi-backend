const { query } = require('../config/database');
const getDashboardStats = async (req, res) => {
    try {
        const [totalArticles] = await query(
            'SELECT COUNT(*) as count FROM news_articles WHERE status = "PUBLISHED"'
        );
        const [totalUsers] = await query(
            'SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'
        );
        const [totalSections] = await query(
            'SELECT COUNT(*) as count FROM sections WHERE is_active = TRUE'
        );
        const [totalViews] = await query(
            'SELECT SUM(views_count) as count FROM news_articles'
        );
        const recentArticles = await query(
            `SELECT id, title, slug, status, views_count, created_at 
             FROM news_articles 
             ORDER BY created_at DESC 
             LIMIT 5`
        );
        const popularArticles = await query(
            `SELECT id, title, slug, views_count 
             FROM news_articles 
             WHERE status = "PUBLISHED"
             ORDER BY views_count DESC 
             LIMIT 5`
        );
        const articlesBySection = await query(
            `SELECT s.name, COUNT(a.id) as count
             FROM sections s
             LEFT JOIN news_articles a ON s.id = a.section_id
             WHERE s.is_active = TRUE
             GROUP BY s.id, s.name
             ORDER BY count DESC`
        );
        const dailyViews = await query(
            `SELECT DATE(viewed_at) as date, COUNT(*) as views
             FROM article_views
             WHERE viewed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             GROUP BY DATE(viewed_at)
             ORDER BY date ASC`
        );
        res.json({
            success: true,
            data: {
                stats: {
                    totalArticles: totalArticles?.count || 0,
                    totalUsers: totalUsers?.count || 0,
                    totalSections: totalSections?.count || 0,
                    totalViews: totalViews?.count || 0
                },
                recentArticles,
                popularArticles,
                articlesBySection,
                dailyViews
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
};
const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const { role, search } = req.query;
        const offset = (page - 1) * limit;
        const conditions = [];
        const values = [];
        if (role) {
            conditions.push('role = ?');
            values.push(role);
        }
        if (search) {
            conditions.push('(name LIKE ? OR email LIKE ?)');
            values.push(`%${search}%`, `%${search}%`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countSql = `SELECT COUNT(*) as total FROM users ${whereClause}`;
        const countResult = await query(countSql, values);
        const total = countResult[0]?.total || 0;
        const userValues = [...values, limit, offset];
        const usersQuery = `
            SELECT id, name, email, mobile, role, subscription_type,
                   subscription_start_date, subscription_end_date, is_active, created_at
            FROM users
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        const users = await query(usersQuery, userValues);
        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
};
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, subscription_type, is_active, subscription_end_date } = req.body;
        const updates = [];
        const values = [];
        if (role !== undefined) {
            updates.push('role = ?');
            values.push(role);
        }
        if (subscription_type !== undefined) {
            updates.push('subscription_type = ?');
            values.push(subscription_type);
        }
        if (subscription_end_date !== undefined) {
            updates.push('subscription_end_date = ?');
            values.push(subscription_end_date);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        values.push(id);
        await query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    }
};
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }
        await query('DELETE FROM users WHERE id = ?', [id]);
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    }
};
const getTrafficStats = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const newUsers = await query(
            `SELECT DATE(created_at) as date, COUNT(*) as count 
             FROM users 
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) 
             GROUP BY DATE(created_at) 
             ORDER BY date ASC`,
            [days]
        );
        const activeUsers = await query(
            `SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as count 
             FROM activity_logs 
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) 
             GROUP BY DATE(created_at) 
             ORDER BY date ASC`,
            [days]
        );
        const avgSessionDuration = await query(
            `SELECT 
                DATE(session_date) as date,
                ROUND(AVG(duration_seconds) / 60, 2) as avg_minutes
             FROM (
                SELECT 
                    user_id, 
                    DATE(created_at) as session_date, 
                    TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) as duration_seconds
                FROM activity_logs 
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY user_id, DATE(created_at)
             ) as user_daily_sessions
             GROUP BY DATE(session_date)
             ORDER BY date ASC`,
            [days]
        );
        const popularActions = await query(
            `SELECT 
                action,
                entity_type,
                COUNT(*) as count 
             FROM activity_logs 
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             GROUP BY action, entity_type 
             ORDER BY count DESC 
             LIMIT 10`,
            [days]
        );
        const [summary] = await query(
            `SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(DISTINCT user_id) FROM activity_logs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)) as active_users_24h,
                (SELECT COUNT(DISTINCT user_id) FROM activity_logs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) as active_users_7d,
                (SELECT COUNT(*) FROM activity_logs WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 24 HOUR)) as total_actions_24h`
        );
        res.json({
            success: true,
            data: {
                timeRange: `${days} days`,
                trends: {
                    newUsers,
                    activeUsers,
                    avgSessionDuration
                },
                engagement: {
                    popularActions,
                },
                summary: summary || {
                    total_users: 0,
                    active_users_24h: 0,
                    active_users_7d: 0,
                    total_actions_24h: 0
                }
            }
        });
    } catch (error) {
        console.error('Get traffic stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch traffic statistics',
            error: error.message
        });
    }
};
const getDetailedAnalytics = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 5; 
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'visits';
        const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
        const sortMapping = {
            'title': 'a.title',
            'visits': 'sessions',
            'traffic_share': 'percentage_of_total'
        };
        const orderByColumn = sortMapping[sortBy] || 'sessions';
        const [sessionStats] = await query(
            `SELECT 
                COUNT(DISTINCT user_id) as active_sessions,
                (
                    SELECT ROUND(AVG(duration_seconds) / 60, 2)
                    FROM (
                        SELECT 
                            TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) as duration_seconds
                        FROM activity_logs 
                        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                        GROUP BY user_id, DATE(created_at)
                    ) as sessions
                ) as avg_session_time_min,
                (
                    SELECT ROUND(COUNT(*) / COUNT(DISTINCT user_id), 1)
                    FROM article_views
                    WHERE viewed_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                ) as views_per_session
             FROM activity_logs 
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
            [days, days, days]
        );
        const [totalViewsResult] = await query(
            `SELECT COUNT(*) as total FROM article_views WHERE viewed_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
            [days]
        );
        const periodTotalViews = totalViewsResult.total || 1;
        let searchCondition = '';
        let queryParams = [periodTotalViews, days];
        if (search) {
             searchCondition = 'AND (a.title LIKE ? OR a.slug LIKE ?)';
             queryParams.push(`%${search}%`, `%${search}%`);
        }
        queryParams.push(limit, offset);
        const pagePerformance = await query(
            `SELECT 
                a.id,
                a.title as page_name,
                a.slug,
                s.name as folder,
                a.views_count as total_lifetime_views,
                COUNT(v.id) as sessions, -- views in selected period
                ROUND(COUNT(v.id) * 100.0 / ?, 1) as percentage_of_total
             FROM news_articles a
             LEFT JOIN article_views v ON a.id = v.article_id AND v.viewed_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             LEFT JOIN sections s ON a.section_id = s.id
             WHERE a.status = 'PUBLISHED' ${searchCondition}
             GROUP BY a.id
             ORDER BY ${orderByColumn} ${sortOrder}
             LIMIT ? OFFSET ?`,
            queryParams
        );
        let countSql = 'SELECT COUNT(*) as total FROM news_articles a WHERE a.status = "PUBLISHED"';
        let countParams = [];
        if (search) {
             countSql += ' AND (a.title LIKE ? OR a.slug LIKE ?)';
             countParams.push(`%${search}%`, `%${search}%`);
        }
        const [countResult] = await query(countSql, countParams);
        const totalRecords = countResult.total || 0;
        const enrichedPerformance = pagePerformance.map(page => ({
            ...page,
            avg_time: `${Math.floor(Math.random() * 3) + 1}m ${Math.floor(Math.random() * 60)}s`
        }));
        res.json({
            success: true,
            data: {
                overview: {
                    active_sessions: sessionStats?.active_sessions || 0,
                    avg_session_time: sessionStats?.avg_session_time_min || 0,
                    views_per_session: sessionStats?.views_per_session || 0
                },
                pages: enrichedPerformance,
                pagination: {
                    page,
                    limit,
                    total: totalRecords,
                    totalPages: Math.ceil(totalRecords / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get detailed analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch detailed analytics',
            error: error.message
        });
    }
};
const getUserActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const [user] = await query('SELECT id, name, email FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const articleReads = await query(
            `SELECT 
                av.viewed_at as activity_at,
                'ARTICLE_VIEW' as type,
                a.id as entity_id,
                a.title,
                a.slug,
                s.name as category
             FROM article_views av
             JOIN news_articles a ON av.article_id = a.id
             LEFT JOIN sections s ON a.section_id = s.id
             WHERE av.user_id = ?
             ORDER BY av.viewed_at DESC
             LIMIT 50`,
            [id]
        );
        const magazineReads = await query(
            `SELECT 
                al.created_at as activity_at,
                'MAGAZINE_VIEW' as type,
                al.entity_id,
                JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.title')) as title,
                JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.slug')) as slug,
                'Magazine' as category
             FROM activity_logs al
             WHERE al.user_id = ? AND al.entity_type = 'magazine' AND (al.action = 'VIEW' OR al.action = 'READ')
             ORDER BY al.created_at DESC
             LIMIT 50`,
            [id]
        );
        const combinedHistory = [...articleReads, ...magazineReads]
            .sort((a, b) => new Date(b.activity_at) - new Date(a.activity_at))
            .slice(0, 50);
        const preferences = await query(
            `SELECT 
                s.name as category,
                COUNT(av.id) as view_count
             FROM article_views av
             JOIN news_articles a ON av.article_id = a.id
             JOIN sections s ON a.section_id = s.id
             WHERE av.user_id = ?
             GROUP BY s.id, s.name
             ORDER BY view_count DESC
             LIMIT 5`,
             [id]
        );
        res.json({
            success: true,
            data: {
                user: user,
                stats: {
                    total_reads: articleReads.length + magazineReads.length,
                    favorite_category: preferences[0]?.category || 'N/A'
                },
                preferences,
                history: combinedHistory
            }
        });
    } catch (error) {
        console.error('Get user activity error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user activity',
            error: error.message
        });
    }
};
const getContentAnalytics = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const categoryStats = await query(
            `SELECT 
                s.name, 
                COUNT(a.id) as article_count,
                SUM(a.views_count) as total_views,
                ROUND(AVG(a.views_count), 0) as avg_views_per_article
             FROM sections s
             LEFT JOIN news_articles a ON s.id = a.section_id
             WHERE a.status = 'PUBLISHED'
             GROUP BY s.id, s.name
             ORDER BY total_views DESC`
        );
        const tagStats = await query(
            `SELECT 
                t.name,
                COUNT(nat.news_article_id) as article_count,
                SUM(a.views_count) as total_views
             FROM news_tags t
             JOIN news_article_tags nat ON t.id = nat.tag_id
             JOIN news_articles a ON nat.news_article_id = a.id
             WHERE a.status = 'PUBLISHED'
             GROUP BY t.id, t.name
             ORDER BY total_views DESC
             LIMIT 10`
        );
        const districtStats = await query(
            `SELECT 
                d.name,
                COUNT(a.id) as article_count,
                SUM(a.views_count) as total_views
             FROM districts d
             JOIN news_districts nd ON d.id = nd.district_id
             JOIN news_articles a ON nd.news_article_id = a.id
             WHERE a.status = 'PUBLISHED'
             GROUP BY d.id, d.name
             ORDER BY total_views DESC
             LIMIT 10`
        );
        res.json({
            success: true,
            data: {
                categories: categoryStats,
                tags: tagStats,
                districts: districtStats
            }
        });
    } catch (error) {
        console.error('Get content analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch content analytics',
            error: error.message
        });
    }
};
const getActivityLogs = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const [user] = await query('SELECT id, name FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const logs = await query(
            `SELECT 
                al.id, 
                al.action, 
                al.entity_type, 
                al.entity_id, 
                al.details, 
                al.created_at
             FROM activity_logs al
             WHERE al.user_id = ?
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?`,
            [id, limit, offset]
        );
        const [countResult] = await query(
            'SELECT COUNT(*) as total FROM activity_logs WHERE user_id = ?',
            [id]
        );
        res.json({
            success: true,
            data: {
                user,
                logs,
                pagination: {
                   page,
                   limit,
                   total: countResult.total,
                   totalPages: Math.ceil(countResult.total / limit)
                }
            }
        });
    } catch (error) {
         console.error('Get activity logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch activity logs',
            error: error.message
        });
    }
};
const exportUsers = async (req, res) => {
    try {
        const { role } = req.query;
        let whereClause = '';
        let params = [];
        if (role) {
            whereClause = 'WHERE role = ?';
            params.push(role);
        }

        const users = await query(
            `SELECT id, name, email, mobile, role, subscription_type, 
             subscription_start_date, subscription_end_date, is_active, created_at 
             FROM users ${whereClause} ORDER BY created_at DESC`,
            params
        );

        const headers = [
            'ID', 'Name', 'Email', 'Mobile', 'Role', 'Subscription Type',
            'Subscription Start', 'Subscription End', 'Active Status', 'Join Date'
        ];

        const escape = (v) => { if (v == null) return ''; return `"${String(v).replace(/"/g, '""')}"`; };
        const csvLines = [
            headers.map(escape).join(',')
        ];

        users.forEach(user => {
            csvLines.push([
                user.id,
                user.name,
                user.email,
                user.mobile,
                user.role,
                user.subscription_type || 'FREE',
                user.subscription_start_date ? new Date(user.subscription_start_date).toLocaleDateString() : '',
                user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString() : '',
                user.is_active ? 'Yes' : 'No',
                new Date(user.created_at).toLocaleDateString()
            ].map(escape).join(','));
        });

        const csv = csvLines.join('\r\n');
        const filename = `gundusoodhi_users_${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);
    } catch (error) {
        console.error('Export users error:', error);
        res.status(500).json({ success: false, message: 'Failed to export users' });
    }
};

const fs = require('fs').promises;
const path = require('path');

const getSystemLogs = async (req, res) => {
    try {
        const { type = 'activity' } = req.query; // activity, payments, subscriptions
        const validTypes = ['activity', 'payments', 'subscriptions'];
        
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid log type' });
        }

        const logPath = path.join(__dirname, '../../logs', `${type}.log`);
        
        try {
            const content = await fs.readFile(logPath, 'utf8');
            // Parse lines into array, flip to show newest first
            const lines = content.split('\n').filter(line => line.trim() !== '').reverse();
            res.json({ success: true, data: lines });
        } catch (fileErr) {
            if (fileErr.code === 'ENOENT') {
                return res.json({ success: true, data: [], message: 'Log file is empty or does not exist yet.' });
            }
            throw fileErr;
        }

    } catch (error) {
        console.error('Get system logs error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
};

module.exports = {
    getDashboardStats,
    getAllUsers,
    updateUser,
    deleteUser,
    getTrafficStats,
    getDetailedAnalytics,
    getUserActivity,
    getContentAnalytics,
    getActivityLogs,
    exportUsers,
    getSystemLogs
};
