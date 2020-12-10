import type { JSONSchema7 } from 'json-schema';

import {
  computed, reactive, ref, ComputedRef, WritableComputedRef,
} from '@vue/composition-api';
import { cloneDeep } from 'lodash';

import { DandiModel } from './types';
import {
  computeBasicSchema,
  computeComplexSchema,
  filterModelWithSchema,
  adjustSchema,
  populateEmptyArrays,
  writeSubModelToMaster,
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
  basicModel: WritableComputedRef<DandiModel>;
  basicModelValid = ref(false);

  complexSchema: ComputedRef<JSONSchema7>;
  complexModel: WritableComputedRef<DandiModel>;
  complexModelValid: ComputedRef<boolean>;
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

    // TODO: Likely need to ditch computed models,
    // and just use functions that return the combined models.
    this.basicModel = computed({
      get: () => filterModelWithSchema(this.model, this.basicSchema.value),
      set: (val) => {
        console.log('WRITE TO BASIC MODEL');
        writeSubModelToMaster(val, this.basicSchema.value, this.model);
      },
    });

    // TODO: This setter isn't currently being called, because
    // individual properties are changed, instead of the whole thing.
    this.complexModel = computed({
      get: () => filterModelWithSchema(this.model, this.complexSchema.value),
      set: (val) => {
        console.log('COMPLEX', val);
        writeSubModelToMaster(val, this.complexSchema.value, this.model);
      },
    });

    this.modelValid = computed(() => this.basicModelValid.value && this.complexModelValid.value);
    this.complexModelValidation = reactive({});
    this.complexModelValid = computed(() => Object.keys(this.complexModelValidation).every(
      (key) => !!this.complexModelValidation[key],
    ));
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
