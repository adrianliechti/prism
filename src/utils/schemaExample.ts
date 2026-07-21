export function buildSchemaExample(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return {};
  const s = schema as Record<string, unknown>;

  if (s.default !== undefined) return s.default;

  const resolvedType = Array.isArray(s.type) ? s.type[0] : s.type;
  const type = resolvedType || (s.properties ? 'object' : s.items ? 'array' : undefined);

  if (type === 'object') {
    const result: Record<string, unknown> = {};
    const props = (s.properties || {}) as Record<string, unknown>;
    Object.keys(props).forEach((key) => {
      result[key] = buildSchemaExample(props[key]);
    });
    return result;
  }

  if (type === 'array') {
    const itemSchema = s.items || { type: 'string' };
    return [buildSchemaExample(itemSchema)];
  }

  const enumVal = s.enum as unknown[] | undefined;
  if (enumVal && enumVal.length > 0) return enumVal[0];

  switch (type) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'string':
      return s.format === 'byte' ? '' : 'string';
    default:
      return {};
  }
}
