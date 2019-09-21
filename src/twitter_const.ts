import { readFileSync } from "fs";

const config_file = JSON.parse(readFileSync(__dirname + "/../settings.json", "utf-8"));

export const CONSUMER_KEY = config_file.consumer;
export const CONSUMER_SECRET = config_file.consumer_secret;
export const CALLBACK_URL = config_file.oauth_callback;
