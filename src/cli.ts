import { program } from "commander"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { compileYAML } from "./compile"
import { explain } from "./explain"
import { generateTS } from "./generate/typescript"

async function* yamls(dir: string): AsyncGenerator<{
  name: string
  yaml: string
}> {
  const files = await fs.readdir(dir, { recursive: true })
  for (const name of files) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue

    const yaml = await fs.readFile(path.join(dir, name), "utf-8")
    yield { name, yaml }
  }
}

program
  .command("generate")
  .requiredOption(
    "-d, --dir",
    "Directory with queries .yaml files",
    "/Users/adelnizamutdinov/Projects/formbox/back2/src/app/db/queries/",
  )
  .action(async ({ dir }: { dir: string }) => {
    for await (const { name, yaml } of yamls(dir)) {
      const out = compileYAML(yaml)
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
      for await (const { yaml } of yamls(dir)) {
        const out = compileYAML(yaml)
        await explain(out, database)
      }
    },
  )

await program.parseAsync()
