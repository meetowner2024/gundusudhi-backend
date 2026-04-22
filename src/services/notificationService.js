const { query } = require('../config/database');

const createNotification = async (userId, type, title, message) => {
    try {
        await query(
            `INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)`,
            [userId, type, title, message]
        );
    } catch (err) {
        console.error('Error creating notification:', err);
    }
};

const notifyAdmin = async (title, message) => {
    await createNotification(null, 'ADMIN', title, message);
};

const notifyUser = async (userId, title, message) => {
    await createNotification(userId, 'USER', title, message);
};

const getUserNotifications = async (userId, limit = 50) => {
    return await query(`SELECT * FROM notifications WHERE user_id = ? AND type = 'USER' ORDER BY created_at DESC LIMIT ?`, [userId, limit]);
};

const getAdminNotifications = async (limit = 50) => {
    return await query(`SELECT * FROM notifications WHERE type = 'ADMIN' ORDER BY created_at DESC LIMIT ?`, [limit]);
};

const markAsRead = async (notificationId) => {
    await query(`UPDATE notifications SET is_read = TRUE WHERE id = ?`, [notificationId]);
};

const markAllAsRead = async (userId, type = 'USER') => {
    if (type === 'ADMIN') {
        await query(`UPDATE notifications SET is_read = TRUE WHERE type = 'ADMIN'`);
    } else {
        await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND type = 'USER'`, [userId]);
    }
};

module.exports = {
    createNotification,
    notifyAdmin,
    notifyUser,
    getUserNotifications,
    getAdminNotifications,
    markAsRead,
    markAllAsRead
};
