import * as yaml from "yaml"
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

type Insert = Readonly<{
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
type Query = Insert | Exec | One | Many

const isInsert = (q: Query): q is Insert => "insert" in q
const isExec = (q: Query): q is Exec => "exec" in q
const isOne = (q: Query): q is One => "one" in q
const isMany = (q: Query): q is Many => "many" in q

const fieldName = (n: FieldName): string => n.replace("?", "")

const _isOptional = (n: FieldName): n is `${string}?` => n.endsWith("?")

const fieldNames = (fields: Fields): readonly string[] =>
  Object.keys(fields).map(fieldName)

const allColumns = (fields: Fields): string => fieldNames(fields).join(", ")

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

const expandResult = (
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

function maybeReturning({
  params,
  result,
}: Insert): `RETURNING ${string}` | "" {
  switch (true) {
    case result === "${params}":
      return `RETURNING ${allColumns(params)}`

    case !!result:
      return `RETURNING ${allColumns(result)}`

    default:
      return ""
  }
}

function renderSQL(structs: Record<string, Fields>, q: Query): string {
  switch (true) {
    case isInsert(q): {
      const cols = allColumns(q.params)
      const values = fieldNames(q.params)
        .map(x => `:${x}`)
        .join(", ")

      return `
INSERT INTO ${q.insert} (${cols})
VALUES (${values})
${maybeReturning(q)}
`
    }

    case isExec(q):
      return q.exec

    case isOne(q):
      return expandResult(structs, q.one, q.result)

    case isMany(q):
      return expandResult(structs, q.many, q.result)

    default:
      throw new Error(`Invalid query: ${JSON.stringify(q, null, 2)}`)
  }
}

const TYPE_TAG = "!type"
type TaggedType = `${typeof TYPE_TAG}${string}`
const isTaggedType = (s: string): s is TaggedType => s.startsWith(TYPE_TAG)
const tagType = (s: TypeName): TaggedType => `${TYPE_TAG}${s}`
const toTypeName = (s: TaggedType): TypeName => s.slice(TYPE_TAG.length)

type ParsedYAML = Readonly<
  {
    [k: TaggedType]: Fields
  } & {
    [k: string]: Query
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
  types: Readonly<Record<TypeName, Fields>>
  queries: ReadonlyArray<OutputQuery>
}>

function compile(doc: ParsedYAML): CompiledYAML {
  const declaredTypes: Record<TypeName, Fields> = {}
  const resultTypes: Record<TypeName, Fields> = {}

  const queries = Array<OutputQuery>()

  for (const k in doc) {
    if (isTaggedType(k)) {
      declaredTypes[toTypeName(k)] = doc[k]
    } else {
      const q = doc[k]

      queries.push({
        name: k,
        sql: renderSQL(declaredTypes, q),
        params: paramTypes(q),
        result: q.result,
        type: queryType(q),
      })

      if (isObject(q.result)) {
        resultTypes[resultTypeName(k)] = q.result
      }
    }
  }

  return {
    types: { ...declaredTypes, ...resultTypes },
    queries,
  }
}

export const compileYAML = (s: string): CompiledYAML =>
  compile(
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
