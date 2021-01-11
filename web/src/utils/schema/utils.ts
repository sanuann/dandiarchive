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

function handleObject(
  schema: ObjectSchema, model: DandiModelUnion | undefined,
): [JSONSchema7, DandiModelUnion | undefined] {
  const newModel: DandiModelUnion | undefined = clone(model);
  const newSchema: JSONSchema7 = clone(schema);

  const props = schema.properties;
  Object.keys(props).forEach((key) => {
    const subschema = props[key];
    const subModel = (model && !Array.isArray(model)) ? model[key] : undefined;

    if (isJSONSchema(subschema)) {
      const passModel = isDandiModelUnion(subModel) ? subModel : undefined;

      const [propEntry, modelEntry] = transformSchemaWithModel(subschema, passModel);
      newSchema.properties![key] = propEntry;
      if (passModel && isDandiModel(newModel)) {
        newModel[key] = modelEntry;
      } else if (subModel !== undefined) {
        (newModel as DandiModel)[key] = subModel;
      }
    }
  });

  return [newSchema, newModel];
}

function handleArray(
  schema: ArraySchema, model: DandiModelUnion | undefined,
): [JSONSchema7, DandiModelUnion | undefined] {
  const newModel: DandiModelUnion | undefined = clone(model);
  const newSchema: JSONSchema7 = clone(schema);
  const { items } = schema;

  if (!isJSONSchema(items)) {
    // Unhandled case https://json-schema.org/understanding-json-schema/reference/array.html#tuple-validation
    return [newSchema, newModel];
  }

  // Needs to be done in the event of no model entries
  let [newItems] = transformSchemaWithModel(items, undefined);

  if (Array.isArray(model) && isDandiModelArray(model)) {
    // TODO: Could be a map call
    model.forEach((entry, i) => {
      let newEntry;
      [newItems, newEntry] = transformSchemaWithModel(items, entry);
      if (newEntry !== undefined && isDandiModel(newEntry)) {
        (newModel as DandiModel[])[i] = newEntry;
      }
    });
  }

  newSchema.items = newItems;
  return [newSchema, newModel];
}

const unwrapBasicSchema: TransformFunction = (model) => model.value;
const removeSchemaKey: TransformFunction = (model) => {
  const newModel = { ...model };
  delete newModel.schemaKey;

  return newModel;
};

function handleCombinedSChema(
  schema: JSONSchema7, model: DandiModelUnion | undefined,
): [JSONSchema7, DandiModelUnion | undefined] {
  let newModel: DandiModelUnion | undefined = clone(model);
  const newSchema: JSONSchema7 = clone(schema);

  // Handle singular allOf
  if (isSingularAllOf(schema)) {
    let newSubSchema;
    [newSubSchema, newModel] = transformSchemaWithModel(schema.allOf[0], model);

    // Replace allOf with the schema itself
    delete newSchema.allOf;
    Object.assign(newSchema, newSubSchema);
  }

  // Change anyOf to oneOf
  if (schema.anyOf) {
    newSchema.oneOf = schema.anyOf;
    delete newSchema.anyOf;
  }

  // Base Case
  if (newSchema.oneOf) {
    // Required for editor to function properly
    newSchema.type = schema.type || 'object';
    newSchema.oneOf = newSchema.oneOf.map((subschema, i) => {
      if (!isJSONSchema(subschema)) { return subschema; }

      // Only adjust subschema
      let [newSubSchema] = transformSchemaWithModel(subschema, undefined);

      // If no title exists for the subschema, create one
      const arrayID = newSubSchema.title || `Schema ${i + 1} (${newSubSchema.type})`;

      // TODO: Need to add to transform table here
      newSubSchema = injectSchemaKey(newSubSchema, arrayID);

      if (isEnum(newSubSchema) || isBasicSchema(newSubSchema)) {
        // TODO: Need to add to transform table here
        newSubSchema = wrapBasicSchema(newSubSchema, schema.title);
      }

      return newSubSchema;
    });

    if (model !== undefined && isDandiModel(model)) {
      newModel = assignSubschemaToExistingModel(model, schema);
    }
  }

  return [newSchema, newModel];
}

export function transformSchemaWithModel(
  schema: JSONSchema7, model: DandiModelUnion | undefined,
): [JSONSchema7, DandiModelUnion | undefined] {
  let newModel: DandiModelUnion | undefined = clone(model);
  let newSchema: JSONSchema7 = clone(schema);

  // OBJECT HANDLER
  if (isObjectSchema(newSchema)) {
    [newSchema, newModel] = handleObject(newSchema, newModel);
  }

  // ARRAY HANDLER
  if (isArraySchema(newSchema)) {
    [newSchema, newModel] = handleArray(newSchema, newModel);
  }

  // COMBINED SCHEMA HANDLER
  if (isCombinedSchema(newSchema)) {
    [newSchema, newModel] = handleCombinedSChema(newSchema, newModel);
  }

  return [newSchema, newModel];
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
