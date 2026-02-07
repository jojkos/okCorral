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

export const LockActionSchema = ActionTypeSchema;

export const GameConfigSchema = z.object({
  tickDuration: z.number().min(1000).max(10000).default(4000),
  slotsPerSide: z.number().min(2).max(8).default(5),
});

export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type SelectTeamInput = z.infer<typeof SelectTeamSchema>;
export type LockActionInput = z.infer<typeof LockActionSchema>;
export type GameConfigInput = z.infer<typeof GameConfigSchema>;
