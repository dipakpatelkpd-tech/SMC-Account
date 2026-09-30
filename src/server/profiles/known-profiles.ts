/**
 * The schools THIS PC has opened, and where it last found them.
 *
 * Only a list of paths and names - no books, no keys. It lives in the PC's own
 * data folder, so each PC remembers its own recent locations, the way Tally
 * remembers its recent data paths. The school list a user sees is this merged
 * with the account's schools in the cloud (see ProfileListItemDto).
 */
import path from "node:path";
import { z } from "zod";
import { readJson, writeJsonAtomic } from "./json-file.js";

const knownProfileSchema = z.object({
  profileId: z.string(),
  ownerUserId: z.string(),
  schoolNameGu: z.string(),
  diseCode: z.string(),
  folder: z.string(),
  lastOpenedAt: z.string(),
});
export type KnownProfile = z.infer<typeof knownProfileSchema>;

const fileSchema = z.object({ profiles: z.array(knownProfileSchema) });

export class KnownProfiles {
  private readonly file: string;

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, "known-profiles.json");
  }

  /** This account's schools, most recently opened first. */
  list(ownerUserId: string): KnownProfile[] {
    return this.all()
      .filter((item) => item.ownerUserId === ownerUserId)
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  get(profileId: string): KnownProfile | null {
    return this.all().find((item) => item.profileId === profileId) ?? null;
  }

  remember(profile: KnownProfile): void {
    const rest = this.all().filter((item) => item.profileId !== profile.profileId);
    writeJsonAtomic(this.file, { profiles: [...rest, profile] });
  }

  forget(profileId: string): void {
    writeJsonAtomic(this.file, {
      profiles: this.all().filter((item) => item.profileId !== profileId),
    });
  }

  private all(): KnownProfile[] {
    return readJson(this.file, fileSchema)?.profiles ?? [];
  }
}
