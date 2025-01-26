import { Command } from "commander"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { compileYAML } from "./compile"
import { explain } from "./explain"
import type { Language } from "./generate/common"
import { genPostgresKotlinVertx } from "./generate/kotlin-vertx-pg"
import { genSQLiteTypescript } from "./generate/typescript-sqlite"

async function* yamlNames(dir: string): AsyncGenerator<string> {
  const files = await fs.readdir(dir, { recursive: true })
  for (const name of files) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue

    yield name
  }
}

const program = new Command("responsiblesql")

program
  .command("generate")
  .requiredOption(
    "-d, --dir",
    "Directory with queries .yaml files",
    "/Users/adelnizamutdinov/Projects/formbox/back2/src/app/db/queries/",
  )
  .requiredOption(
    "-l, --language",
    "Typescript or Kotlin",
    "typescript" satisfies Language,
  )
  .action(async ({ dir, language }: { dir: string; language: Language }) => {
    for await (const filename of yamlNames(dir)) {
      const { filePath, yaml } = await xxx(dir, filename)
      const compiled = compileYAML(filePath, yaml)
      switch (true) {
        case compiled.dialect === "sqlite" && language === "typescript":
          console.log(genSQLiteTypescript(compiled))
          break

        case compiled.dialect === "postgres" && language === "kotlin-vertx":
          console.log(genPostgresKotlinVertx(compiled))
          break

        default:
          throw new Error(
            `Generating ${language} for ${compiled.dialect} isn't supported yet`,
          )
      }
    }
  })

async function xxx(
  dir: string,
  filename: string,
): Promise<{ filePath: string; yaml: string }> {
  const filePath = path.join(dir, filename)
  const yaml = await fs.readFile(filePath, "utf-8")
  return { filePath, yaml }
}

async function explainAll(dir: string, database: string): Promise<void> {
  for await (const filename of yamlNames(dir)) {
    const { filePath, yaml } = await xxx(dir, filename)
    const out = compileYAML(filePath, yaml)
    await explain(out, database)
  }
}

program
  .command("explain")
  .requiredOption(
    "--database",
    "path to SQLite database",
    "/Users/adelnizamutdinov/projects/formbox/back2/db/db.sqlite3",
  )
  .requiredOption(
    "-d, --dir",
    "Directory with queries .yaml files",
    "/Users/adelnizamutdinov/Projects/formbox/back2/src/app/db/queries/",
  )
  .option("-w, --watch", "Watch for changes")
  .action(
    async ({
      database,
      dir,
      watch,
    }: {
      database: string
      dir: string
      watch?: boolean
    }) => {
      if (watch) {
        await explainAll(dir, database)

        console.log(`Watching ${dir}`)
        for await (const { filename, eventType } of fs.watch(dir, {
          recursive: true,
        })) {
          if (!filename?.endsWith(".yaml") && !filename?.endsWith(".yml")) {
            continue
          }
          const { filePath, yaml } = await xxx(dir, filename)
          console.log(eventType, filePath)
          const out = compileYAML(filePath, yaml)
          await explain(out, database)
        }
      } else {
        await explainAll(dir, database)
      }
    },
  )

await program.parseAsync()
