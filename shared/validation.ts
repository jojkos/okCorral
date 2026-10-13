import { z } from "zod";
import { ActionTypeSchema } from "./types.js";

export const JoinRoomSchema = z.object({
  roomCode: z
    .string()
    .length(4)
    .regex(/^[A-Z]+$/),
  playerName: z.string().min(1).max(20),
  playerId: z.string().min(1),
});

export const SelectTeamSchema = z.enum(["sheriffs", "outlaws"]);
export const SelectAppearanceSchema = z.number().int().min(0).max(7);

export const TakeSeatSchema = z.object({
  team: SelectTeamSchema,
  slot: z.number().int().min(0).max(7),
});

export const LockActionSchema = ActionTypeSchema;

export const RandomEventSettingsSchema = z.object({
  strongWind: z.boolean(),
  walkingWoman: z.boolean(),
  gatlingMan: z.boolean(),
  rain: z.boolean(),
}).partial().strict();

export const GameConfigSchema = z.object({
  tickDuration: z.number().min(1000).max(10000).default(4000),
  slotsPerSide: z.number().min(2).max(8).default(5),
  events: RandomEventSettingsSchema.default({}),
});

export const GameConfigPatchSchema = GameConfigSchema.partial().strict();

export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type SelectTeamInput = z.infer<typeof SelectTeamSchema>;
export type LockActionInput = z.infer<typeof LockActionSchema>;
export type GameConfigInput = z.infer<typeof GameConfigSchema>;
