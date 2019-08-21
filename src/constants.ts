import { readFileSync } from "fs";

export const VERSION = "0.1.0";
export const SECRET_PUBLIC_KEY = readFileSync(__dirname + "/../.ssh/key.pub");
export const SECRET_PRIVATE_KEY = readFileSync(__dirname + "/../.ssh/key");
