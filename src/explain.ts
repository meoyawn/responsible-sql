import type { CompiledYAML } from "./compile"
import { cli } from "./lib"

/** https://www.sqlite.org/eqp.html */
const RED_FLAGS = [
  /TEMP B-TREE/,
  /CORRELATED/,
  /SCAN\b(?! CONSTANT\b)/,
  /MATERIALIZE/,
  /CO-ROUTINE/,
] as const

export async function explain(
  out: CompiledYAML,
  database: string,
): Promise<void> {
  for (const { sql } of out.queries) {
    const explained = await cli([
      "sqlite3",
      database,
      `EXPLAIN QUERY PLAN ${sql}`,
    ])

    for (const redFlag of RED_FLAGS) {
      if (redFlag.test(explained)) {
        console.warn(sql, explained)
      }
    }
  }
}
