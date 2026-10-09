import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = "https://github.com/jenzylove/shunt";

export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const manifest = await readFile(path.join(process.cwd(), "docs", "DATA_MANIFEST.json"));
  const calibration = JSON.parse(
    await readFile(path.join(process.cwd(), "public", "data", "calibration.json"), "utf8"),
  ) as { asOf?: string };
  return Response.json(
    {
      project: "shunt",
      commit,
      commitShort: commit ? commit.slice(0, 7) : null,
      repo: REPO,
      tree: commit ? `${REPO}/tree/${commit}` : null,
      dataManifestSha256: createHash("sha256").update(manifest).digest("hex"),
      calibrationAsOf: calibration.asOf ?? null,
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
