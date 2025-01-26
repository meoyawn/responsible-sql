import {
  type CompiledYAML,
  type Fields,
  type OutputQuery,
  type Params,
  resultTypeName,
  type TypeName,
} from "../compile"
import { isObject } from "../lib"

function tsName(t: TypeName): TypeName {
  switch (t) {
    case "REAL":
    case "real":
    case "int64":
    case "i64":
    case "INTEGER":
    case "INT64":
      return "number"

    case "text":
    case "TEXT":
      return "string"

    default:
      return t
  }
}

const argsType = (p: Params): string =>
  isObject(p)
    ? `{${Object.entries(p)
        .map(([k, v]) => `${k}: ${tsName(v)}`)
        .join(", ")}}`
    : `[${p.map(tsName).join(", ")}]`

/** TODO optional => nullable */
const printType = ([name, fields]: readonly [string, Fields]): string =>
  `
export type ${name} = {
  ${Object.entries(fields)
    .map(([k, v]) => `${k}: ${tsName(v)}`)
    .join(",\n  ")}
}
`

function resultType({ name, result }: OutputQuery): TypeName {
  switch (true) {
    case !result:
      return "void"

    case typeof result === "string":
      return result

    case isObject(result):
      return resultTypeName(name)

    default: {
      if (result.length > 1) {
        throw new Error(
          `${name}: can't have multiple positional results. Either use an object or a single item to extract a column`,
        )
      }
      return result.length ? result[0] : "void"
    }
  }
}

function returnType(q: OutputQuery): string {
  switch (q.type) {
    case "many":
      return `readonly ${resultType(q)}[]`

    case "one":
      return `${resultType(q)} | null`

    case "exec":
      return "void"
  }
}

const statementMethod = (q: OutputQuery["type"]): string => {
  switch (q) {
    case "exec":
      return "run"

    case "one":
      return "get"

    case "many":
      return "all"
  }
}

const maybeFirstCol = (q: OutputQuery, s: string): string =>
  Array.isArray(q.result) && q.result.length === 1
    ? `firstCol(\n    ${s}\n  )`
    : s

const printFunction = (q: OutputQuery): string => `
export const ${q.name} = (
  conn: SQLiteConn,
  args: ${argsType(q.params)},
): ${returnType(q)} => 
  ${maybeFirstCol(
    q,
    `conn
    .prepareCached<${resultType(q)}, typeof args>(
\`
${q.sql}
\`,
    )
    .${statementMethod(q.type)}(args)`,
  )}
`

export const genSQLiteTypescript = ({ queries, types }: CompiledYAML): string =>
  `
${Object.entries(types).map(printType).join("\n")}
${queries.map(printFunction).join("\n")}
`
