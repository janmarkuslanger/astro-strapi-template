// Sets one version on every platform package and on every internal
// dependency that points at one — the packages are released in lockstep, so
// a site upgrades by changing a single number.
//
//   node scripts/set-version.mjs 0.2.0
import fs from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error("Usage: node scripts/set-version.mjs <semver>");
  process.exit(1);
}

const PLATFORM = ["packages/core", "packages/cms-strapi", "packages/astro", "packages/strapi-kit"];
const names = new Set(
  PLATFORM.map((dir) => JSON.parse(fs.readFileSync(`${dir}/package.json`, "utf8")).name)
);

for (const dir of [...PLATFORM, "apps/web", "apps/cms"]) {
  const file = `${dir}/package.json`;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (PLATFORM.includes(dir)) pkg.version = version;
  for (const deps of [pkg.dependencies, pkg.peerDependencies]) {
    for (const name of Object.keys(deps ?? {})) if (names.has(name)) deps[name] = version;
  }
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(PLATFORM.includes(dir) ? `${file}: ${version}` : `${file}: dependencies → ${version}`);
}
