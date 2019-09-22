import { readFileSync } from "fs";

const config_file = JSON.parse(readFileSync(__dirname + "/../settings.json", "utf-8"));

export const VERSION = "1.0.0-rc2";
export const SECRET_PUBLIC_KEY = readFileSync(__dirname + "/../" + config_file.signin_public_key_file, "utf-8");
export const SECRET_PRIVATE_KEY = readFileSync(__dirname + "/../" + config_file.signin_private_key_file, "utf-8");
export const SECRET_PASSPHRASE = readFileSync(__dirname + "/../" + config_file.signin_passphrase_key_file, "utf-8");
export const MAX_TASK_PER_USER = 3;
export const MAX_TASK_PER_USER_SPECIAL = 10;
