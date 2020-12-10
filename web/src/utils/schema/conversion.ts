import { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import {
  computed, ComputedRef, reactive,
} from '@vue/composition-api';
import { pickBy, cloneDeep } from 'lodash';

import {
  isBasicSchema,
  isBasicArraySchema,
  isComplexSchema,
  isArraySchema,
  isJSONSchema,
  isEnum,
  isDandiModel,
  DandiModel,
  BasicSchema,
  BasicArraySchema,
  ComplexSchema,
  JSONSchemaUnionType,
} from './types';

function computeBasicSchema(schema: JSONSchema7): JSONSchema7 {
  const newProperties = pickBy(schema.properties, (val): val is BasicSchema | BasicArraySchema => (
    isBasicSchema(val) || isBasicArraySchema(val)
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

function computeComplexSchema(schema: JSONSchema7): JSONSchema7 {
  const newProperties = pickBy(schema.properties, (val): val is ComplexSchema => (
    isComplexSchema(val)
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

function populateEmptyArrays(schema: JSONSchema7, model: DandiModel) {
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

/**
 * Injects a `schemaKey` prop into a subschema's properties.
 * For use on schemas that may be possible chosen from a list of schemas (oneOf).
 * @param schema - The schema to inject the schemaKey into.
 * @param ID - The string to identify this subschema with.
 */
function injectSchemaKey(schema: JSONSchema7, ID: string): JSONSchema7 {
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
function wrapBasicSchema(schema: JSONSchema7, parentKey = ''): JSONSchema7 {
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

function adjustSchema(schema: JSONSchema7): JSONSchema7 {
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
      const arrayID = newSubSchema.title || `Schema ${i + 1}`;
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

/**
 * Manages the interface between the source data/schema, and the changes necessary for it to
 * operate correctly with the Meditor.
 */
class EditorInterface {
  sourceModel: DandiModel;
  sourceSchema: JSONSchema7;

  basicModel: ComputedRef<DandiModel>;
  basicSchema: ComputedRef<JSONSchema7>;

  complexModel: ComputedRef<DandiModel>;
  complexSchema: ComputedRef<JSONSchema7>;

  constructor(schema: JSONSchema7, model: DandiModel) {
    this.sourceSchema = reactive(cloneDeep(schema)) as JSONSchema7;
    this.sourceModel = reactive(cloneDeep(model));

    this.processInitial();

    // Setup split schema
    this.basicSchema = computed(() => computeBasicSchema(this.sourceSchema));
    this.complexSchema = computed(() => computeComplexSchema(this.sourceSchema));

    // TODO: Pull out necessary items
    this.basicModel = computed(() => this.sourceModel);
    this.complexModel = computed(() => this.sourceModel);
  }

  /**
   * Do any initial processing that may be necessary on the source model and schema.
   */
  processInitial(): void {
    adjustSchema(this.sourceSchema);
    populateEmptyArrays(this.sourceSchema, this.sourceModel);
  }

  // getModel() {}
}

export default EditorInterface;
export {
  EditorInterface,
};
