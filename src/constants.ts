import { readFileSync } from "fs";

export const CONFIG_FILE = JSON.parse(readFileSync(__dirname + "/../settings.json", "utf-8"));

export const VERSION = "1.2.0-dev";
export const SECRET_PUBLIC_KEY = readFileSync(__dirname + "/../" + CONFIG_FILE.signin_public_key_file, "utf-8");
export const SECRET_PRIVATE_KEY = readFileSync(__dirname + "/../" + CONFIG_FILE.signin_private_key_file, "utf-8");
export const SECRET_PASSPHRASE = readFileSync(__dirname + "/../" + CONFIG_FILE.signin_passphrase_key_file, "utf-8");
export const MAX_TASK_PER_USER = 3;
export const MAX_TASK_PER_USER_SPECIAL = 10;
