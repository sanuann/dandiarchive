import Ajv from 'ajv';
import RefParser from '@apidevtools/json-schema-ref-parser';
import { cloneDeep } from 'lodash';

const schemaRelease = process.env.VUE_APP_DANDISET_SCHEMA_RELEASE || '1.0.0-rc1';
const dandisetSchemaURL = `https://raw.githubusercontent.com/dandi/schema/master/releases/${schemaRelease}/dandiset.json`;

const basicTypes = ['number', 'integer', 'string', 'boolean', 'null'];
const isBasicType = (type) => basicTypes.includes(type);

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

/**
 * Injects a `schemaKey` prop into a subschema's properties.
 * For use on schemas that may be possible chosen from a list of schemas (oneOf).
 * @param {Object} schema - The schema to inject the schemaKey into.
 * @param {String} ID - The string to identify this subschema with.
 */
function injectSchemaKey(schema, ID) {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      schemaKey: {
        type: 'string',
        const: ID,
      },
    },
    title: ID,
  };
}

/**
 * Wraps a basic schema so that it may be selected from a list of schemas.
 */
function wrapBasicSchema(schema, parentKey = '') {
  const titlePrefix = parentKey ? `${parentKey} ` : '';
  const value = {
    title: `${titlePrefix}Value`,
    type: schema.type,
  };

  if (schema.enum) {
    value.enum = schema.enum;
  }

  return {
    type: 'object',
    title: schema.title,
    properties: {
      ...schema.properties,
      value,
    },
  };
}

/**
 * Returns an adjusted schema with fields/values that are required for the display component.
 * @param {Object} originSchema - The schema to modify
 * @param {Object} originModel - Optionally include the corresponding model, which will have
 * changes done to it in-place to match the schema
*/
function adjustSchemaForEditor(originSchema, originModel = {}) {
  const schema = cloneDeep(originSchema);

  // Recurse into each object property
  if (schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      schema.properties[key] = adjustSchemaForEditor(schema.properties[key], originModel[key]);
    });
  }

  // Recurse into each array entry
  if (schema.items) {
    schema.items = adjustSchemaForEditor(schema.items, originModel);
  }

  // Handle singular allOf
  if (schema.allOf && schema.allOf.length === 1) {
    return adjustSchemaForEditor(schema.allOf[0], originModel);
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
      // Recurse first
      let newSubSchema = adjustSchemaForEditor(subschema, originModel);

      // If no title exists for the subschema, create one
      const arrayID = newSubSchema.title || `Schema ${i + 1}`;
      newSubSchema = injectSchemaKey(newSubSchema, arrayID);

      if (isBasicType(newSubSchema.type) || newSubSchema.enum) {
        newSubSchema = wrapBasicSchema(newSubSchema, schema.title);
      }

      return newSubSchema;
    });
  }

  // TODO: Modify model here if supplied
  // Among other things, needs to coerce data schema
  // selection with assignSubschemaToExistingData
  return schema;
}

export {
  dandisetSchemaURL,
  basicTypes,
  isBasicType,
  resolveSchemaReferences,
  findMatchingSchema,
  assignSubschemaToExistingData,
  adjustSchemaForEditor,
};
