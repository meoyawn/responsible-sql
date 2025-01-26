import { allColumns, type Insert } from "../compile"

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

export const renderInsert = (q: Insert, values: string): string => `
INSERT INTO ${q.insert} (${allColumns(q.params)})
VALUES (${values})
${maybeReturning(q)}
`
