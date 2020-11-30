import Ajv from 'ajv';
import RefParser from '@apidevtools/json-schema-ref-parser';

const ajv = new Ajv();

async function resolveSchemaReferences(schema) {
  // TEMPORARY: Remove known circular references

  /* eslint-disable no-param-reassign */
  delete schema.definitions.PropertyValue.properties.valueReference;
  delete schema.definitions.Activity.properties.isPartOf;
  delete schema.definitions.Activity.properties.hasPart;
  /* eslint-enable no-param-reassign */

  return RefParser.dereference(schema, { dereference: { circular: false } });
}

/**
 * This function returns a schema that matches the supplied data, taking into account anyOf/oneOf.
 * If no schema is matched, undefined is returned.
 *
 * @param {Object} data The underlying data
 * @param {Object} schema The schema at the corresponding level
 */
function findMatchingSchema(data, schema) {
  const schemas = schema.anyOf || schema.oneOf;
  if (schemas) {
    return schemas.find((s) => ajv.compile(s)(data));
  }

  return ajv.compile(schema)(data);
}

export {
  resolveSchemaReferences,
  findMatchingSchema,
};
