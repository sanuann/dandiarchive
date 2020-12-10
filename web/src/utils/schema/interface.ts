import type { JSONSchema7 } from 'json-schema';

import {
  computed, ComputedRef, reactive, ref,
} from '@vue/composition-api';
import { cloneDeep } from 'lodash';

import { DandiModel } from './types';
import {
  computeBasicSchema,
  computeComplexSchema,
  filterModelWithSchema,
  adjustSchema,
  populateEmptyArrays,
} from './utils';

/**
 * Manages the interface between the source data/schema, and the changes necessary for it to
 * operate correctly with the Meditor.
 */
class EditorInterface {
  private readonly originalModel: DandiModel;
  private readonly originalSchema: JSONSchema7;

  schema: JSONSchema7;
  model: DandiModel;
  modelValid: ComputedRef<boolean>;

  basicSchema: ComputedRef<JSONSchema7>;
  basicModel: ComputedRef<DandiModel>;
  basicModelValid = ref(false);

  complexSchema: ComputedRef<JSONSchema7>;
  complexModel: ComputedRef<DandiModel>;
  complexModelValid = ref(false);
  complexModelValidation: Record<string, boolean> = {};

  constructor(schema: JSONSchema7, model: DandiModel) {
    this.originalSchema = schema;
    this.originalModel = model;

    this.schema = reactive(cloneDeep(schema)) as JSONSchema7;
    this.model = reactive(cloneDeep(model));

    this.processInitial();

    // Setup split schema
    this.basicSchema = computed(() => computeBasicSchema(this.schema));
    this.complexSchema = computed(() => computeComplexSchema(this.schema));

    this.basicModel = computed(() => filterModelWithSchema(this.model, this.basicSchema.value));
    this.complexModel = computed(() => filterModelWithSchema(this.model, this.complexSchema.value));

    this.modelValid = computed(() => this.basicModelValid.value && this.complexModelValid.value);
  }

  /**
   * Do any initial processing that may be necessary on the source model and schema.
   */
  processInitial(): void {
    adjustSchema(this.schema);
    populateEmptyArrays(this.schema, this.model);
  }
}

export default EditorInterface;
export {
  EditorInterface,
};
