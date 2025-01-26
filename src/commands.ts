import { Command } from "commander"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { compileYAML } from "./compile"
import { explain } from "./explain"
import type { Language } from "./generate/common"
import { generateTS } from "./generate/typescript-sqlite"

async function* yamls(dir: string): AsyncGenerator<{
  name: string
  yaml: string
  filePath: string
}> {
  const files = await fs.readdir(dir, { recursive: true })
  for (const name of files) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue

    const filePath = path.join(dir, name)
    const yaml = await fs.readFile(filePath, "utf-8")
    yield { name, yaml, filePath }
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
  .action(async ({ dir }: { dir: string; language: Language }) => {
    for await (const { name, yaml, filePath } of yamls(dir)) {
      const out = compileYAML(filePath, yaml)
      console.log(generateTS(out))
    }
  })

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
  .action(
    async ({
      database,
      dir,
    }: {
      queries: string
      database: string
      dir: string
    }) => {
      for await (const { yaml, filePath } of yamls(dir)) {
        const out = compileYAML(filePath, yaml)
        await explain(out, database)
      }
    },
  )

await program.parseAsync()
