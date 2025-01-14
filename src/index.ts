import * as util from "node:util"
import * as yaml from "yaml"
import formsYaml from "../examples/forms.yaml?raw" with { type: "text" }

type FieldName = `${string}${"?" | ""}`
type TypeName = string
type Fields = Readonly<Record<FieldName, TypeName>>

type Params = ReadonlyArray<TypeName> | Fields

type Result = TypeName | ReadonlyArray<TypeName> | Fields

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
type One = {
  one: SelectStr
  params?: Params
  result: Result
}
type Many = {
  many: SelectStr
  params?: Params
  result: Result
}
type Query = Insert | Exec | One | Many

const isInsert = (q: Query): q is Insert => "insert" in q
const isExec = (q: Query): q is Exec => "exec" in q
const isOne = (q: Query): q is One => "one" in q
const isMany = (q: Query): q is Many => "many" in q

const fieldName = (n: FieldName): string => n.replace("?", "")

const isOptional = (n: FieldName): n is `${string}?` => n.endsWith("?")

const fieldNames = (fields: Fields): readonly string[] =>
  Object.keys(fields).map(fieldName)

const allColumns = (fields: Fields): string => fieldNames(fields).join(", ")

function resultFields(
  structs: Map<string, Fields>,
  sql: string,
  result: Result,
): Fields {
  switch (true) {
    case typeof result === "string": {
      const struct = structs.get(result)
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
  structs: Map<string, Fields>,
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
}: Insert): `\nRETURNING ${string}` | "" {
  switch (true) {
    case result === "${params}":
      return `\nRETURNING ${allColumns(params)}`

    case !!result:
      return `\nRETURNING ${allColumns(result)}`

    default:
      return ""
  }
}

const isObject = (x: unknown): x is Record<PropertyKey, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x)

function renderSQL(structs: Map<string, Fields>, q: Query): string {
  switch (true) {
    case isInsert(q): {
      const cols = allColumns(q.params)
      const values = fieldNames(q.params)
        .map(x => `:${x}`)
        .join(", ")
      return `INSERT INTO ${q.insert} (${cols})\nVALUES (${values})${maybeReturning(q)}`
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

type ParsedYAML = {
  [k: TaggedType]: Fields
} & {
  [k: string]: Query
}

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

function resultType(name: string, q: Query): [TypeName, Fields?] {
  switch (true) {
    case !q.result:
      return ["void"]

    case typeof q.result === "string":
      return [q.result]

    case isObject(q.result):
      return [`${capitalize(name)}Result`, q.result]

    default: {
      if (q.result.length > 1) {
        throw new Error(
          `${name}: can't have multiple positional results. Either use an object or a single item to extract a column`,
        )
      }
      return [q.result.length ? q.result[0] : "void"]
    }
  }
}

type OutputQuery = {
  sql: string
  params: Params
  result: TypeName
}

type Output = {
  types: Map<TypeName, Fields>
  queries: ReadonlyArray<{ sql: string; params: Params; result: TypeName }>
}

function process(doc: ParsedYAML): Output {
  const declaredTypes = new Map<TypeName, Fields>()
  const resultTypes = new Map<TypeName, Fields>()

  const queries = Array<OutputQuery>()

  for (const k in doc) {
    if (isTaggedType(k)) {
      declaredTypes.set(toTypeName(k), doc[k])
    } else {
      const q = doc[k]
      const [name, fields] = resultType(k, q)
      queries.push({
        sql: renderSQL(declaredTypes, q),
        params: paramTypes(q),
        result: name,
      })
      if (fields) {
        resultTypes.set(name, fields)
      }
    }
  }

  return {
    types: new Map([...declaredTypes, ...resultTypes]),
    queries,
  }
}

const out = process(
  yaml.parse(formsYaml, {
    strict: true,
    customTags: [
      {
        tag: TYPE_TAG,
        resolve: (
          typeName: TypeName,
          _onError: (message: string) => void,
          _opts: yaml.ParseOptions,
        ): TaggedType => tagType(typeName),
      },
    ],
  }) as ParsedYAML,
)

console.log(util.inspect(out, { depth: null, colors: true }))
