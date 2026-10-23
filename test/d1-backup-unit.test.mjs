import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const opsDir = path.join(root, "ops");
const clone = "%h/workspaces/products/seo-fix-kit";
const serviceFile = "seofixkit-d1-backup.service";
const timerFile = "seofixkit-d1-backup.timer";

const knownKeys = {
  Unit: ["Description", "Documentation", "After", "Wants", "OnFailure"],
  Service: [
    "Type",
    "WorkingDirectory",
    "EnvironmentFile",
    "Environment",
    "ExecStart",
    "TimeoutStartSec",
    "Nice",
    "MemoryMax",
    "UMask"
  ],
  Timer: ["OnCalendar", "Persistent", "RandomizedDelaySec", "AccuracySec", "Unit"],
  Install: ["WantedBy", "RequiredBy"]
};

function readUnit(file) {
  const text = fs.readFileSync(path.join(opsDir, file), "utf8");
  const sections = new Map();
  let current = null;
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    const where = `${file}:${index + 1}`;
    if (line === "" || line.startsWith("#")) {
      return;
    }
    const header = /^\[([A-Za-z]+)\]$/.exec(line);
    if (header) {
      assert.ok(!sections.has(header[1]), `${where}: [${header[1]}] appears twice`);
      current = new Map();
      sections.set(header[1], current);
      return;
    }
    assert.ok(current !== null, `${where}: ${line} sits outside a section`);
    const separator = line.indexOf("=");
    assert.ok(separator > 0, `${where}: ${line} is not key=value`);
    const key = line.slice(0, separator);
    assert.ok(!key.startsWith("-"), `${where}: ${key} starts with -, so systemd reads no such key`);
    const values = current.get(key) ?? [];
    values.push(line.slice(separator + 1));
    current.set(key, values);
  });
  return sections;
}

function only(sections, section, key) {
  const values = sections.get(section)?.get(key) ?? [];
  assert.equal(values.length, 1, `${section}.${key} is set once`);
  return values[0];
}

function some(sections, section, key) {
  return sections.get(section)?.get(key) ?? [];
}

function keysAreKnown(sections, file) {
  for (const [section, directives] of sections) {
    assert.ok(Object.hasOwn(knownKeys, section), `${file}: [${section}] is a section systemd knows`);
    for (const key of directives.keys()) {
      assert.ok(
        knownKeys[section].includes(key),
        `${file}: ${section}.${key} is a directive systemd knows; a typo here is skipped with a warning and exit 0`
      );
    }
  }
}

test("the service runs the backup script that sits next to it", () => {
  const sections = readUnit(serviceFile);
  keysAreKnown(sections, serviceFile);
  assert.deepEqual([...sections.keys()], ["Unit", "Service"]);
  assert.equal(only(sections, "Service", "Type"), "oneshot");
  const exec = only(sections, "Service", "ExecStart").split(" ");
  assert.equal(exec.length, 2, "ExecStart is the interpreter and the script, with no inline shell");
  assert.equal(exec[0], "/usr/bin/bash");
  assert.ok(exec[1].startsWith(`${clone}/`), "ExecStart points inside the seo-fix-kit clone");
  const script = exec[1].slice(clone.length + 1);
  assert.equal(script, "ops/backup-d1.sh");
  assert.ok(
    fs.existsSync(path.join(root, script)),
    `${script} exists, so a rename cannot leave the unit pointing at nothing`
  );
  assert.equal(only(sections, "Service", "WorkingDirectory"), clone);
});

test("the service bounds the run and fails loudly", () => {
  const sections = readUnit(serviceFile);
  assert.match(only(sections, "Unit", "Description"), /D1 backup/);
  assert.deepEqual(some(sections, "Unit", "After"), ["network-online.target"]);
  assert.deepEqual(some(sections, "Unit", "Wants"), ["network-online.target"]);
  assert.equal(only(sections, "Unit", "OnFailure"), "fleet-unit-failed@%N.service");
  assert.equal(only(sections, "Service", "TimeoutStartSec"), "900");
  assert.equal(only(sections, "Service", "Nice"), "10");
  assert.equal(only(sections, "Service", "MemoryMax"), "2G");
  assert.equal(only(sections, "Service", "UMask"), "0077");
  const environment = some(sections, "Service", "Environment");
  assert.ok(environment.includes("CI=1"));
  assert.ok(environment.includes("npm_config_yes=true"), "npx installs wrangler without a prompt");
  const pathLine = environment.filter((line) => line.startsWith("PATH="));
  assert.equal(pathLine.length, 1);
  assert.ok(pathLine[0].startsWith("PATH=%h/.local/bin:"), "npx resolves from the user bin directory first");
});

test("the token comes from the environment file, never from the unit", () => {
  const sections = readUnit(serviceFile);
  const files = some(sections, "Service", "EnvironmentFile");
  assert.deepEqual(
    files,
    ["%h/.config/cloudflare/seofixkit-backup.env"],
    "a missing token file fails the run instead of a silent fallback"
  );
  for (const line of some(sections, "Service", "Environment")) {
    assert.ok(!/TOKEN|SECRET|KEY=/i.test(line), `${line} belongs in the environment file, where the mode is 0600`);
  }
});

test("the timer runs the service every Sunday at 03:30 UTC", () => {
  const sections = readUnit(timerFile);
  keysAreKnown(sections, timerFile);
  assert.deepEqual([...sections.keys()], ["Unit", "Timer", "Install"]);
  assert.equal(only(sections, "Timer", "OnCalendar"), "Sun *-*-* 03:30:00 UTC");
  assert.equal(only(sections, "Timer", "Persistent"), "true");
  assert.equal(only(sections, "Timer", "RandomizedDelaySec"), "10min");
  assert.deepEqual(some(sections, "Timer", "Unit"), [], "the timer starts the service of the same name");
  assert.deepEqual(some(sections, "Install", "WantedBy"), ["timers.target"]);
  assert.ok(fs.existsSync(path.join(opsDir, serviceFile)), "a timer with no service of the same name runs nothing");
});

test("ops/README.md carries the install line and the off switch", () => {
  const readme = fs.readFileSync(path.join(opsDir, "README.md"), "utf8");
  assert.ok(readme.includes(`install -m0644 ops/${serviceFile} ops/${timerFile} ~/.config/systemd/user/`));
  assert.ok(readme.includes(`systemctl --user enable --now ${timerFile}`));
  assert.ok(readme.includes(`systemctl --user disable --now ${timerFile}`));
});
