const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../db");
const { getRuntimeConfig } = require("../config");

const runtimeConfig = getRuntimeConfig();
const localFilename = process.env.DATABASE_FILE || path.join(__dirname, "..", "data", "points.sqlite");
const filenames = [
  localFilename,
  `${localFilename}-shm`,
  `${localFilename}-wal`,
];

for (const filename of filenames) {
  fs.rmSync(filename, { force: true });
}

const store = createDatabase({
  provider: "sqlite",
  filename: localFilename,
  teacherAccounts: runtimeConfig.teacherAccounts,
});

Promise.resolve(store.close()).then(() => {
  console.log(`Banco reiniciado em ${localFilename}`);
});
