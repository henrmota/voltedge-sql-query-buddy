'use server';

import { createDatabaseSchemaRags } from "../lib/mysql";
import { getUserPreferences, saveUserPreferences } from "../lib/redis";
import { ensureUseId } from "./utils";
import { Preferences } from "@/types";

export async function handleGetUserInfo() { 
  const userId = await ensureUseId();

  const preferences = await getUserPreferences(userId);

  return { userId, preferences };
}

export async function handleSaveUserPreferences(preferences: Partial<Preferences>) {
  const userId = await ensureUseId();

  await saveUserPreferences(userId, preferences);

  const [newPreferences] = await Promise.all([
    getUserPreferences(userId),
    preferences.key ? createDatabaseSchemaRags({ openAIApiKey: preferences.key }) : null
  ]);

  return newPreferences;
}
