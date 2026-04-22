const cron = require('node-cron');
const { query } = require('../config/database');
const { notifyAdmin, notifyUser } = require('../services/notificationService');
const { subscriptionLogger } = require('../utils/logger');

// Daily at midnight process subscriptions
const startCronJobs = () => {
    cron.schedule('0 0 * * *', async () => {
        subscriptionLogger.info('Cron Job Started: Checking expiring subscriptions.');
        try {
            await handleExpiredSubscriptions();
            await checkExpiringSubscriptions(7); // 1 week
            await checkExpiringSubscriptions(3); // 3 days
            await checkExpiringSubscriptions(1); // tomorrow
        } catch (error) {
            subscriptionLogger.error('Cron Job failed: ' + error.message);
        }
    });
};

const handleExpiredSubscriptions = async () => {
    try {
        const expiredUsers = await query(
            `SELECT id, name, email FROM users 
             WHERE subscription_type != 'FREE' 
             AND subscription_end_date <= NOW()`
        );

        for (const user of expiredUsers) {
            // Update to FREE
            await query(
                `UPDATE users SET subscription_type = 'FREE' WHERE id = ?`,
                [user.id]
            );

            // Deactivate magazine subscriptions
            await query(
                `UPDATE magazine_subscriptions SET is_active = 0 WHERE user_id = ? AND is_active = 1`,
                [user.id]
            );

            subscriptionLogger.info(`Subscription expired for user ${user.id} (${user.email}). Reverted to FREE plan.`);

            // Notify User
            await notifyUser(user.id, 'Subscription Expired', 'Your magazine subscription has expired. Please renew to continue reading premium updates.');
            
            // Notify Admin
            await notifyAdmin('User Subscription Expired', `User ${user.name} (${user.email}) subscription has just expired.`);
        }
        
        if(expiredUsers.length > 0) {
             subscriptionLogger.info(`Processed ${expiredUsers.length} expired subscriptions today.`);
        }
    } catch (err) {
        subscriptionLogger.error('Error handling expired subscriptions: ' + err.message);
    }
};

const checkExpiringSubscriptions = async (daysLeft) => {
    try {
        // Find users expiring exactly 'daysLeft' from now
        const expiringUsers = await query(
            `SELECT id, name, email, DATE(subscription_end_date) as exp_date 
             FROM users 
             WHERE subscription_type != 'FREE' 
             AND DATE(subscription_end_date) = DATE(DATE_ADD(NOW(), INTERVAL ? DAY))`,
            [daysLeft]
        );

        for (const user of expiringUsers) {
            const timeWord = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
            
            // Notify user
            await notifyUser(user.id, `Subscription Expiring ${timeWord}`, `Your premium subscription is expiring on ${user.exp_date}. Renew soon to avoid interruption!`);
            
            // Notify admin
            await notifyAdmin('Subscription Expiring Soon', `User ${user.name} (${user.email}) subscription will expire ${timeWord} (${user.exp_date}).`);
            
            subscriptionLogger.info(`Expiration warning (${timeWord}) sent to user ID ${user.id}`);
        }
    } catch (err) {
        subscriptionLogger.error(`Error checking expiring subscriptions (${daysLeft} days): ` + err.message);
    }
};

module.exports = { startCronJobs };
