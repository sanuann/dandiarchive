/* eslint-disable no-use-before-define */
import type { JSONSchema7 } from 'json-schema';

import Ajv from 'ajv';
import { clone, cloneDeep, pickBy } from 'lodash';
import {
  TransformFunction,
  isArraySchema,
  isJSONSchema,
  isEnum,
  isBasicEditorSchema,
  isComplexEditorSchema,
  isDandiModel,
  DandiModel,
  BasicSchema,
  BasicArraySchema,
  ComplexSchema,
  isBasicSchema,
  isDandiModelUnion,
  DandiModelUnion,
  isDandiModelArray,
  isObjectSchema,
  ObjectSchema,
  ArraySchema,
  isCombinedSchema,
  isSingularAllOf,
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
  * Takes a schema of a primitive type (e.g. string), and wraps this schema
  * with an object, so that it may be selected from a list of schemas.
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

/**
 * This function returns a schema that matches the supplied data, taking into account anyOf/oneOf.
 * If no schema is matched, undefined is returned.
 */
export function findMatchingSchema(
  model: DandiModel, schema: JSONSchema7,
): JSONSchema7 | undefined {
  const ajv = new Ajv();
  const schemas = (schema.anyOf || schema.oneOf) as JSONSchema7[];
  if (schemas) {
    return schemas.find((s) => ajv.compile(s)(model));
  }

  return ajv.compile(schema)(model) ? schema : undefined;
}

/**
 * Assign a subschema (using schemaKey) to the data based on the available schemas
 * @param model - The model that should match the schema
 * @param schema - The schema that contains the definition of oneOf/anyOf
 */
export function assignSubschemaToExistingModel(model: DandiModel, schema: JSONSchema7): DandiModel {
  const matchingSchema = findMatchingSchema(model, schema);
  const schemaKey = matchingSchema?.properties?.schemaKey;

  if (
    !matchingSchema
    || !schemaKey
    || !isJSONSchema(schemaKey)
    || matchingSchema.properties === undefined
  ) { return model; }

  return {
    ...model,
    schemaKey: schemaKey.const,
  };
}

export const unwrapBasicSchema: TransformFunction = (model) => model.value;
export const removeSchemaKey: TransformFunction = (model) => {
  const newModel = { ...model };
  delete newModel.schemaKey;

  return newModel;
};

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
