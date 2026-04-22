const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`)
);

const createWinstonLogger = (filename) => {
    return winston.createLogger({
        level: 'info',
        format: logFormat,
        transports: [
            new winston.transports.File({ 
                filename: path.join(__dirname, '../../logs', filename),
                maxsize: 5242880, // 5MB limit per file before rotation
                maxFiles: 5
            })
        ]
    });
};

const paymentsLogger = createWinstonLogger('payments.log');
const subscriptionLogger = createWinstonLogger('subscriptions.log');
const activityLogger = createWinstonLogger('activity.log');

module.exports = {
    paymentsLogger,
    subscriptionLogger,
    activityLogger
};
