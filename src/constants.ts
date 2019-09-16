import { readFileSync } from "fs";

const config_file = JSON.parse(readFileSync(__dirname + "/../settings.json", "utf-8"));

export const VERSION = "0.4.0";
export const SECRET_PUBLIC_KEY = readFileSync(__dirname + "/../" + config_file.signin_public_key_file, "utf-8");
export const SECRET_PRIVATE_KEY = readFileSync(__dirname + "/../" + config_file.signin_private_key_file, "utf-8");
export const SECRET_PASSPHRASE = readFileSync(__dirname + "/../" + config_file.signin_passphrase_key_file, "utf-8");
