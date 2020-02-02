import Winston from 'winston';

/*
* This is the logger module using winston package. Redirecting some logs into the standard output (Console).
* Setting up a log level need to be implemented before uses logs.
* Use the #levelMin variable to set up the minimum log level that will be used in the entire program.
* The default value of the log level is 'INFO'.
* Require this module with: 
*    import win = require('./lib/logger');
*
* Using examples:
* - win.logger.log('CRITICAL', <text>)      - Higher level of logger, critical error
* - win.logger.log('ERROR', <text>)         - Second level of logger, error
* - win.logger.log('WARNING', <text>)       - Third level of logger, warning message
* - win.logger.log('SUCCESS', <text>)       - 4th level of logger, success message
* - win.logger.log('INFO', <text>)          - 5th level of logger, info message
* - win.logger.log('DEBUG', <text>)         - Lower level of logger, debug mode
*/
const myCustomLevels = {
    levels: {
        fatal: 0,
        error: 1,
        warn: 2,
        success: 3,
        info: 4,
        verbose: 5,
        debug: 6,
        silly: 7,
    },
    colors: {
        fatal: 'red',
        error:  'magenta',
        warn: 'yellow',
        success: 'green',
        info:  'cyan',
        verbose: 'grey',
        debug: 'blue',
        silly: 'white'
    }
};
// See winston format API at https://github.com/winstonjs/logform
export const FORMAT_CONSOLE = Winston.format.combine(
    Winston.format.colorize(),
    Winston.format.timestamp(),
    Winston.format.printf(info => `[${info.timestamp.split('T', 2).join(' ').split('Z')[0]}] ${info.level}: ${info.message}`)
);

export const FORMAT_FILE = Winston.format.combine(
    Winston.format.timestamp(),
    Winston.format.printf(info => `[${info.timestamp.split('T', 2).join(' ').split('Z')[0]}] ${info.level}: ${info.message}`)
);

export const logger = Winston.createLogger({
    levels: myCustomLevels.levels,
    transports: [new Winston.transports.Console({ 
        stderrLevels : ['fatal', 'error', 'warn'],
        format: FORMAT_CONSOLE
    })]
});

Winston.addColors(myCustomLevels.colors);

export default logger;
