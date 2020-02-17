import { readFileSync, writeFileSync } from "fs";
import logger from "./logger";

export const VERSION = "1.5.4";
export const CONFIG_FILE = JSON.parse(readFileSync(__dirname + "/../settings.json", "utf-8"));
export const TweetCounter = new class {
  protected count_file: { deleted: number };
  protected filename = __dirname + "/../misc/deleted_count.json";
  protected timer: NodeJS.Timeout | undefined;

  constructor() {
    try {
      this.count_file = JSON.parse(readFileSync(this.filename, "utf-8"));
    } catch (e) {
      logger.info("Count file does not exists, creating misc/" + this.filename + "...");
      this.count_file = { deleted: 0 };
    }
  }

  inc(of_amount: number = 1) {
    this.count_file.deleted += of_amount;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => this.sync(), 2500);
  }

  get count() {
    return this.count_file.deleted;
  }

  sync() {
    writeFileSync(this.filename, JSON.stringify(this.count_file));

    if (this.timer)
      clearTimeout(this.timer);

    this.timer = undefined;
  }
};

const passphrase_file = __dirname + "/../" + CONFIG_FILE.signin_passphrase_key_file;
let real_passphrase: string = "";
// Try to get passphrase
try {
  real_passphrase = readFileSync(passphrase_file, "utf-8").trimRight();
} catch {}

export const SECRET_PUBLIC_KEY = readFileSync(__dirname + "/../" + CONFIG_FILE.signin_public_key_file, "utf-8");
export const SECRET_PRIVATE_KEY = readFileSync(__dirname + "/../" + CONFIG_FILE.signin_private_key_file, "utf-8");
export const SECRET_PASSPHRASE = real_passphrase;
export const MAX_TASK_PER_USER = 3;
export const MAX_TASK_PER_USER_SPECIAL = 10;
