import Winston from 'winston';

export const logger = Winston.createLogger({
    level: 'warn',
    transports: [
        new Winston.transports.Console({
            format: Winston.format.combine(
                Winston.format.colorize(),
                Winston.format.errors({ stack: true }),
                Winston.format.splat(),
                Winston.format.simple(),
            )
        })
    ]
});

export default logger;