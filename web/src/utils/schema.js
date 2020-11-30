import Ajv from 'ajv';
import RefParser from '@apidevtools/json-schema-ref-parser';
import { cloneDeep } from 'lodash';

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

/**
 * Assign a subschema (using schemaKey) to the data based on the available schemas
 * NOTE: This modifies the `data` parameter
 * @param {Object} data The data to modify
 * @param {Object} schema The schema containing the anyOf or oneOf
 */
function assignSubschemaToExistingData(data, schema) {
  const matchingSchema = findMatchingSchema(data, schema);
  const { schemaKey } = matchingSchema.properties;

  if (matchingSchema && schemaKey) {
    // eslint-disable-next-line no-param-reassign
    data.properties.schemaKey = schemaKey.const;
  }

  return data;
}

/**
 * Returns an adjusted schema with fields/values that are required for the display component.
 * @param {Object} originSchema - The schema to modify
 * @param {Object} originModel - Optionally include the corresponding model, which will have
 * changes done to it in-place to match the schema
*/
function adjustSchemaForEditor(originSchema, originModel = undefined) {
  const schema = cloneDeep(originSchema);

  // Recurse into each object property
  if (schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      schema.properties[key] = adjustSchemaForEditor(schema.properties[key]);
    });
  }

  // Recurse into each array entry
  if (schema.items) {
    schema.items = adjustSchemaForEditor(schema.items);
  }

  // Handle singular allOf
  if (schema.allOf && schema.allOf.length === 1) {
    return adjustSchemaForEditor(schema.allOf[0]);
  }

  // Change anyOf to oneOf
  if (schema.anyOf) {
    schema.oneOf = schema.anyOf;
    delete schema.anyOf;
  }

  // Base Case
  if (schema.oneOf) {
    // Required for editor to function properly
    schema.type = schema.type || 'object';
    schema.oneOf = schema.oneOf.map((subschema, i) => {
      const newSubSchema = adjustSchemaForEditor(subschema);

      // If no title exists for the subschema, create one
      const arrayID = newSubSchema.title || `Schema ${i + 1}`;

      // TODO: Modify model here if supplied

      return {
        ...newSubSchema,
        properties: {
          ...newSubSchema.properties,
          schemaKey: {
            type: 'string',
            const: arrayID,
          },
        },
        title: arrayID,
      };
    });
  }

  return schema;
}

export {
  resolveSchemaReferences,
  findMatchingSchema,
  assignSubschemaToExistingData,
  adjustSchemaForEditor,
};
