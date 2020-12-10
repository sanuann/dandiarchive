import type { JSONSchema7, JSONSchema7Definition, JSONSchema7TypeName } from 'json-schema';

export type DandiModel = Record<string, unknown>

export type JSONSchemaUnionType = JSONSchema7Definition | JSONSchema7Definition[];
export type JSONSchemaTypeNameUnion = JSONSchema7TypeName | JSONSchema7TypeName[] | undefined;
export type BasicTypeName = 'number' | 'integer' | 'string' | 'boolean' | 'null';
export type ComplexTypeName = 'object' | 'array';

export interface BasicSchema extends JSONSchema7 {
  type: BasicTypeName;

  // There's likely more fields we can narrow to undefined
  items: undefined;
}

export interface ComplexSchema extends JSONSchema7 {
  type: ComplexTypeName
}

export interface BasicArraySchema extends JSONSchema7 {
  type: 'array';
  items: BasicSchema
}

export const basicTypes = ['number', 'integer', 'string', 'boolean', 'null'];
export const isJSONSchema = (schema: JSONSchemaUnionType): schema is JSONSchema7 => (
  typeof schema !== 'boolean'
  && !Array.isArray(schema)
);

export const isBasicType = (type: JSONSchemaTypeNameUnion): type is BasicTypeName => (
  type !== undefined
  && !Array.isArray(type)
  && basicTypes.includes(type)
);

export const isBasicSchema = (schema: JSONSchemaUnionType): schema is BasicSchema => (
  isJSONSchema(schema)
  && isBasicType(schema.type)
);

export const isComplexSchema = (schema: JSONSchemaUnionType):schema is ComplexSchema => (
  !isBasicSchema(schema)
);

export const isArraySchema = (schema: JSONSchemaUnionType): schema is BasicArraySchema => (
  isJSONSchema(schema)
  && schema.items !== undefined
  && schema.type === 'array'
);

export const isBasicArraySchema = (schema: JSONSchemaUnionType): schema is BasicArraySchema => (
  isArraySchema(schema) && isBasicSchema(schema.items)
);

export const isEnum = (schema: JSONSchemaUnionType): boolean => (
  isBasicSchema(schema) && schema.enum !== undefined
);

export const isDandiModel = (given: unknown): given is DandiModel => (
  typeof given === 'object' && given !== null && !Array.isArray(given)
);
