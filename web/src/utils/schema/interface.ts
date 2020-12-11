import type { JSONSchema7 } from 'json-schema';

import Vue from 'vue';
import {
  computed, reactive, ref, ComputedRef, WritableComputedRef, watch, watchEffect,
} from '@vue/composition-api';
import { cloneDeep } from 'lodash';

import { DandiModel } from './types';
import {
  computeBasicSchema,
  computeComplexSchema,
  filterModelWithSchema,
  transformSchemaWithModel,
  populateEmptyArrays,
  writeSubModelToMaster,
  assignSubschemaToExistingModel,
} from './utils';

/**
 * Manages the interface between the source data/schema, and the changes necessary for it to
 * operate correctly with the Meditor.
 */
class EditorInterface {
  private readonly originalModel: DandiModel;
  private readonly originalSchema: JSONSchema7;

  // Not guaranteed to be up to date, use getModel()
  private model: DandiModel;

  basicModel: DandiModel;
  complexModel: DandiModel;

  schema: JSONSchema7;
  basicSchema: JSONSchema7;
  complexSchema: JSONSchema7;

  modelValid: ComputedRef<boolean>;
  basicModelValid = ref(false);

  complexModelValid: ComputedRef<boolean>;
  complexModelValidation: Record<string, boolean> = {};

  constructor(schema: JSONSchema7, model: DandiModel) {
    this.originalSchema = schema;
    this.originalModel = model;

    this.schema = cloneDeep(schema) as JSONSchema7;
    this.model = cloneDeep(model);

    this.processInitial();

    // Setup split schema
    this.basicSchema = computeBasicSchema(this.schema);
    this.complexSchema = computeComplexSchema(this.schema);

    this.basicModel = reactive(filterModelWithSchema(this.model, this.basicSchema));
    this.complexModel = reactive(filterModelWithSchema(this.model, this.complexSchema));

    this.modelValid = computed(() => this.basicModelValid.value && this.complexModelValid.value);
    this.complexModelValidation = reactive(Object.keys(this.complexModel).reduce(
      (obj, key) => ({ ...obj, [key]: ref(true) }), {},
    ));

    // TODO: This isn't properly reactive to changes in complexModelValidation
    this.complexModelValid = computed(() => Object.keys(this.complexModelValidation).every(
      (key) => !!this.complexModelValidation[key],
    ));
  }

  /**
   * Do any initial processing that may be necessary on the source model and schema.
   */
  processInitial(): void {
    // Since we're using this function at the root level, we can coerce it to DandiModel
    [this.schema, this.model] = transformSchemaWithModel(
      this.schema, this.model,
    ) as [JSONSchema7, DandiModel];
    populateEmptyArrays(this.schema, this.model);
  }

  syncModel() {
    writeSubModelToMaster(this.basicModel, this.basicSchema, this.model);
    writeSubModelToMaster(this.complexModel, this.complexSchema, this.model);
  }

  getModel(): DandiModel {
    this.syncModel();
    // TODO: Use transform table to fix model differences

    return this.model;
  }

  setComplexModelProp(propKey: string, value: DandiModel) {
    Vue.set(this.complexModel, propKey, value);
  }
}

export default EditorInterface;
export {
  EditorInterface,
};
