/**
 * Synthetic Merchant Database
 *
 * Generates a deterministic, clearly synthetic set of merchant entities:
 *   Users, Transactions, IPLogs, TOSLogs, ConsumptionLogs
 *
 * All data is explicitly synthetic. No real customer information,
 * no real payment credentials, no implication of Razorpay production data.
 *
 * Amounts: always in MAJOR currency units (e.g. amount=4999, currency="INR" = ₹4,999).
 * Timestamps: deterministic ISO-8601 strings; anchor date 2026-08-01T00:00:00Z.
 */

import type {
  User,
  Transaction,
  IPLog,
  TOSLog,
  ConsumptionLog,
} from "../schemas/index.js";
import { createRng } from "./rng.js";

// ---------------------------------------------------------------------------
// Constants — clearly synthetic pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Aarav", "Aditi", "Arjun", "Bhavna", "Charu", "Deepa", "Divya", "Farhan",
  "Gaurav", "Harini", "Ishaan", "Jyoti", "Karan", "Lavanya", "Meera",
  "Nikhil", "Pooja", "Rahul", "Sneha", "Tanvi", "Usha", "Vikram",
  "Yash", "Zara", "Ananya", "Brijesh", "Chetan", "Disha", "Eshan", "Geeta",
] as const;

const LAST_NAMES = [
  "Sharma", "Patel", "Rao", "Kumar", "Singh", "Mehta", "Joshi", "Verma",
  "Reddy", "Nair", "Menon", "Gupta", "Bose", "Das", "Shah", "Iyer",
  "Pillai", "Chopra", "Malhotra", "Dubey", "Tiwari", "Pandey", "Agarwal",
  "Kapoor", "Chaudhary", "Bhatt", "Mishra", "Saxena", "Srivastava", "Khan",
] as const;

// Synthetic email domains — clearly not real providers
const EMAIL_DOMAINS = [
  "synth-mail.test", "demo-inbox.test", "fake-email.test",
  "testuser.invalid", "example.test",
] as const;

const RESOURCES = [
  "digital_course_pdf", "ebook_finance_v2", "software_license_key",
  "online_workshop_recording", "template_pack_pro", "video_series_s1",
  "api_subscription_plan", "design_asset_bundle", "audio_masterclass",
  "data_analytics_kit",
] as const;

const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet"] as const;

// Transaction amounts in major currency units (INR)
const TRANSACTION_AMOUNTS = [
  499, 999, 1499, 1999, 2499, 2999, 3999, 4999, 5999, 7499, 9999, 14999, 19999,
] as const;

const CURRENCIES = ["INR"] as const;

// Synthetic IP ranges — RFC 5737 documentation ranges, not routable
const IP_PREFIXES = [
  "192.0.2", "198.51.100", "203.0.113", "192.168.10", "10.20.30",
] as const;

// ---------------------------------------------------------------------------
// Date helpers — deterministic only
// ---------------------------------------------------------------------------

/** Anchor date: all synthetic events occur after this. */
const ANCHOR_TS = new Date("2026-08-01T00:00:00Z").getTime();
const MS_PER_DAY = 86_400_000;

/**
 * Produce a deterministic ISO-8601 timestamp by offsetting from anchor
 * by (dayOffset * 24h + hourOffset * 1h + minuteOffset * 1min).
 */
function syntheticTimestamp(dayOffset: number, hourOffset = 0, minuteOffset = 0): string {
  return new Date(
    ANCHOR_TS +
      dayOffset * MS_PER_DAY +
      hourOffset * 3_600_000 +
      minuteOffset * 60_000,
  ).toISOString();
}

// ---------------------------------------------------------------------------
// Generator helpers
// ---------------------------------------------------------------------------

function makeIP(rng: ReturnType<typeof createRng>): string {
  const prefix = rng.pick(IP_PREFIXES);
  const last = rng.nextInt(2, 254);
  return `${prefix}.${last}`;
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface SyntheticMerchantDb {
  users: Map<string, User>;
  transactions: Map<string, Transaction>;
  ipLogs: Map<string, IPLog[]>;           // keyed by user_id
  tosLogs: Map<string, TOSLog>;           // keyed by user_id (one TOS record per user)
  consumptionLogs: Map<string, ConsumptionLog[]>; // keyed by transaction_id
}

export interface SyntheticUserBundle {
  user: User;
  transaction: Transaction;
  ipLogs: IPLog[];
  tosLog: TOSLog;
  consumptionLog: ConsumptionLog;
  /** Anchor day used for this bundle (determines all timestamps) */
  anchorDay: number;
  /** Checkout IP (used for consistency checks later) */
  checkoutIp: string;
}

// ---------------------------------------------------------------------------
// Synthetic merchant DB generation
// ---------------------------------------------------------------------------

/**
 * Generate the synthetic merchant database deterministically.
 * userCount defines how many distinct users (and thus transactions) to create.
 * All data is clearly synthetic; no real credentials are used.
 *
 * @param seed - integer seed for deterministic output
 * @param userCount - number of synthetic users to generate
 */
export function generateMerchantDb(
  seed: number,
  userCount: number,
): { db: SyntheticMerchantDb; bundles: SyntheticUserBundle[] } {
  const rng = createRng(seed);

  const db: SyntheticMerchantDb = {
    users: new Map(),
    transactions: new Map(),
    ipLogs: new Map(),
    tosLogs: new Map(),
    consumptionLogs: new Map(),
  };

  const bundles: SyntheticUserBundle[] = [];

  for (let i = 0; i < userCount; i++) {
    const idx = String(i + 1).padStart(3, "0");
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    const domain = rng.pick(EMAIL_DOMAINS);
    const anchorDay = rng.nextInt(1, 60); // 1–60 days after anchor
    const checkoutIp = makeIP(rng);

    // --- User ---
    const user_id = `usr_${idx}`;
    const user: User = {
      user_id,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${idx}@${domain}`,
      created_at: syntheticTimestamp(anchorDay - 1, rng.nextInt(8, 20), 0),
    };

    // --- TOS acceptance: 30–120 min before transaction ---
    const tosMinsBefore = rng.nextInt(30, 120);
    const tosLog: TOSLog = {
      tos_id: `tos_${idx}`,
      user_id,
      tos_version: "v2.1",
      accepted_at: syntheticTimestamp(anchorDay, rng.nextInt(9, 11), -tosMinsBefore),
      ip_address: checkoutIp,
    };

    // --- Transaction: on anchorDay around 10:00–13:00 ---
    const txnHour = rng.nextInt(10, 13);
    const txnMin = rng.nextInt(0, 59);
    const transaction_id = `txn_${idx}`;
    const amount = rng.pick(TRANSACTION_AMOUNTS);
    const transaction: Transaction = {
      transaction_id,
      user_id,
      amount,
      currency: rng.pick(CURRENCIES),
      timestamp: syntheticTimestamp(anchorDay, txnHour, txnMin),
      ip_address: checkoutIp,
      payment_method: rng.pick(PAYMENT_METHODS),
      card_last4: String(rng.nextInt(1000, 9999)),
    };

    // --- IP logs: 1–3 session logs within 2h before transaction ---
    const ipLogCount = rng.nextInt(1, 3);
    const ipLogList: IPLog[] = [];
    for (let j = 0; j < ipLogCount; j++) {
      const minsBeforeTxn = rng.nextInt(5, 119);
      ipLogList.push({
        log_id: `ipl_${idx}_${j + 1}`,
        user_id,
        ip_address: checkoutIp,
        timestamp: syntheticTimestamp(anchorDay, txnHour, txnMin - minsBeforeTxn),
        device_info: `SyntheticBrowser/1.0 SyntheticOS/2.0 (synth; device-${rng.nextInt(100, 999)})`,
      });
    }

    // --- Consumption log: 5–60 min after transaction ---
    const minsAfterTxn = rng.nextInt(5, 60);
    const consumptionLog: ConsumptionLog = {
      consumption_id: `con_${idx}`,
      user_id,
      transaction_id,
      resource_id: rng.pick(RESOURCES),
      consumed_at: syntheticTimestamp(anchorDay, txnHour, txnMin + minsAfterTxn),
      ip_address: checkoutIp,
      bytes_downloaded: rng.nextInt(50_000, 50_000_000),
    };

    // Store in DB
    db.users.set(user_id, user);
    db.transactions.set(transaction_id, transaction);
    db.ipLogs.set(user_id, ipLogList);
    db.tosLogs.set(user_id, tosLog);
    db.consumptionLogs.set(transaction_id, [consumptionLog]);

    bundles.push({
      user,
      transaction,
      ipLogs: ipLogList,
      tosLog,
      consumptionLog,
      anchorDay,
      checkoutIp,
    });
  }

  return { db, bundles };
}
