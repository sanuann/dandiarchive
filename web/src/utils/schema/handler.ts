import type { JSONSchema7 } from 'json-schema';

import { watchEffect } from '@vue/composition-api';
import { cloneDeep } from 'lodash';
import { DandiModel, isDandiModel } from './types';
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

  // TODO: Add definition table, to handle circular references
  // TODO: Add transition table to handle returning original model

  // Not guaranteed to be up to date, use getModel()
  model: DandiModel | undefined;
  schema: JSONSchema7;

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

  // Return the model after transforming it back to its original form
  getTransformedModel(): DandiModel | undefined {
    // TODO: Use transform table to fix model differences
    return this.model;
  }
}

export {
  // eslint-disable-next-line import/prefer-default-export
  SchemaHandler,
};
