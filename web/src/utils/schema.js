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
 * Returns an adjusted schema with fields/values that are required for the display component.
 * @param {Object} originSchema - The schema to modify
*/
function adjustSchemaForEditor(originSchema) {
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

  // TEST TODO: REMOVE
  // if (schema.items && schema.items.oneOf) {
  //   schema.items = schema.items.oneOf[0];
  //   // delete schema.items;
  // }

  // TEST TODO: REMOVE
  // if (schema.oneOf) {
  //   return schema.oneOf[0];
  // }

  return schema;
}

/**
 * Returns an adjusted model with fields/values that are required for the display component.
 * @param {Object} originModel - The model to modify.
 * @param {Object} schema - The schema to which the model belongs.
 */
function adjustModelForEditor(originModel, schema) {
  // TEMP
  return originModel;
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
  adjustSchemaForEditor,
  adjustModelForEditor,
  findMatchingSchema,
};
