import * as v from "valibot"
import * as yaml from "yaml"
import { renderPostgres } from "./dialects/postgres"
import { renderSQLite } from "./dialects/sqlite"
import { isObject } from "./lib"

type FieldName = `${string}${"?" | ""}`
export type TypeName = string
export type Fields = Readonly<Record<FieldName, TypeName>>

export type Params = ReadonlyArray<TypeName> | Fields
export type Result = TypeName | ReadonlyArray<TypeName> | Fields

type SelectStr =
  | `SELECT ${string}`
  | `select ${string}`
  | `WITH ${string}`
  | `with ${string}`

export type Insert = Readonly<{
  insert: string
  params: Fields
  result?: "${params}" | Fields
}>
type Exec = Readonly<{
  exec: string
  params?: Params
  result?: Result
}>
type One = Readonly<{
  one: SelectStr
  params?: Params
  result: Result
}>
type Many = Readonly<{
  many: SelectStr
  params?: Params
  result: Result
}>
export type Query = Insert | Exec | One | Many

export const isInsert = (q: Query): q is Insert => "insert" in q
export const isExec = (q: Query): q is Exec => "exec" in q
export const isOne = (q: Query): q is One => "one" in q
export const isMany = (q: Query): q is Many => "many" in q

const fieldName = (n: FieldName): string => n.replace("?", "")

const _isOptional = (n: FieldName): n is `${string}?` => n.endsWith("?")

export const fieldNames = (fields: Fields): readonly string[] =>
  Object.keys(fields).map(fieldName)

export const allColumns = (fields: Fields): string =>
  fieldNames(fields).join(", ")

function resultFields(
  declared: Partial<Record<string, Fields>>,
  sql: string,
  result: Result,
): Fields {
  switch (true) {
    case typeof result === "string": {
      const struct = declared[result]
      if (!struct) {
        throw new Error(
          `Not defined: ${result}. Define it by using ${TYPE_TAG}`,
        )
      }
      return struct
    }

    case isObject(result):
      return result

    default:
      throw new Error(
        `Can't infer column names for ${JSON.stringify({ sql, result }, null, 2)}`,
      )
  }
}

export const expandResult = (
  structs: Partial<Record<string, Fields>>,
  sql: string,
  result: Result,
): string =>
  sql.includes("${result}")
    ? sql.replaceAll(
        "${result}",
        allColumns(resultFields(structs, sql, result)),
      )
    : sql

const TYPE_TAG = "!type"
type TaggedType = `${typeof TYPE_TAG}${string}`
const isTaggedType = (s: string): s is TaggedType => s.startsWith(TYPE_TAG)
const tagType = (s: TypeName): TaggedType => `${TYPE_TAG}${s}`
const toTypeName = (s: TaggedType): TypeName => s.slice(TYPE_TAG.length)

const Dialect = v.pipe(
  v.string(),
  v.toLowerCase(),
  v.union([v.literal("sqlite"), v.literal("postgres")]),
)
type Dialect = v.InferOutput<typeof Dialect>

type Version = `${number}${`.${number}${string}` | ""}`

export const Version = v.pipe(
  v.unknown(),
  v.transform(String),
  v.regex(/^\d+(\.\d+)*$/, "Expecting a version string, e.g. 1.0"),
  v.custom<Version>((): true => true),
)

const ResponsibleSQL = v.object({
  version: Version,
  dialect: Dialect,
})

type ParsedYAML = Readonly<
  {
    [k: TaggedType]: Fields
  } & {
    [k: string]: Query
  } & {
    responsibleSQL: v.InferOutput<typeof ResponsibleSQL>
  }
>

function paramTypes(q: Query): Params {
  switch (true) {
    case isInsert(q):
      return q.params

    case isExec(q):
    case isOne(q):
    case isMany(q):
      return q.params ?? []

    default:
      throw new Error(`Invalid query: ${JSON.stringify(q, null, 2)}`)
  }
}

const capitalize = <S extends string>(s: S): Capitalize<S> =>
  (s ? s[0].toUpperCase() + s.slice(1) : s) as Capitalize<S>

export const resultTypeName = (queryName: string): TypeName =>
  `${capitalize(queryName)}Result`

type ExecOneMany = "exec" | "one" | "many"

export type OutputQuery = Readonly<{
  name: string
  type: ExecOneMany
  sql: string
  params: Params
  result?: Result
}>

function queryType(q: Query): ExecOneMany {
  switch (true) {
    case isInsert(q):
      return q.result ? "one" : "exec"

    case isExec(q):
      return "exec"

    case isOne(q):
      return "one"

    case isMany(q):
      return "many"

    default:
      throw new Error(`Invalid query: ${JSON.stringify(q, null, 2)}`)
  }
}

export type CompiledYAML = Readonly<{
  dialect: Dialect
  types: Readonly<Record<TypeName, Fields>>
  queries: ReadonlyArray<OutputQuery>
}>

function renderSQL(
  types: Record<TypeName, Fields>,
  q: Query,
  dialect: Dialect,
): string {
  switch (dialect) {
    case "sqlite":
      return renderSQLite(types, q)

    case "postgres":
      return renderPostgres(types, q)
  }
}

const defineDialect = (filePath: string): string =>
  `${filePath}: define at the top: \`responsibleSQL: dialect: sqlite | postgres\``

function compile(filePath: string, doc: ParsedYAML): CompiledYAML {
  const parseDialect = v.safeParse(ResponsibleSQL, doc.responsibleSQL)
  if (!parseDialect.success) throw new Error(defineDialect(filePath))
  const { dialect } = parseDialect.output

  const declaredTypes: Record<TypeName, Fields> = {}
  const resultTypes: Record<TypeName, Fields> = {}

  const queries = Array<OutputQuery>()

  for (const k in doc) {
    switch (true) {
      case isTaggedType(k):
        declaredTypes[toTypeName(k)] = doc[k]
        break

      case k === "responsibleSQL": {
        // already parsed
        break
      }

      default: {
        const q = doc[k]

        queries.push({
          name: k,
          sql: renderSQL(declaredTypes, q, dialect),
          params: paramTypes(q),
          result: q.result,
          type: queryType(q),
        })

        if (isObject(q.result)) {
          resultTypes[resultTypeName(k)] = q.result
        }
        break
      }
    }
  }

  return {
    types: { ...declaredTypes, ...resultTypes },
    queries,
    dialect,
  }
}

export const compileYAML = (filePath: string, s: string): CompiledYAML =>
  compile(
    filePath,
    yaml.parse(s, {
      strict: true,
      customTags: [
        {
          tag: TYPE_TAG,
          resolve: (typeName: TypeName): TaggedType => tagType(typeName),
        },
      ],
    }) as ParsedYAML,
  )
