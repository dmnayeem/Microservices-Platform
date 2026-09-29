import "server-only";
import { getSetting } from "@/lib/system-settings";
import {
  DAILY_REWARD_KEY,
  SOLO_REWARD_KEY,
  DAILY_REWARD_DEFAULTS,
  SOLO_REWARD_DEFAULTS,
  normaliseDailyRewardConfig,
  normaliseSoloRewardConfig,
  type DailyRewardConfig,
  type SoloRewardConfig,
} from "@/lib/reward-config";

/** The daily reward ladder. No row / bad row / DB blip → the built-in ladder. */
export async function getDailyRewardConfig(): Promise<DailyRewardConfig> {
  try {
    return normaliseDailyRewardConfig(await getSetting<unknown>(DAILY_REWARD_KEY, null));
  } catch {
    return DAILY_REWARD_DEFAULTS;
  }
}

/** The solo reward and what unlocks it. Falls back to the built-in figures. */
export async function getSoloRewardConfig(): Promise<SoloRewardConfig> {
  try {
    return normaliseSoloRewardConfig(await getSetting<unknown>(SOLO_REWARD_KEY, null));
  } catch {
    return SOLO_REWARD_DEFAULTS;
  }
}
