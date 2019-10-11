import { readFileSync } from "fs";
import { IS_DEV_MODE } from './index';

const config_file = JSON.parse(readFileSync(__dirname + "/../settings.json", "utf-8"));

export const CONSUMER_KEY = config_file.consumer;
export const CONSUMER_SECRET = config_file.consumer_secret;
export const CALLBACK_URL = () => IS_DEV_MODE ? config_file.oauth_callback_dev : config_file.oauth_callback;
