import Ajv from 'ajv';
import RefParser from '@apidevtools/json-schema-ref-parser';

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
  const ajv = new Ajv();
  const schemas = schema.anyOf || schema.oneOf;
  if (schemas) {
    return schemas.find((s) => ajv.compile(s)(data));
  }

  return ajv.compile(schema)(data);
}

/**
 * Assign a subschema (using schemaKey) to the data based on the available schemas
 * NOTE: This modifies the `data` parameter
 * @param {Object} data The data to modify
 * @param {Object} schema The schema containing the anyOf or oneOf
 */
function assignSubschemaToExistingData(data, schema) {
  const matchingSchema = findMatchingSchema(data, schema);
  if (!matchingSchema || !data.properties) { return data; }

  const { schemaKey } = matchingSchema.properties;
  if (matchingSchema && schemaKey) {
    // eslint-disable-next-line no-param-reassign
    data.properties.schemaKey = schemaKey.const;
  }

  return data;
}

export {
  resolveSchemaReferences,
  findMatchingSchema,
  assignSubschemaToExistingData,
};
