<template>
  <v-container>
    <v-row>
      <v-snackbar
        v-model="invalidPermissionSnackbar"
        top
        :timeout="2000"
        color="error"
      >
        Save Failed: Insufficient Permissions
        <v-btn
          icon
          @click="invalidPermissionSnackbar = false"
        >
          <v-icon color="white">
            mdi-close-circle
          </v-icon>
        </v-btn>
      </v-snackbar>

      <v-col>
        <v-card class="mb-2">
          <v-card-title>
            <v-tooltip top>
              <template v-slot:activator="{ on }">
                <v-icon
                  left
                  :color="allModelsValid ? 'success' : 'error'"
                  v-on="on"
                >
                  <template v-if="allModelsValid">
                    mdi-checkbox-marked-circle
                  </template>
                  <template v-else>
                    mdi-alert-circle
                  </template>
                </v-icon>
              </template>
              <template v-if="allModelsValid">
                All metadata for this dandiset is valid.
              </template>
              <template v-else>
                There are errors in the metadata for this Dandiset.
              </template>
            </v-tooltip>
            {{ data.name }}
          </v-card-title>
          <v-card-actions class="pt-0">
            <v-tooltip bottom>
              <template v-slot:activator="{ on }">
                <v-btn
                  icon
                  color="secondary"
                  v-on="on"
                  @click="closeEditor"
                >
                  <v-icon>
                    mdi-arrow-left
                  </v-icon>
                </v-btn>
              </template>
              <span>Cancel</span>
            </v-tooltip>
            <v-tooltip bottom>
              <template v-slot:activator="{ on }">
                <v-btn
                  icon
                  color="primary"
                  v-on="on"
                  @click="save"
                >
                  <v-icon>
                    mdi-content-save
                  </v-icon>
                </v-btn>
              </template>
              <span>Save</span>
            </v-tooltip>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
    <v-row>
      <v-subheader>Click a field below to edit it.</v-subheader>
    </v-row>
    <v-row class="px-2">
      <template v-for="propKey in Object.keys(complexSchema.properties)">
        <v-dialog
          v-if="renderField(complexSchema.properties[propKey])"
          :key="propKey"
        >
          <template v-slot:activator="{ on }">
            <v-btn
              outlined
              class="mx-2 my-2"
              :color="sectionButtonColor(propKey)"
              v-on="on"
            >
              {{ complexSchema.properties[propKey].title || propKey }}
            </v-btn>
          </template>
          <v-card class="pa-2 px-4">
            <v-form
              :ref="`${propKey}-form`"
              v-model="complexModelValidation[propKey]"
            >
              <v-jsf
                v-model="complexModel[propKey]"
                :schema="schema.properties[propKey]"
                :options="CommonVJSFOptions"
              />
            </v-form>
          </v-card>
        </v-dialog>
      </template>
    </v-row>
    <v-divider class="my-5" />
    <v-row class="px-2">
      <v-form
        ref="basic-form"
        v-model="basicModelValid"
      >
        <v-jsf
          v-model="basicModel"
          :schema="basicSchema"
          :options="{...CommonVJSFOptions, hideReadOnly: true}"
        />
      </v-form>
    </v-row>
  </v-container>
</template>

<script>
import { mapState, mapMutations } from 'vuex';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';
import { cloneDeep, pickBy } from 'lodash';

import { girderRest } from '@/rest';
import { isBasicType } from '@/utils/schema';

import VJsf from '@koumoul/vjsf/lib/VJsf';
import '@koumoul/vjsf/lib/deps/third-party';
import '@koumoul/vjsf/lib/VJsf.css';

const ajv = new Ajv({ allErrors: true });

export default {
  components: {
    VJsf,
  },
  props: {
    schema: {
      type: Object,
      required: true,
    },
    model: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      valid: false,
      yamlOutput: true,
      errors: [],
      data: this.copyValue(this.model),
      invalidPermissionSnackbar: false,
      basicModel: {},
      complexModel: {},
      basicModelValid: null,
      complexModelValidation: {},
      CommonVJSFOptions: {
        initialValidation: 'all',
      },
    };
  },
  computed: {
    basicSchema() {
      const schema = cloneDeep(this.schema);
      const newProperties = pickBy(schema.properties, (val) => (
        isBasicType(val.type)
        || (val.items && isBasicType(val.items.type))
        || (val.items && val.items.enum)
      ));
      const newRequired = schema.required.filter((key) => Object.keys(newProperties).includes(key));

      schema.properties = newProperties;
      schema.required = newRequired;
      delete schema.description;

      return schema;
    },
    complexSchema() {
      const schema = cloneDeep(this.schema);
      const { basicSchema } = this;

      delete schema.description;
      Object.keys(schema.properties).forEach((key) => {
        if (basicSchema.properties[key]) {
          delete schema.properties[key];

          const requiredIndex = schema.required.findIndex((el) => el === key);
          if (requiredIndex >= 0) {
            schema.required.splice(requiredIndex, 1);
          }
        }
      });

      return schema;
    },
    validate() {
      return ajv.compile(this.schema);
    },
    allModelsValid() {
      return this.basicModelValid && Object.keys(this.complexModelValidation).every(
        (key) => !!this.complexModelValidation[key],
      );
    },
    contentType() {
      return this.yamlOutput ? 'text/yaml' : 'application/json';
    },
    output() {
      return this.yamlOutput ? jsYaml.dump(this.data) : JSON.stringify(this.data, null, 2);
    },
    ...mapState('dandiset', {
      id: (state) => (state.girderDandiset ? state.girderDandiset._id : null),
    }),
  },
  watch: {
    data: {
      handler(val) {
        this.validate(val);
        this.errors = this.validate.errors;
      },
      deep: true,
    },
  },
  created() {
    this.validate(this.data);
    this.errors = this.validate.errors;

    const fixedModel = this.ensurePopulatedArrays(this.schema, this.model);
    this.setModels(fixedModel);
  },
  methods: {
    renderField(schema) {
      const props = schema.properties;

      if (schema.readOnly) { return false; }
      if (props && Object.keys(props).every((key) => props[key].readOnly)) {
        return false;
      }

      return true;
    },
    setModels(model) {
      const basicFields = Object.keys(this.basicSchema.properties);
      const basicModel = cloneDeep(model);
      const complexModel = cloneDeep(model);

      Object.keys(model).forEach((key) => {
        if (!basicFields.includes(key)) {
          delete basicModel[key];
        } else {
          delete complexModel[key];
        }
      });

      // TODO: Move schema resolution to here instead of store

      this.basicModel = basicModel;
      this.complexModel = complexModel;
    },
    closeEditor() {
      this.$emit('close');
    },

    /*
      Returns a new model with all fields of type 'array' populated with an empty array
     */
    ensurePopulatedArrays(schema, model) {
      // TODO: May need to include objects in this as well.
      const newModel = cloneDeep(model);
      const arrayFields = Object.keys(schema.properties).filter((key) => schema.properties[key].type === 'array');

      arrayFields.forEach((key) => {
        if (newModel[key] === undefined || newModel[key] === null) {
          newModel[key] = [];
        }
      });

      return newModel;
    },
    combineModels() {
      return { ...cloneDeep(this.basicModel), ...cloneDeep(this.complexModel) };
    },
    sectionButtonColor(propKey) {
      const valid = this.complexModelValidation[propKey];
      if (valid !== undefined && !valid) {
        return 'error';
      }

      return undefined;
    },
    async save() {
      const dandiset = this.combineModels();

      try {
        const { status, data } = await girderRest.put(`folder/${this.id}/metadata`, { dandiset });
        if (status === 200) {
          this.setGirderDandiset(data);
          this.closeEditor();
        }
      } catch (error) {
        if (error.response.status === 403) {
          this.invalidPermissionSnackbar = true;
        }

        throw error;
      }
    },
    errorMessage(error) {
      const path = error.dataPath.substring(1);
      let message = `${path} ${error.message}`;

      if (error.keyword === 'const') {
        message += `: ${error.params.allowedValue}`;
      }

      return message;
    },
    copyValue(val) {
      if (val instanceof Object && !Array.isArray(val)) {
        return { ...val };
      }
      return val.valueOf();
    },
    download() {
      const blob = new Blob([this.output], { type: this.contentType });

      const extension = this.contentType.split('/')[1];
      const filename = `dandiset.${extension}`;
      const link = document.createElement('a');

      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    ...mapMutations('dandiset', ['setGirderDandiset']),
  },
};
</script>
