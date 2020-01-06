import logger from "./logger";
import readline from 'readline';
import { TweetCounter } from "./constants";


type CliValidator = (rest: string, regex_matches: RegExpMatchArray | null) => boolean | Promise<boolean>; 
type CliExecutorFunction = (rest: string, regex_matches: RegExpMatchArray | null, validator_state?: boolean) => any;
type CliExecutor = CliExecutorFunction | string | object;


export class CliListener {
    protected listeners: Map<string | RegExp, CliListener> = new Map;

    constructor(
        protected executor: CliExecutor,
        protected validate_before?: CliValidator
    ) { }

    /**
     * Add a new "sub-listener" (a listener that execute if the current `CliListener` is being executed).
     *  
     * Return the newly created listener, which where you can create another sub-listeners.
     * 
     * @param match_on The thing(s) that the new listener should match to.
     * 
     * @param executor The function that should be executed if the new listener is matched, 
     * and any of its sub-listener has matched. If the returned thing is static, you can directly specify it (`string` or `object`).
     * You can return a `Promise`, the CLI instance will wait its finish before giving back the control !
     * 
     * @param validate_before If the new listener (and all its sub-listeners) need to check a constraint, you can specify
     * it here. The function must return a `boolean` or a `Promise<boolean>`.
     * 
     * If the `boolean` is `true`, continue the execution normally (sub-listener then executor if none match).
     * 
     * If the `boolean` is `false`, the executor only will be called with its `validator_state` (third) parameter to `false`.
     */
    addSubListener(match_on: string | RegExp | Array<string | RegExp>, executor: CliExecutor, validate_before?: CliValidator) {
        const new_one = new CliListener(executor, validate_before);

        if (Array.isArray(match_on)) {
            for (const e of match_on) {
                this.listeners.set(e, new_one);
            }
        }
        else {
            this.listeners.set(match_on, new_one);
        }

        return new_one;
    }

    /**
     * Try to match a sub-listener. 
     * If any sub-listener matches, then execute the current executor.
     * 
     * @param rest Rest of the string, after the things that have been matched.
     * @param matches Regular expression matches array. `null` if the thing that have matched is a string.
     */
    async match(rest: string, matches: RegExpMatchArray | null) : Promise<any> {
        let validator_state: boolean | undefined = undefined;

        if (this.validate_before) {
            validator_state = await this.validate_before(rest, matches); 
        }

        if (validator_state !== false) {
            for (const matcher of this.listeners.keys()) {
                if (typeof matcher === 'string') {
                    if (rest.startsWith(matcher)) {
                        return this.listeners.get(matcher)!.match(rest.slice(matcher.length).trimLeft(), null);
                    }
                }
                else {
                    const matches = rest.match(matcher);
    
                    if (matches) {
                        return this.listeners.get(matcher)!.match(rest.replace(matcher, '').trimLeft(), matches);
                    }
                }
            }
        }

        if (typeof this.executor === 'function')
            return this.executor(rest, matches, validator_state);
        return this.executor;
    }
}

export default class CliHelper extends CliListener {
    /**
     * Build a new instance of `CliHelper`. 
     * 
     * Add keywords/patterns you want to catch with `.addSubListener()`.
     * 
     * @param no_match_executor The function that will be called if none of the defined sub-listeners matched.
     * If the returned value is static, you can specify a static `string` or `object`.
     */
    constructor(no_match_executor: CliExecutor) {
        super(no_match_executor);
    }

    /**
     * Starts the listening of `stdin`.
     * 
     * Before that, please define the keywords/patterns 
     * you want to listen to with `.addSubListener()`.
     */
    listen() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '> '
        });

        rl.on('line', async line => {
            if (!line) {
                rl.prompt();
                return;
            }

            let returned: any;
            try {
                returned = await this.match(line.trim(), null);
            } catch (e) {
                if (e instanceof Error) {
                    returned = e;
                }
                else {
                    returned = new Error(e);
                }
            }

            if (typeof returned === 'string') {
                console.log("cli: " + returned);
            }
            else if (returned instanceof Error) {
                logger.warn(`Error encountered in CLI: ${returned.message} (${returned.stack})`);
            }
            else if (typeof returned === 'object') {
                console.log("cli:", returned);
            }

            // Reprompt for user input
            rl.prompt();
        }).on('close', () => {
            console.log('Goodbye.');
            TweetCounter.sync();
            process.exit(0);
        });

        rl.prompt();
    }
}
