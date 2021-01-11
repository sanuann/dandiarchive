import type { JSONSchema7 } from 'json-schema';

import { watchEffect } from '@vue/composition-api';
import { cloneDeep } from 'lodash';
import { DandiModel, TransformTable } from './types';
import {
  transformSchemaWithModel,
  populateEmptyArrays,
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

  /**
   * Do any processing that may be necessary on the source model and schema.
   */
  process(): void {
    // Since we're using this function at the root level, we can coerce it to DandiModel
    [this.schema, this.model] = (
      transformSchemaWithModel(this.schema, this.model) as [JSONSchema7, DandiModel]
    );

    if (this.model !== undefined) {
      populateEmptyArrays(this.schema, this.model);
    }
  }

  // Transform the model back to its original schema
  transformModel(): DandiModel {
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
