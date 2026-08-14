#!/usr/bin/env node
// Compose entries/*.json + marketplace.base.json into dist/marketplace.json,
// validating against schema/marketplace.schema.json. Exits non-zero on any
// problem so CI can gate PRs. `--liveness` additionally checks that each git
// source ref exists and each npm package is published.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("..", import.meta.url).pathname;
const liveness = process.argv.includes("--liveness");
const problems = [];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const base = readJson(join(root, "marketplace.base.json"));

const entryFiles = readdirSync(join(root, "entries"))
  .filter((name) => name.endsWith(".json"))
  .sort();
if (entryFiles.length === 0) problems.push("entries/ contains no entry files");

const seen = new Set();
const plugins = [];
for (const file of entryFiles) {
  const path = join(root, "entries", file);
  let entry;
  try {
    entry = readJson(path);
  } catch (error) {
    problems.push(`${file}: invalid JSON (${error.message})`);
    continue;
  }
  const expectedId = file.replace(/\.json$/, "");
  if (entry.id !== expectedId) {
    problems.push(`${file}: id "${entry.id}" must equal the filename "${expectedId}"`);
  }
  if (seen.has(entry.id)) problems.push(`${file}: duplicate id "${entry.id}"`);
  seen.add(entry.id);
  if (typeof entry.icon === "object" && entry.icon?.url?.startsWith("./")) {
    try {
      readFileSync(join(root, entry.icon.url));
    } catch {
      problems.push(`${file}: relative icon "${entry.icon.url}" does not exist`);
    }
  }
  plugins.push(entry);
}

const manifest = { $schema: "https://getbb.app/schemas/marketplace.schema.json", ...base, plugins };

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(readJson(join(root, "schema", "marketplace.schema.json")));
if (!validate(manifest)) {
  for (const error of validate.errors ?? []) {
    problems.push(`schema: ${error.instancePath || "/"} ${error.message}`);
  }
}

if (liveness) {
  for (const entry of plugins) {
    const source = entry.source ?? {};
    try {
      if (source.git) {
        const { url, ref } = source.git;
        const out = execFileSync("git", ["ls-remote", url, ref, `${ref}^{}`], {
          encoding: "utf8",
          timeout: 30_000,
        });
        const isCommit = /^[0-9a-f]{7,40}$/i.test(ref);
        if (!isCommit && out.trim().length === 0) {
          problems.push(`${entry.id}: git ref "${ref}" not found at ${url}`);
        }
        if (isCommit) {
          // ls-remote cannot list arbitrary commits; verify the repo answers at all.
          execFileSync("git", ["ls-remote", url, "HEAD"], { encoding: "utf8", timeout: 30_000 });
        }
      } else if (source.npm) {
        execFileSync("npm", ["view", source.npm.package, "name"], {
          encoding: "utf8",
          timeout: 30_000,
        });
      }
    } catch (error) {
      problems.push(`${entry.id}: liveness check failed (${error.message.split("\n")[0]})`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`error: ${problem}`);
  process.exit(1);
}

const bytes = JSON.stringify(manifest, null, 2) + "\n";
if (Buffer.byteLength(bytes, "utf8") > 1_048_576) {
  console.error("error: composed manifest exceeds 1 MiB");
  process.exit(1);
}
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "marketplace.json"), bytes);
console.log(`built dist/marketplace.json with ${plugins.length} entries`);
