import type { JSONSchema7 } from 'json-schema';
import { cloneDeep, pickBy } from 'lodash';
import {
  isArraySchema,
  isJSONSchema,
  isEnum,
  isBasicEditorSchema,
  isComplexEditorSchema,
  DandiModel,
  BasicSchema,
  BasicArraySchema,
  ComplexSchema,
} from './types';

export function computeBasicSchema(schema: JSONSchema7): JSONSchema7 {
  const newProperties = pickBy(schema.properties, (val): val is BasicSchema | BasicArraySchema => (
    isBasicEditorSchema(val)
  ));
  const newRequired = schema.required?.filter(
    (key) => Object.keys(newProperties).includes(key),
  ) || [];
  const newSchema = {
    ...schema,
    properties: newProperties,
    required: newRequired,
  };

  // Description isn't needed and just causes rendering issues
  delete newSchema.description;
  return newSchema;
}

export function computeComplexSchema(schema: JSONSchema7): JSONSchema7 {
  const newProperties = pickBy(schema.properties, (val): val is ComplexSchema => (
    isComplexEditorSchema(val)
  ));
  const newRequired = schema.required?.filter(
    (key) => Object.keys(newProperties).includes(key),
  ) || [];
  const newSchema = {
    ...schema,
    properties: newProperties,
    required: newRequired,
  };

  // Description isn't needed and just causes rendering issues
  delete newSchema.description;
  return newSchema;
}

export function populateEmptyArrays(schema: JSONSchema7, model: DandiModel) {
  // TODO: May need to create a similar function for objects

  if (schema.properties === undefined) { return; }

  const props = schema.properties;
  const arrayFields = Object.keys(props).filter(
    (key) => isArraySchema(props[key]),
  );

  arrayFields.forEach((key) => {
    if (model[key] === undefined || model[key] === null) {
      // eslint-disable-next-line no-param-reassign
      model[key] = [];
    }
  });
}

export function filterModelWithSchema(model: DandiModel, schema: JSONSchema7): DandiModel {
  const { properties } = schema;
  if (!properties) { return {}; }

  return Object.keys(model).filter(
    (key) => properties[key] !== undefined,
  ).reduce(
    (obj, key) => ({ ...obj, [key]: cloneDeep(model[key]) }),
    {},
  );
}

/**
   * Injects a `schemaKey` prop into a subschema's properties.
   * For use on schemas that may be possible chosen from a list of schemas (oneOf).
   * @param schema - The schema to inject the schemaKey into.
   * @param ID - The string to identify this subschema with.
   */
export function injectSchemaKey(schema: JSONSchema7, ID: string): JSONSchema7 {
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
export function wrapBasicSchema(schema: JSONSchema7, parentKey = ''): JSONSchema7 {
  const titlePrefix = parentKey ? `${parentKey} ` : '';
  const value: JSONSchema7 = {
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

export function adjustSchema(schema: JSONSchema7): JSONSchema7 {
  /* eslint-disable no-param-reassign */

  // Recurse into each object property
  const props = schema.properties;
  if (props) {
    Object.keys(props).forEach((key) => {
      const subschema = props[key];
      if (isJSONSchema(subschema)) {
        props[key] = adjustSchema(subschema);
      }
    });
  }

  // Recurse into each array entry
  const { items } = schema;
  if (items && isJSONSchema(items)) {
    schema.items = adjustSchema(items);
  }

  // Handle singular allOf
  if (schema.allOf && schema.allOf.length === 1 && isJSONSchema(schema.allOf[0])) {
    return adjustSchema(schema.allOf[0]);
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
      if (!isJSONSchema(subschema)) { return subschema; }

      // Recurse first
      let newSubSchema = adjustSchema(subschema);

      // If no title exists for the subschema, create one
      const arrayID = newSubSchema.title || `Schema ${i + 1} (${newSubSchema.type})`;
      newSubSchema = injectSchemaKey(newSubSchema, arrayID);

      if (isEnum(newSubSchema)) {
        newSubSchema = wrapBasicSchema(newSubSchema, schema.title);
      }

      return newSubSchema;
    });
  }

  /* eslint-enable no-param-reassign */
  return schema;
}

export function writeSubModelToMaster(
  subModel: DandiModel, subSchema: JSONSchema7, masterModel: DandiModel,
) {
  /* eslint-disable no-param-reassign */
  const propsToWrite = subSchema.properties;
  if (propsToWrite === undefined) { return; }

  Object.keys(propsToWrite).forEach((key) => {
    masterModel[key] = subModel[key];
  });

  /* eslint-enable no-param-reassign */
}

// export function setComplexModelValue(propKey: string, value: DandiModel) {
//   const modelVal = complexModel.value;
//   modelVal[propKey] = value;
//   complexModel.value = modelVal;
// }
