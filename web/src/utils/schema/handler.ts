import type { JSONSchema7 } from 'json-schema';

import { watchEffect } from '@vue/composition-api';
import { clone, cloneDeep } from 'lodash';
import {
  ArraySchema,
  DandiModel,
  DandiModelUnion,
  isArraySchema,
  isBasicSchema,
  isCombinedSchema,
  isDandiModel,
  isDandiModelArray,
  isDandiModelUnion,
  isEnum,
  isJSONSchema,
  isObjectSchema,
  isSingularAllOf,
  ObjectSchema,
  TransformFunction,
  TransformTable,
} from './types';
import {
  assignSubschemaToExistingModel,
  injectSchemaKey,
  populateEmptyArrays,
  wrapBasicSchema,
} from './utils';

/**
 * Manages the interface between the source data/schema, and the changes necessary for it to
 * operate correctly with the Meditor.
 */
class SchemaHandler {
  private readonly originalModel: DandiModel | undefined;
  private readonly originalSchema: JSONSchema7;

  // Not guaranteed to be up to date, use getModel()
  model: DandiModel | undefined;
  schema: JSONSchema7;

  // TODO: Add definition table, to handle circular references
  transformTable: TransformTable = new Map();

  constructor(schema: JSONSchema7, model: DandiModel | undefined = undefined) {
    this.originalSchema = schema;
    this.schema = cloneDeep(schema);
    this.model = cloneDeep(model);

    watchEffect(() => this.process());
  }

  handleObject(
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

        const [propEntry, modelEntry] = this.transformSchemaWithModel(subschema, passModel);
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

  handleArray(
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
    let [newItems] = this.transformSchemaWithModel(items, undefined);

    if (Array.isArray(model) && isDandiModelArray(model)) {
      // TODO: Could be a map call
      model.forEach((entry, i) => {
        let newEntry;
        [newItems, newEntry] = this.transformSchemaWithModel(items, entry);
        if (newEntry !== undefined && isDandiModel(newEntry)) {
          (newModel as DandiModel[])[i] = newEntry;
        }
      });
    }

    newSchema.items = newItems;
    return [newSchema, newModel];
  }

  unwrapBasicSchema: TransformFunction = (model) => model.value;
  removeSchemaKey: TransformFunction = (model) => {
    const newModel = { ...model };
    delete newModel.schemaKey;

    return newModel;
  };

  handleCombinedSChema(
    schema: JSONSchema7, model: DandiModelUnion | undefined,
  ): [JSONSchema7, DandiModelUnion | undefined] {
    let newModel: DandiModelUnion | undefined = clone(model);
    const newSchema: JSONSchema7 = clone(schema);

    // Handle singular allOf
    if (isSingularAllOf(schema)) {
      let newSubSchema;
      [newSubSchema, newModel] = this.transformSchemaWithModel(schema.allOf[0], model);

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
        let [newSubSchema] = this.transformSchemaWithModel(subschema, undefined);

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

  transformSchemaWithModel(
    schema: JSONSchema7, model: DandiModelUnion | undefined,
  ): [JSONSchema7, DandiModelUnion | undefined] {
    let newModel: DandiModelUnion | undefined = clone(model);
    let newSchema: JSONSchema7 = clone(schema);

    // OBJECT HANDLER
    if (isObjectSchema(newSchema)) {
      [newSchema, newModel] = this.handleObject(newSchema, newModel);
    }

    // ARRAY HANDLER
    if (isArraySchema(newSchema)) {
      [newSchema, newModel] = this.handleArray(newSchema, newModel);
    }

    // COMBINED SCHEMA HANDLER
    if (isCombinedSchema(newSchema)) {
      [newSchema, newModel] = this.handleCombinedSChema(newSchema, newModel);
    }

    return [newSchema, newModel];
  }

  /**
   * Do any processing that may be necessary on the source model and schema.
   */
  process(): void {
    // Since we're using this function at the root level, we can coerce it to DandiModel
    [this.schema, this.model] = (
      this.transformSchemaWithModel(this.schema, this.model) as [JSONSchema7, DandiModel]
    );

    if (this.model !== undefined) {
      populateEmptyArrays(this.schema, this.model);
    }
  }

  // Transform the model back to its original schema
  transformModel(): DandiModel | undefined {
    // TODO: Use transform table to fix model differences
    // 1. Remove all uses of `schemaKey`
    // 2. Unwrap basic schemas

    const newModel: DandiModel = cloneDeep(this.model) as DandiModel;

    this.transformTable.forEach((transform, pathStr) => {
      const pathArray = pathStr.split('.');
      const lastKey = pathStr.slice(-1)[0];
      const parent = pathArray.slice(0, -1).reduce(
        (obj, key) => (obj[key] as DandiModel), newModel,
      );

      // Needs to be done this way to assign new value
      parent[lastKey] = transform(parent[lastKey] as DandiModel);
    });

    return newModel;
  }
}

export {
  // eslint-disable-next-line import/prefer-default-export
  SchemaHandler,
};
