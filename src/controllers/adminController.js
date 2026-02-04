const { query } = require('../config/database');

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
    try {
        // Get total counts
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

        // Get recent articles
        const recentArticles = await query(
            `SELECT id, title, slug, status, views_count, created_at 
             FROM news_articles 
             ORDER BY created_at DESC 
             LIMIT 5`
        );

        // Get popular articles
        const popularArticles = await query(
            `SELECT id, title, slug, views_count 
             FROM news_articles 
             WHERE status = "PUBLISHED"
             ORDER BY views_count DESC 
             LIMIT 5`
        );

        // Get articles by section
        const articlesBySection = await query(
            `SELECT s.name, COUNT(a.id) as count
             FROM sections s
             LEFT JOIN news_articles a ON s.id = a.section_id
             WHERE s.is_active = TRUE
             GROUP BY s.id, s.name
             ORDER BY count DESC`
        );

        // Get daily views for last 7 days
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
                    totalArticles: totalArticles[0].count,
                    totalUsers: totalUsers[0].count,
                    totalSections: totalSections[0].count,
                    totalViews: totalViews[0].count || 0
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

// Get all users (Admin only)
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

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM users ${whereClause}`;
        const countResult = await query(countSql, values);
        const total = countResult[0]?.total || 0;

        // Get users - create a copy of values array for this query
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

// Update user role/status
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, subscription_type, is_active } = req.body;

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

// Delete user
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting yourself
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

module.exports = {
    getDashboardStats,
    getAllUsers,
    updateUser,
    deleteUser
};
